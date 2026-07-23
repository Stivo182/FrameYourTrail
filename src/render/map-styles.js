import { sanitizeMapLibreStyleFilters } from "./maplibre-style-filters.js";
import { getMapTextLabelBoundaryIndex } from "./map-style-layer-order.js";
import { applyPosterBackgroundMapPalette } from "./openfreemap-poster-style.js";

export { getMapTextLabelBoundaryIndex, sanitizeMapLibreStyleFilters };

const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_STYLE_FETCH_TIMEOUT_MS = 12000;

export const DEFAULT_MAP_STYLE_ID = "openfreemap_poster";

export const MAP_STYLE_OPTIONS = Object.freeze([
  Object.freeze({
    id: DEFAULT_MAP_STYLE_ID,
    kind: "vector",
    labelKey: "mapStyle.styles.openfreemap_poster.label",
    descriptionKey: "mapStyle.styles.openfreemap_poster.description"
  }),
  Object.freeze({
    id: "osm_standard",
    kind: "raster",
    labelKey: "mapStyle.styles.osm_standard.label",
    descriptionKey: "mapStyle.styles.osm_standard.description"
  }),
  Object.freeze({
    id: "cyclosm",
    kind: "raster",
    labelKey: "mapStyle.styles.cyclosm.label",
    descriptionKey: "mapStyle.styles.cyclosm.description"
  })
]);

const MAP_STYLE_DEFINITIONS = Object.freeze({
  [DEFAULT_MAP_STYLE_ID]: Object.freeze({
    id: DEFAULT_MAP_STYLE_ID,
    kind: "vector",
    styleUrl: OPENFREEMAP_STYLE_URL
  }),
  osm_standard: Object.freeze({
    id: "osm_standard",
    kind: "raster",
    sourceId: "osm-standard-raster",
    tiles: Object.freeze(["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]),
    tileSize: 256,
    maxzoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }),
  cyclosm: Object.freeze({
    id: "cyclosm",
    kind: "raster",
    sourceId: "cyclosm-raster",
    tiles: Object.freeze([
      "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      "https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
    ]),
    tileSize: 256,
    maxzoom: 20,
    attribution: "&copy; OpenStreetMap contributors | Tiles style: CyclOSM"
  })
});

/** @type {Promise<import("maplibre-gl").StyleSpecification> | undefined} */
let openFreeMapStylePromise;

/**
 * @param {unknown} styleId
 */
export function normalizeMapStyleId(styleId) {
  if (typeof styleId !== "string") {
    return DEFAULT_MAP_STYLE_ID;
  }

  if (Object.hasOwn(MAP_STYLE_DEFINITIONS, styleId)) {
    return styleId;
  }

  return DEFAULT_MAP_STYLE_ID;
}

/**
 * @param {unknown} styleId
 */
export function getMapStyleDefinition(styleId) {
  return MAP_STYLE_DEFINITIONS[normalizeMapStyleId(styleId)];
}

/**
 * @param {unknown} styleId
 * @param {{ timeoutMs?: number, setTimeout?: typeof globalThis.setTimeout, clearTimeout?: typeof globalThis.clearTimeout, fetcher?: typeof fetch }} [options]
 */
export async function loadMapStyle(styleId, options = {}) {
  const definition = getMapStyleDefinition(styleId);

  if (definition.kind === "raster") {
    return cloneMapLibreStyle(createRasterMapLibreStyle(definition));
  }

  return loadOpenFreeMapPosterStyle(options);
}

/**
 * @param {{ timeoutMs?: number, setTimeout?: typeof globalThis.setTimeout, clearTimeout?: typeof globalThis.clearTimeout, fetcher?: typeof fetch }} [options]
 */
async function loadOpenFreeMapPosterStyle(options = {}) {
  if (hasCustomStyleLoadOptions(options)) {
    return cloneMapLibreStyle(await fetchOpenFreeMapPosterStyle(options));
  }

  openFreeMapStylePromise ??= fetchOpenFreeMapPosterStyle().catch((error) => {
    openFreeMapStylePromise = undefined;
    throw error;
  });

  return cloneMapLibreStyle(await openFreeMapStylePromise);
}

/**
 * @param {{ timeoutMs?: number, setTimeout?: typeof globalThis.setTimeout, clearTimeout?: typeof globalThis.clearTimeout, fetcher?: typeof fetch }} [options]
 */
async function fetchOpenFreeMapPosterStyle(options = {}) {
  const timeoutMs = getStyleFetchTimeoutMs(options.timeoutMs);
  const setTimer = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const controller =
    typeof globalThis.AbortController === "function" ? new globalThis.AbortController() : null;
  /** @type {ReturnType<typeof globalThis.setTimeout> | undefined} */
  let timeout;
  let didTimeout = false;

  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimer(() => {
      didTimeout = true;
      controller?.abort();
      reject(new Error("OpenFreeMap style request timeout"));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetcher(OPENFREEMAP_STYLE_URL, controller ? { signal: controller.signal } : undefined),
      timeoutPromise
    ]);

    if (!response.ok) {
      throw new Error(`OpenFreeMap style request failed: ${response.status}`);
    }

    return /** @type {import("maplibre-gl").StyleSpecification} */ (
      applyPosterBackgroundMapPalette(sanitizeMapLibreStyleFilters(await response.json()))
    );
  } catch (error) {
    if (didTimeout) {
      throw new Error("OpenFreeMap style request timeout");
    }

    throw error;
  } finally {
    if (timeout !== undefined) {
      clearTimer(timeout);
    }
  }
}

/**
 * @param {{ timeoutMs?: number, setTimeout?: typeof globalThis.setTimeout, clearTimeout?: typeof globalThis.clearTimeout, fetcher?: typeof fetch }} options
 */
function hasCustomStyleLoadOptions(options) {
  return (
    options.timeoutMs !== undefined ||
    options.setTimeout !== undefined ||
    options.clearTimeout !== undefined ||
    options.fetcher !== undefined
  );
}

/**
 * @param {number | undefined} timeoutMs
 */
function getStyleFetchTimeoutMs(timeoutMs) {
  return Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : DEFAULT_STYLE_FETCH_TIMEOUT_MS;
}

/**
 * @param {Extract<(typeof MAP_STYLE_DEFINITIONS)[keyof typeof MAP_STYLE_DEFINITIONS], { kind: "raster" }>} definition
 */
function createRasterMapLibreStyle(definition) {
  return /** @type {import("maplibre-gl").StyleSpecification} */ ({
    version: 8,
    sources: {
      [definition.sourceId]: {
        type: "raster",
        tiles: [...definition.tiles],
        tileSize: definition.tileSize,
        maxzoom: definition.maxzoom,
        attribution: definition.attribution
      }
    },
    layers: [
      {
        id: definition.sourceId,
        type: "raster",
        source: definition.sourceId
      }
    ]
  });
}

/**
 * @param {import("maplibre-gl").StyleSpecification} style
 */
function cloneMapLibreStyle(style) {
  return /** @type {import("maplibre-gl").StyleSpecification} */ (
    typeof globalThis.structuredClone === "function"
      ? globalThis.structuredClone(style)
      : JSON.parse(JSON.stringify(style))
  );
}
