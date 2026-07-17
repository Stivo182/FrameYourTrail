const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const FILTER_NUMBER_FALLBACK = 1000000000000;
const DEFAULT_STYLE_FETCH_TIMEOUT_MS = 12000;

const NUMERIC_FILTER_OPERATORS = new Set(["<", "<=", ">", ">="]);

export const DEFAULT_MAP_STYLE_ID = "openfreemap_poster";

const POSTER_BACKGROUND_MAP_PALETTE = Object.freeze({
  background: "#f0eee3",
  land: "#f0eee3",
  park: "#d7dfd0",
  water: "#d6e3e0",
  building: "#e3ded2",
  road: "#ddd5c5",
  trail: "#8f8b63",
  boundary: "#b7b1a4",
  label: "#5f6c61",
  labelHalo: "#fbfaf3"
});

const POSTER_BACKGROUND_MAP_PATTERN_LAYER_IDS = new Set(["landcover_wetland", "road_area_pattern"]);

const OPENFREEMAP_NAME_TEXT_FIELD = Object.freeze([
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
  ["coalesce", ["get", "name_en"], ["get", "name"]]
]);

const SUPPLEMENTAL_POSTER_LABEL_PAINT = Object.freeze({
  "text-color": POSTER_BACKGROUND_MAP_PALETTE.label,
  "text-halo-color": POSTER_BACKGROUND_MAP_PALETTE.labelHalo,
  "text-halo-width": 1
});

const SUPPLEMENTAL_POSTER_LABEL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "poster-park-label",
    sourceLayer: "park",
    textSize: 11
  }),
  Object.freeze({
    id: "poster-mountain-peak-label",
    sourceLayer: "mountain_peak",
    textSize: 10
  })
]);

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

/**
 * @param {unknown} style
 */
export function sanitizeMapLibreStyleFilters(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return style;
  }

  const styleObject = /** @type {{ layers?: unknown }} */ (style);

  if (!Array.isArray(styleObject.layers)) {
    return { ...styleObject };
  }

  return {
    ...styleObject,
    layers: styleObject.layers.map((layer) => {
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
        return layer;
      }

      const layerObject = /** @type {{ filter?: unknown, layout?: unknown }} */ (layer);
      const filter = Array.isArray(layerObject.filter)
        ? sanitizeFilterExpression(layerObject.filter)
        : undefined;
      const guardedFilter = hasRefLengthIconImage(layerObject.layout)
        ? appendFilterCondition(filter, createRefLengthIconFilter())
        : filter;

      if (!guardedFilter) {
        return { ...layerObject };
      }

      return {
        ...layerObject,
        filter: guardedFilter
      };
    })
  };
}

/**
 * @param {unknown} style
 */
function applyPosterBackgroundMapPalette(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return style;
  }

  const styleObject = /** @type {{ layers?: unknown }} */ (style);

  if (!Array.isArray(styleObject.layers)) {
    return { ...styleObject };
  }

  return {
    ...styleObject,
    layers: [
      ...styleObject.layers.flatMap(applyPosterBackgroundMapPaletteToLayers),
      ...createSupplementalPosterLabelLayers()
    ]
  };
}

function createSupplementalPosterLabelLayers() {
  return SUPPLEMENTAL_POSTER_LABEL_DEFINITIONS.map(({ id, sourceLayer, textSize }) => ({
    id,
    type: "symbol",
    source: "openmaptiles",
    "source-layer": sourceLayer,
    filter: ["has", "name"],
    layout: {
      "text-field": OPENFREEMAP_NAME_TEXT_FIELD,
      "text-font": ["Noto Sans Regular"],
      "text-size": textSize,
      "text-max-width": 8
    },
    paint: SUPPLEMENTAL_POSTER_LABEL_PAINT
  }));
}

/**
 * @param {unknown} layer
 */
function applyPosterBackgroundMapPaletteToLayers(layer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return [layer];
  }

  const layerObject =
    /** @type {{ id?: unknown, type?: unknown, "source-layer"?: unknown, paint?: unknown }} */ (
      layer
    );
  const type = typeof layerObject.type === "string" ? layerObject.type : "";
  const id = typeof layerObject.id === "string" ? layerObject.id : "";
  const sourceLayer =
    typeof layerObject["source-layer"] === "string" ? layerObject["source-layer"] : "";
  const layerKey = `${id} ${sourceLayer}`.toLowerCase();
  const basePaint =
    layerObject.paint && typeof layerObject.paint === "object" && !Array.isArray(layerObject.paint)
      ? layerObject.paint
      : {};
  const paint = /** @type {Record<string, unknown>} */ ({ ...basePaint });
  const posterFillPattern = type === "fill" ? getPosterFillPattern(id, paint) : null;

  if (type === "background") {
    paint["background-color"] = POSTER_BACKGROUND_MAP_PALETTE.background;
  } else if (type === "fill") {
    paint["fill-color"] = getPosterFillColor(layerKey);
    delete paint["fill-outline-color"];
    delete paint["fill-pattern"];

    if (posterFillPattern) {
      return createPosterFillPatternLayers(layerObject, id, paint, posterFillPattern);
    }
  } else if (type === "fill-extrusion") {
    paint["fill-extrusion-color"] = POSTER_BACKGROUND_MAP_PALETTE.building;
  } else if (type === "line") {
    const lineColor = getPosterLineColor(layerKey);

    if (!lineColor) {
      return [{ ...layerObject }];
    }

    paint["line-color"] = lineColor;
    if (isParkOutlineLayer(layerKey)) {
      delete paint["line-dasharray"];
    }
  } else if (type === "symbol" && isLabelLayer(layerKey, paint)) {
    paint["text-color"] = POSTER_BACKGROUND_MAP_PALETTE.label;
    paint["text-halo-color"] = POSTER_BACKGROUND_MAP_PALETTE.labelHalo;
  } else {
    return [{ ...layerObject }];
  }

  return [
    {
      ...layerObject,
      paint
    }
  ];
}

/**
 * @param {{ paint?: unknown }} layer
 * @param {string} layerId
 * @param {Record<string, unknown>} posterFillPaint
 * @param {string} fillPattern
 */
function createPosterFillPatternLayers(layer, layerId, posterFillPaint, fillPattern) {
  const paint =
    layer.paint && typeof layer.paint === "object" && !Array.isArray(layer.paint)
      ? /** @type {Record<string, unknown>} */ ({ ...layer.paint })
      : {};

  paint["fill-pattern"] = fillPattern;
  delete paint["fill-color"];
  delete paint["fill-outline-color"];

  return [
    {
      ...layer,
      id: `${layerId}-poster-fill`,
      paint: posterFillPaint
    },
    {
      ...layer,
      paint
    }
  ];
}

/**
 * @param {string} layerId
 * @param {Record<string, unknown>} paint
 */
function getPosterFillPattern(layerId, paint) {
  const fillPattern = paint["fill-pattern"];

  return POSTER_BACKGROUND_MAP_PATTERN_LAYER_IDS.has(layerId) && typeof fillPattern === "string"
    ? fillPattern
    : null;
}

/**
 * @param {string} layerKey
 */
function getPosterFillColor(layerKey) {
  if (hasMapLayerToken(layerKey, ["water", "waterway"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.water;
  }

  if (hasMapLayerToken(layerKey, ["building"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.building;
  }

  if (hasMapLayerToken(layerKey, ["park", "landcover", "landuse", "forest", "wood", "grass"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.park;
  }

  return POSTER_BACKGROUND_MAP_PALETTE.land;
}

/**
 * @param {string} layerKey
 */
function getPosterLineColor(layerKey) {
  if (hasMapLayerToken(layerKey, ["water", "waterway"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.water;
  }

  if (isParkOutlineLayer(layerKey)) {
    return POSTER_BACKGROUND_MAP_PALETTE.boundary;
  }

  if (
    hasMapLayerToken(layerKey, [
      "trail",
      "path",
      "track",
      "footway",
      "steps",
      "pedestrian",
      "bridleway",
      "cycleway"
    ])
  ) {
    return POSTER_BACKGROUND_MAP_PALETTE.trail;
  }

  if (
    hasMapLayerToken(layerKey, [
      "road",
      "transportation",
      "bridge",
      "tunnel",
      "aeroway",
      "runway",
      "taxiway"
    ])
  ) {
    return POSTER_BACKGROUND_MAP_PALETTE.road;
  }

  if (hasMapLayerToken(layerKey, ["boundary", "admin"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.boundary;
  }

  return null;
}

/**
 * @param {string} layerKey
 */
function isParkOutlineLayer(layerKey) {
  return hasMapLayerToken(layerKey, ["park"]) && hasMapLayerToken(layerKey, ["outline"]);
}

/**
 * @param {string} layerKey
 * @param {Record<string, unknown>} paint
 */
function isLabelLayer(layerKey, paint) {
  return (
    "text-color" in paint ||
    hasMapLayerToken(layerKey, ["label", "place", "poi", "name", "transportation_name"])
  );
}

/**
 * @param {string} layerKey
 * @param {string[]} tokens
 */
function hasMapLayerToken(layerKey, tokens) {
  return tokens.some((token) => layerKey.includes(token));
}

function createRefLengthIconFilter() {
  return [">=", ["to-number", ["get", "ref_length"], -FILTER_NUMBER_FALLBACK], 1];
}

/**
 * @param {unknown} filter
 * @param {unknown[]} condition
 */
function appendFilterCondition(filter, condition) {
  if (!Array.isArray(filter)) {
    return condition;
  }

  if (filter[0] === "all") {
    return [...filter, condition];
  }

  return ["all", filter, condition];
}

/**
 * @param {unknown} layout
 */
function hasRefLengthIconImage(layout) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    return false;
  }

  const layoutObject = /** @type {{ ["icon-image"]?: unknown }} */ (layout);

  return expressionContainsGet(layoutObject["icon-image"], "ref_length");
}

/**
 * @param {unknown} expression
 * @param {string} propertyName
 */
function expressionContainsGet(expression, propertyName) {
  if (!Array.isArray(expression)) {
    return false;
  }

  if (expression[0] === "get" && expression[1] === propertyName) {
    return true;
  }

  return expression.some((operand) => expressionContainsGet(operand, propertyName));
}

/**
 * @param {unknown} expression
 * @returns {unknown}
 */
function sanitizeFilterExpression(expression) {
  if (!Array.isArray(expression)) {
    return expression;
  }

  const [operator, leftOperand, rightOperand, ...extraOperands] = expression;

  if (
    typeof operator === "string" &&
    NUMERIC_FILTER_OPERATORS.has(operator) &&
    extraOperands.length === 0
  ) {
    return [
      operator,
      sanitizeNumericFilterOperand(leftOperand, operator, "left"),
      sanitizeNumericFilterOperand(rightOperand, operator, "right")
    ];
  }

  return expression.map(sanitizeFilterExpression);
}

/**
 * @param {unknown} operand
 * @param {string} operator
 * @param {"left" | "right"} side
 */
function sanitizeNumericFilterOperand(operand, operator, side) {
  const sanitizedOperand = sanitizeFilterExpression(operand);

  if (!isGetExpression(sanitizedOperand)) {
    return sanitizedOperand;
  }

  return ["to-number", sanitizedOperand, getNumericFilterFallback(operator, side)];
}

/**
 * @param {unknown} expression
 */
function isGetExpression(expression) {
  return Array.isArray(expression) && expression[0] === "get" && typeof expression[1] === "string";
}

/**
 * @param {string} operator
 * @param {"left" | "right"} side
 */
function getNumericFilterFallback(operator, side) {
  const missingValueShouldBeHigh =
    (side === "left" && (operator === "<" || operator === "<=")) ||
    (side === "right" && (operator === ">" || operator === ">="));

  return missingValueShouldBeHigh ? FILTER_NUMBER_FALLBACK : -FILTER_NUMBER_FALLBACK;
}
