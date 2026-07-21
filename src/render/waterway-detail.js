import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

const WATERWAY_DETAIL_ZOOM = 9;
const WATERWAY_DETAIL_TILE_CAP = 24;
const WATERWAY_DETAIL_FETCH_TIMEOUT_MS = 8000;
const MAX_WEB_MERCATOR_LATITUDE = 85.05112878;
const WATERWAY_DETAIL_SOURCE_ID = "openfreemap-waterway-detail";
const WATERWAY_DETAIL_LINE_LAYER_ID = "openfreemap-waterway-detail-line";
const WATERWAY_DETAIL_LABEL_LAYER_ID = "openfreemap-waterway-detail-label";

/**
 * @param {{ style: unknown, bounds: unknown, mapZoom: unknown, maxTileCount?: number }} options
 */
export function createOpenFreeMapWaterwayDetailPlan(options) {
  const { style, bounds, mapZoom, maxTileCount = WATERWAY_DETAIL_TILE_CAP } = options;

  if (
    typeof mapZoom !== "number" ||
    !Number.isFinite(mapZoom) ||
    mapZoom < 0 ||
    mapZoom >= WATERWAY_DETAIL_ZOOM
  ) {
    return null;
  }

  const tileJsonUrl = getWaterwayTileJsonUrl(style);
  const tiles = getCoveringTiles(bounds, WATERWAY_DETAIL_ZOOM, maxTileCount);

  if (!tileJsonUrl || !tiles) {
    return null;
  }

  return { tileJsonUrl, tiles };
}

/**
 * @param {{ plan: ReturnType<typeof createOpenFreeMapWaterwayDetailPlan>, fetcher?: typeof fetch, signal?: AbortSignal, timeoutMs?: number }} options
 */
export async function fetchOpenFreeMapWaterwayDetail(options) {
  const {
    plan,
    fetcher = globalThis.fetch.bind(globalThis),
    signal,
    timeoutMs = WATERWAY_DETAIL_FETCH_TIMEOUT_MS
  } = options;

  if (!plan) {
    return null;
  }

  try {
    const tileJson = await fetchJson(plan.tileJsonUrl, fetcher, signal, timeoutMs);
    const tileTemplates = getTileTemplates(tileJson);

    if (tileTemplates.length === 0) {
      return null;
    }

    const featureGroups = await Promise.all(
      plan.tiles.map(async (tile, index) => {
        try {
          const template = /** @type {string} */ (tileTemplates[index % tileTemplates.length]);
          const response = await fetchWithTimeout(
            expandTileTemplate(template, tile),
            fetcher,
            signal,
            timeoutMs
          );

          if (!response.ok) {
            return [];
          }

          return decodeWaterwayFeatures(await response.arrayBuffer(), tile);
        } catch (error) {
          throwIfAborted(signal, error);
          return [];
        }
      })
    );

    throwIfAborted(signal);
    const features = featureGroups.flat();

    return features.length > 0
      ? /** @type {import("geojson").FeatureCollection} */ ({ type: "FeatureCollection", features })
      : null;
  } catch (error) {
    throwIfAborted(signal, error);
    return null;
  }
}

/**
 * @param {unknown} style
 * @returns {{ sourceId: string, line: import("maplibre-gl").LineLayerSpecification, label: import("maplibre-gl").SymbolLayerSpecification } | null}
 */
export function createOpenFreeMapWaterwayDetailLayers(style) {
  const layers =
    style &&
    typeof style === "object" &&
    !Array.isArray(style) &&
    Array.isArray(/** @type {{ layers?: unknown }} */ (style).layers)
      ? /** @type {unknown[]} */ (/** @type {{ layers: unknown[] }} */ (style).layers)
      : [];
  const lineTemplate = layers.find(
    (layer) =>
      layer &&
      typeof layer === "object" &&
      !Array.isArray(layer) &&
      /** @type {{ type?: unknown }} */ (layer).type === "line" &&
      /** @type {{ "source-layer"?: unknown }} */ (layer)["source-layer"] === "waterway" &&
      typeof (/** @type {{ source?: unknown }} */ (layer).source) === "string"
  );
  const labelTemplate = layers.find(
    (layer) =>
      layer &&
      typeof layer === "object" &&
      !Array.isArray(layer) &&
      /** @type {{ id?: unknown, type?: unknown }} */ (layer).id === "poster-waterway-label" &&
      /** @type {{ type?: unknown }} */ (layer).type === "symbol"
  );

  if (!lineTemplate || !labelTemplate) {
    return null;
  }

  return {
    sourceId: WATERWAY_DETAIL_SOURCE_ID,
    line: /** @type {import("maplibre-gl").LineLayerSpecification} */ (
      createDetailLayer(lineTemplate, WATERWAY_DETAIL_LINE_LAYER_ID)
    ),
    label: /** @type {import("maplibre-gl").SymbolLayerSpecification} */ (
      createDetailLayer(labelTemplate, WATERWAY_DETAIL_LABEL_LAYER_ID)
    )
  };
}

/**
 * @param {unknown} style
 */
function getWaterwayTileJsonUrl(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return null;
  }

  const styleObject = /** @type {{ sources?: unknown, layers?: unknown }} */ (style);

  if (
    !styleObject.sources ||
    typeof styleObject.sources !== "object" ||
    Array.isArray(styleObject.sources)
  ) {
    return null;
  }

  const waterwayLayer = Array.isArray(styleObject.layers)
    ? styleObject.layers.find(
        (layer) =>
          layer &&
          typeof layer === "object" &&
          !Array.isArray(layer) &&
          /** @type {{ "source-layer"?: unknown }} */ (layer)["source-layer"] === "waterway"
      )
    : undefined;
  const sourceId =
    waterwayLayer &&
    typeof waterwayLayer === "object" &&
    !Array.isArray(waterwayLayer) &&
    typeof (/** @type {{ source?: unknown }} */ (waterwayLayer).source) === "string"
      ? /** @type {{ source: string }} */ (waterwayLayer).source
      : undefined;
  const source = sourceId
    ? /** @type {Record<string, unknown>} */ (styleObject.sources)[sourceId]
    : undefined;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const vectorSource = /** @type {{ type?: unknown, url?: unknown }} */ (source);
  return vectorSource.type === "vector" && isAbsoluteUrl(vectorSource.url)
    ? vectorSource.url
    : null;
}

/**
 * @param {unknown} bounds
 * @param {number} zoom
 * @param {number} maxTileCount
 */
function getCoveringTiles(bounds, zoom, maxTileCount) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    return null;
  }

  if (!Number.isInteger(maxTileCount) || maxTileCount < 1) {
    return null;
  }

  const { minLatitude, maxLatitude, minLongitude, maxLongitude } =
    /** @type {{ minLatitude?: unknown, maxLatitude?: unknown, minLongitude?: unknown, maxLongitude?: unknown }} */ (
      bounds
    );

  if (
    typeof minLatitude !== "number" ||
    typeof maxLatitude !== "number" ||
    typeof minLongitude !== "number" ||
    typeof maxLongitude !== "number" ||
    !Number.isFinite(minLatitude) ||
    !Number.isFinite(maxLatitude) ||
    !Number.isFinite(minLongitude) ||
    !Number.isFinite(maxLongitude) ||
    minLatitude > maxLatitude ||
    minLongitude > maxLongitude ||
    minLatitude < -MAX_WEB_MERCATOR_LATITUDE ||
    maxLatitude > MAX_WEB_MERCATOR_LATITUDE ||
    minLongitude < -180 ||
    maxLongitude > 180
  ) {
    return null;
  }

  const tilesPerAxis = 2 ** zoom;
  const minX = longitudeToTileX(minLongitude, tilesPerAxis);
  const maxX = longitudeToTileX(maxLongitude, tilesPerAxis);
  const minY = latitudeToTileY(maxLatitude, tilesPerAxis);
  const maxY = latitudeToTileY(minLatitude, tilesPerAxis);
  const tileCount = (maxX - minX + 1) * (maxY - minY + 1);

  if (tileCount > maxTileCount) {
    return null;
  }

  const tiles = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      tiles.push({ z: zoom, x, y });
    }
  }

  return tiles;
}

/**
 * @param {number} longitude
 * @param {number} tilesPerAxis
 */
function longitudeToTileX(longitude, tilesPerAxis) {
  return Math.min(tilesPerAxis - 1, Math.floor(((longitude + 180) / 360) * tilesPerAxis));
}

/**
 * @param {number} latitude
 * @param {number} tilesPerAxis
 */
function latitudeToTileY(latitude, tilesPerAxis) {
  const radians = (latitude * Math.PI) / 180;
  return Math.min(
    tilesPerAxis - 1,
    Math.max(0, Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * tilesPerAxis))
  );
}

/**
 * @param {string} url
 * @param {typeof fetch} fetcher
 * @param {AbortSignal | undefined} signal
 * @param {number} timeoutMs
 */
async function fetchJson(url, fetcher, signal, timeoutMs) {
  const response = await fetchWithTimeout(url, fetcher, signal, timeoutMs);

  if (!response.ok) {
    throw new Error(`OpenFreeMap TileJSON request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * @param {unknown} tileJson
 */
function getTileTemplates(tileJson) {
  if (!tileJson || typeof tileJson !== "object" || Array.isArray(tileJson)) {
    return [];
  }

  const tiles = /** @type {{ tiles?: unknown }} */ (tileJson).tiles;
  return Array.isArray(tiles)
    ? tiles.filter(
        (template) =>
          typeof template === "string" &&
          template.includes("{z}") &&
          template.includes("{x}") &&
          template.includes("{y}") &&
          isAbsoluteUrl(template)
      )
    : [];
}

/**
 * @param {string} template
 * @param {{ z: number, x: number, y: number }} tile
 */
function expandTileTemplate(template, tile) {
  return template
    .replaceAll("{z}", String(tile.z))
    .replaceAll("{x}", String(tile.x))
    .replaceAll("{y}", String(tile.y));
}

/**
 * @param {string} url
 * @param {typeof fetch} fetcher
 * @param {AbortSignal | undefined} signal
 * @param {number} timeoutMs
 */
function fetchWithTimeout(url, fetcher, signal, timeoutMs) {
  const controller = new AbortController();
  /** @type {() => void} */
  let abort = () => {};
  const abortPromise = new Promise((_, reject) => {
    abort = () => {
      controller.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener("abort", abort, { once: true });
    }
  });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("OpenFreeMap waterway detail request timeout"));
    }, timeoutMs);
  });

  return Promise.race([
    fetcher(url, { signal: controller.signal }),
    timeoutPromise,
    abortPromise
  ]).finally(() => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    signal?.removeEventListener("abort", abort);
  });
}

/**
 * @param {ArrayBuffer} tileData
 * @param {{ z: number, x: number, y: number }} tile
 */
function decodeWaterwayFeatures(tileData, tile) {
  const waterwayLayer = new VectorTile(new Pbf(tileData)).layers.waterway;

  if (!waterwayLayer) {
    return [];
  }

  const features = [];

  for (let index = 0; index < waterwayLayer.length; index += 1) {
    const feature = waterwayLayer.feature(index);

    if (isTunnel(feature.properties)) {
      continue;
    }

    const geoJson = feature.toGeoJSON(tile.x, tile.y, tile.z);

    if (geoJson.geometry.type === "LineString" || geoJson.geometry.type === "MultiLineString") {
      features.push(geoJson);
    }
  }

  return features;
}

/**
 * @param {Record<string, unknown>} properties
 */
function isTunnel(properties) {
  return (
    properties.brunnel === "tunnel" ||
    properties.tunnel === true ||
    properties.tunnel === 1 ||
    properties.tunnel === "yes"
  );
}

/**
 * @param {unknown} template
 * @param {string} id
 */
function createDetailLayer(template, id) {
  const detailLayer = { .../** @type {Record<string, unknown>} */ (template) };
  delete detailLayer.source;
  delete detailLayer.filter;
  delete detailLayer.minzoom;
  delete detailLayer.maxzoom;
  delete detailLayer["source-layer"];

  return {
    ...detailLayer,
    id,
    source: WATERWAY_DETAIL_SOURCE_ID
  };
}

/**
 * @param {AbortSignal | undefined} signal
 * @param {unknown} [error]
 */
function throwIfAborted(signal, error) {
  if (signal?.aborted) {
    throw error instanceof Error ? error : new DOMException("Aborted", "AbortError");
  }
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isAbsoluteUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}
