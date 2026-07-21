const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const FILTER_NUMBER_FALLBACK = 1000000000000;
const DEFAULT_STYLE_FETCH_TIMEOUT_MS = 12000;

const NUMERIC_FILTER_OPERATORS = new Set(["<", "<=", ">", ">="]);

export const DEFAULT_MAP_STYLE_ID = "openfreemap_poster";

const POSTER_BACKGROUND_MAP_PALETTE = Object.freeze({
  background: "#f0eee3",
  land: "#f0eee3",
  park: "#d7dfd0",
  sand: "#e8ddbf",
  rock: "#EEE5DC",
  farmland: "#d8d8b5",
  residential: "#e2ddd5",
  commercial: "#ddcecc",
  industrial: "#F4E2DC",
  civic: "#e4dec7",
  recreation: "#ECE7D2",
  aerowayArea: "#e4e2e0",
  water: "#d6e3e0",
  waterLine: "#7ba8a8",
  waterLabel: "#416b73",
  glacier: "#dbe9e8",
  building: "#d7d0c2",
  buildingOutline: "#ccc5bb",
  road: "#ddd5c5",
  trail: "#8f8b63",
  aerialway: "#9f9a8d",
  boundary: "#b7b1a4",
  label: "#5f6c61",
  labelHalo: "#fbfaf3"
});

const POSTER_AREA_DEFINITIONS = Object.freeze([
  Object.freeze({
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["ice"]),
    subclassValues: Object.freeze(["glacier", "ice_shelf"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.glacier
  }),
  Object.freeze({
    supplementalLayerId: "poster-landcover-sand",
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["sand"]),
    subclassValues: Object.freeze(["beach", "sand", "dune"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.sand
  }),
  Object.freeze({
    supplementalLayerId: "poster-landcover-rock",
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["rock"]),
    subclassValues: Object.freeze(["bare_rock", "scree"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.rock
  }),
  Object.freeze({
    supplementalLayerId: "poster-landcover-farmland",
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["farmland"]),
    subclassValues: Object.freeze(["farmland", "farm", "orchard", "vineyard", "plant_nursery"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.farmland
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-residential",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze(["residential", "suburb", "quarter", "neighbourhood"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.residential
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-commercial",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze(["commercial", "retail"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.commercial
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-industrial",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze(["industrial", "garages", "railway", "military", "dam"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.industrial
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-civic",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze([
      "bus_station",
      "university",
      "kindergarten",
      "college",
      "library",
      "hospital",
      "school"
    ]),
    color: POSTER_BACKGROUND_MAP_PALETTE.civic
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-recreation",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze([
      "stadium",
      "playground",
      "theme_park",
      "zoo",
      "pitch",
      "track",
      "cemetery"
    ]),
    color: POSTER_BACKGROUND_MAP_PALETTE.recreation
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-quarry",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze(["quarry"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.rock
  }),
  Object.freeze({
    supplementalLayerId: "poster-aeroway-fill",
    sourceLayer: "aeroway",
    classification: "source-layer",
    supplementalFilter: Object.freeze([
      "match",
      Object.freeze(["geometry-type"]),
      Object.freeze(["MultiPolygon", "Polygon"]),
      true,
      false
    ]),
    color: POSTER_BACKGROUND_MAP_PALETTE.aerowayArea
  })
]);

const POSTER_BACKGROUND_MAP_PATTERN_LAYER_IDS = new Set(["landcover_wetland", "road_area_pattern"]);
const POSTER_BACKGROUND_MAP_PATTERN_OVERLAY_OPACITY = 0.25;

const SUPPLEMENTAL_POSTER_AREA_BARRIER_SOURCE_LAYERS = new Set([
  "water",
  "waterway",
  "transportation",
  "building"
]);

const OPENFREEMAP_SUPPORTED_NAME_FIELDS = Object.freeze([
  "name_en",
  "name:en",
  "name",
  "name:latin"
]);

const OPENFREEMAP_HAS_SUPPORTED_NAME_FILTER = Object.freeze([
  "any",
  ...OPENFREEMAP_SUPPORTED_NAME_FIELDS.map((nameField) => ["has", nameField])
]);

const OPENFREEMAP_NAME_TEXT_FIELD = Object.freeze([
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
  ["coalesce", ...OPENFREEMAP_SUPPORTED_NAME_FIELDS.map((nameField) => ["get", nameField])]
]);

const SUPPLEMENTAL_POSTER_LABEL_PAINT = Object.freeze({
  "text-color": POSTER_BACKGROUND_MAP_PALETTE.label,
  "text-halo-color": POSTER_BACKGROUND_MAP_PALETTE.labelHalo,
  "text-halo-width": 1
});

const SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT = Object.freeze({
  "text-color": POSTER_BACKGROUND_MAP_PALETTE.waterLabel,
  "text-halo-color": POSTER_BACKGROUND_MAP_PALETTE.labelHalo,
  "text-halo-width": 1
});

const OPENFREEMAP_LINE_NAME_FILTER = Object.freeze([
  "all",
  ["has", "name"],
  ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]
]);

const OPENFREEMAP_POINT_NAME_FILTER = Object.freeze([
  "all",
  ["has", "name"],
  ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false]
]);

const OPENFREEMAP_LIGHTHOUSE_TERMS = Object.freeze(["lighthouse", "light house", "\u706f\u53f0"]);
const OPENFREEMAP_LIGHTHOUSE_NAME_FILTER = Object.freeze([
  "any",
  ...OPENFREEMAP_SUPPORTED_NAME_FIELDS.map((nameField) =>
    createOpenFreeMapLighthouseNameFilter(nameField)
  )
]);

/**
 * @param {string} nameField
 */
function createOpenFreeMapLighthouseNameFilter(nameField) {
  return [
    "let",
    "normalizedName",
    ["downcase", ["coalesce", ["get", nameField], ""]],
    [
      "any",
      ...OPENFREEMAP_LIGHTHOUSE_TERMS.map((term) => [
        "!=",
        ["index-of", term, ["var", "normalizedName"]],
        -1
      ]),
      ["==", ["var", "normalizedName"], "light"],
      ["==", ["slice", ["var", "normalizedName"], -6], " light"]
    ]
  ];
}

const SUPPLEMENTAL_POSTER_LABEL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "poster-park-label",
    sourceLayer: "park",
    minzoom: 10,
    textSize: 11
  }),
  Object.freeze({
    id: "poster-mountain-peak-label",
    sourceLayer: "mountain_peak",
    minzoom: 9,
    textSize: 10
  }),
  Object.freeze({
    id: "poster-waterway-label",
    sourceLayer: "waterway",
    minzoom: 9,
    maxzoom: 14,
    textSize: ["interpolate", ["linear"], ["zoom"], 9, 8, 12, 9.5, 13, 10],
    filter: OPENFREEMAP_LINE_NAME_FILTER,
    paint: SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 60
    }
  }),
  Object.freeze({
    id: "poster-water-name-line-label",
    sourceLayer: "water_name",
    minzoom: 7,
    maxzoom: 14,
    textSize: ["interpolate", ["linear"], ["zoom"], 7, 9, 10, 10, 13, 11],
    filter: OPENFREEMAP_LINE_NAME_FILTER,
    paint: SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 180
    }
  }),
  Object.freeze({
    id: "poster-water-name-point-label",
    sourceLayer: "water_name",
    minzoom: 7,
    maxzoom: 14,
    textSize: ["interpolate", ["linear"], ["zoom"], 7, 9, 10, 10, 13, 11],
    filter: OPENFREEMAP_POINT_NAME_FILTER,
    paint: SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT,
    layout: {
      "symbol-placement": "point"
    }
  }),
  Object.freeze({
    id: "poster-tourist-poi-label",
    sourceLayer: "poi",
    minzoom: 14,
    maxzoom: 15,
    textSize: 9,
    filter: [
      "all",
      ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      ["has", "name"],
      ["<", ["to-number", ["get", "rank"], 99], 10],
      [
        "any",
        ["match", ["get", "class"], ["attraction", "castle", "museum"], true, false],
        [
          "match",
          ["coalesce", ["get", "subclass"], ""],
          ["shrine", "temple", "viewpoint"],
          true,
          false
        ],
        [
          "all",
          ["==", ["get", "class"], "place_of_worship"],
          ["match", ["coalesce", ["get", "subclass"], ""], ["", "buddhist", "shinto"], true, false]
        ]
      ]
    ],
    layout: {
      "symbol-placement": "point"
    }
  }),
  Object.freeze({
    id: "poster-highway-name-motorway",
    sourceLayer: "transportation_name",
    minzoom: 10,
    textSize: 11,
    filter: [
      "all",
      ["has", "name"],
      ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      ["==", ["get", "class"], "motorway"]
    ],
    layout: {
      "symbol-placement": "line"
    }
  }),
  Object.freeze({
    id: "poster-aerialway-label",
    sourceLayer: "transportation_name",
    textSize: 10,
    filter: ["all", ["has", "name"], ["==", ["get", "class"], "aerialway"]],
    layout: {
      "symbol-placement": "line"
    }
  }),
  Object.freeze({
    id: "poster-shipway-label",
    sourceLayer: "transportation_name",
    textSize: 10,
    filter: ["all", ["has", "name"], ["==", ["get", "class"], "ferry"]],
    layout: {
      "symbol-placement": "line"
    }
  }),
  Object.freeze({
    id: "poster-lighthouse-label",
    sourceLayer: "poi",
    minzoom: 12,
    textSize: 9,
    filter: [
      "all",
      ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      OPENFREEMAP_HAS_SUPPORTED_NAME_FILTER,
      ["match", ["get", "class"], ["attraction", "museum"], true, false],
      OPENFREEMAP_LIGHTHOUSE_NAME_FILTER
    ],
    layout: {
      "symbol-placement": "point"
    }
  })
]);

const OPENFREEMAP_ROAD_LABEL_MINZOOMS = Object.freeze({
  "highway-name-major": 10,
  "highway-name-minor": 11,
  "highway-name-path": 12
});

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

  const resolveSupplementalVectorSource = createSupplementalVectorSourceResolver(styleObject);
  const posterLayers = styleObject.layers.flatMap(applyPosterBackgroundMapPaletteToLayers);
  const normalizedPosterLayers = normalizeMapTextLabelTier(posterLayers);

  return {
    ...styleObject,
    layers: insertSupplementalPosterDetailLayers(
      normalizedPosterLayers,
      resolveSupplementalVectorSource
    )
  };
}

/**
 * @param {Record<string, unknown>} style
 */
function createSupplementalVectorSourceResolver(style) {
  const sources =
    style.sources && typeof style.sources === "object" && !Array.isArray(style.sources)
      ? style.sources
      : {};
  const layers = Array.isArray(style.layers) ? style.layers : [];
  const vectorSourceIds = new Set(
    Object.entries(sources).flatMap(([sourceId, source]) =>
      source &&
      typeof source === "object" &&
      !Array.isArray(source) &&
      /** @type {{ type?: unknown }} */ (source).type === "vector"
        ? [sourceId]
        : []
    )
  );
  const sourceIdsBySourceLayer = new Map();
  const sourceLayersInStyle = new Set();

  for (const layer of layers) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      continue;
    }

    const layerObject = /** @type {{ source?: unknown, "source-layer"?: unknown }} */ (layer);
    const sourceLayer = layerObject["source-layer"];

    if (typeof sourceLayer !== "string") {
      continue;
    }

    sourceLayersInStyle.add(sourceLayer);

    if (typeof layerObject.source !== "string" || !vectorSourceIds.has(layerObject.source)) {
      continue;
    }

    const sourceIds = sourceIdsBySourceLayer.get(sourceLayer) ?? new Set();
    sourceIds.add(layerObject.source);
    sourceIdsBySourceLayer.set(sourceLayer, sourceIds);
  }

  const fallbackSourceId =
    vectorSourceIds.size === 1 ? vectorSourceIds.values().next().value : undefined;

  return (sourceLayer) => {
    const sourceIds = sourceIdsBySourceLayer.get(sourceLayer);

    if (sourceIds?.size === 1) {
      return sourceIds.values().next().value;
    }

    return sourceLayersInStyle.has(sourceLayer) ? undefined : fallbackSourceId;
  };
}

/**
 * @param {(sourceLayer: string) => string | undefined} resolveSource
 */
function createSupplementalPosterLabelLayers(resolveSource) {
  return SUPPLEMENTAL_POSTER_LABEL_DEFINITIONS.flatMap((definition) => {
    const { id, sourceLayer, textSize } = definition;
    const source = resolveSource(sourceLayer);

    if (source === undefined) {
      return [];
    }

    const filter = "filter" in definition ? definition.filter : ["has", "name"];
    const layout = "layout" in definition ? definition.layout : {};
    const paint = "paint" in definition ? definition.paint : SUPPLEMENTAL_POSTER_LABEL_PAINT;
    const layer = {
      id,
      type: "symbol",
      source,
      "source-layer": sourceLayer,
      filter,
      layout: {
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD,
        "text-font": ["Noto Sans Regular"],
        "text-size": textSize,
        "text-max-width": 8,
        ...layout
      },
      paint
    };

    if ("minzoom" in definition) {
      layer.minzoom = definition.minzoom;
    }

    if ("maxzoom" in definition) {
      layer.maxzoom = definition.maxzoom;
    }

    return [layer];
  });
}

/**
 * @param {unknown[]} layers
 * @param {(sourceLayer: string) => string | undefined} resolveSource
 */
function insertSupplementalPosterDetailLayers(layers, resolveSource) {
  const layersWithAreas = insertSupplementalPosterAreaLayers(layers, resolveSource);
  const transportInsertionIndex = getSupplementalPosterTransportInsertionIndex(layersWithAreas);
  const layersWithTransport = [
    ...layersWithAreas.slice(0, transportInsertionIndex),
    ...createSupplementalPosterTransportLineLayers(resolveSource),
    ...layersWithAreas.slice(transportInsertionIndex)
  ];
  const buildingOutlineInsertionIndex =
    getSupplementalPosterBuildingOutlineInsertionIndex(layersWithTransport);
  const layersWithGeometry = [
    ...layersWithTransport.slice(0, buildingOutlineInsertionIndex),
    ...createSupplementalPosterBuildingOutlineLayers(resolveSource),
    ...layersWithTransport.slice(buildingOutlineInsertionIndex)
  ];
  const textLabelInsertionIndex = getMapTextLabelBoundaryIndex(layersWithGeometry);

  return [
    ...layersWithGeometry.slice(0, textLabelInsertionIndex),
    ...createSupplementalPosterLabelLayers(resolveSource),
    ...layersWithGeometry.slice(textLabelInsertionIndex)
  ];
}

/**
 * @param {unknown[]} layers
 */
function getSupplementalPosterTransportInsertionIndex(layers) {
  const textLabelBoundaryIndex = getMapTextLabelBoundaryIndex(layers);
  const geometryBarrierOffset = layers
    .slice(0, textLabelBoundaryIndex)
    .findIndex(
      (layer) => isMapBuildingGeometryLayer(layer) || isMapAdministrativeBoundaryLayer(layer)
    );

  return geometryBarrierOffset === -1 ? textLabelBoundaryIndex : geometryBarrierOffset;
}

/**
 * @param {unknown[]} layers
 */
function getSupplementalPosterBuildingOutlineInsertionIndex(layers) {
  const textLabelBoundaryIndex = getMapTextLabelBoundaryIndex(layers);
  const finalBuildingGeometryIndex = layers
    .slice(0, textLabelBoundaryIndex)
    .findLastIndex(isMapBuildingGeometryLayer);

  if (finalBuildingGeometryIndex !== -1) {
    return finalBuildingGeometryIndex + 1;
  }

  const administrativeBoundaryOffset = layers
    .slice(0, textLabelBoundaryIndex)
    .findIndex(isMapAdministrativeBoundaryLayer);

  return administrativeBoundaryOffset === -1
    ? textLabelBoundaryIndex
    : administrativeBoundaryOffset;
}

/**
 * @param {unknown} layer
 */
function isMapBuildingGeometryLayer(layer) {
  return isMapSourceGeometryLayer(layer, "building");
}

/**
 * @param {unknown} layer
 */
function isMapAdministrativeBoundaryLayer(layer) {
  return isMapSourceGeometryLayer(layer, "boundary");
}

/**
 * @param {unknown} layer
 * @param {string} sourceLayer
 */
function isMapSourceGeometryLayer(layer, sourceLayer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return false;
  }

  const layerObject = /** @type {{ "source-layer"?: unknown }} */ (layer);

  return (
    layerObject["source-layer"] === sourceLayer &&
    ["fill", "fill-extrusion", "line"].includes(getLayerType(layer))
  );
}

/**
 * @param {unknown[]} layers
 * @param {(sourceLayer: string) => string | undefined} resolveSource
 */
function insertSupplementalPosterAreaLayers(layers, resolveSource) {
  const supplementalLayers = createSupplementalPosterAreaLayers(layers, resolveSource);
  const layersBySourceLayer = new Map();

  for (const layer of supplementalLayers) {
    const sourceLayer = layer["source-layer"];
    const sourceLayerLayers = layersBySourceLayer.get(sourceLayer) ?? [];
    sourceLayerLayers.push(layer);
    layersBySourceLayer.set(sourceLayer, sourceLayerLayers);
  }

  let composedLayers = layers;

  for (const [sourceLayer, sourceLayerLayers] of layersBySourceLayer) {
    const insertionIndex = getSupplementalPosterAreaInsertionIndex(
      composedLayers,
      sourceLayer,
      resolveSource
    );
    composedLayers = [
      ...composedLayers.slice(0, insertionIndex),
      ...sourceLayerLayers,
      ...composedLayers.slice(insertionIndex)
    ];
  }

  return composedLayers;
}

/**
 * @param {unknown[]} layers
 * @param {(sourceLayer: string) => string | undefined} resolveSource
 */
function createSupplementalPosterAreaLayers(layers, resolveSource) {
  return POSTER_AREA_DEFINITIONS.flatMap((definition) => {
    if (!("supplementalLayerId" in definition)) {
      return [];
    }

    const source = resolveSource(definition.sourceLayer);

    if (source === undefined) {
      return [];
    }

    let filter;

    if (definition.classification === "positive-filter") {
      const coveredClassValues = getNativePosterAreaClassCoverage(layers, source, definition);
      const residualClassValues = definition.classValues.filter(
        (classValue) => !coveredClassValues.has(classValue)
      );

      if (residualClassValues.length === 0) {
        return [];
      }

      filter = createPositivePropertyFilter("class", residualClassValues);
    } else {
      if (hasNativePosterAreaFillCoverage(layers, source, definition.sourceLayer)) {
        return [];
      }

      filter = definition.supplementalFilter;
    }

    return [
      {
        id: definition.supplementalLayerId,
        type: "fill",
        source,
        "source-layer": definition.sourceLayer,
        filter,
        paint: {
          "fill-color": definition.color
        }
      }
    ];
  });
}

/**
 * @param {unknown[]} layers
 * @param {string} source
 * @param {(typeof POSTER_AREA_DEFINITIONS)[number]} definition
 */
function getNativePosterAreaClassCoverage(layers, source, definition) {
  const coveredClassValues = new Set();

  for (const layer of layers) {
    if (!isRenderedResolvedSourceFillLayer(layer, source, definition.sourceLayer)) {
      continue;
    }

    const layerObject = /** @type {{ filter?: unknown }} */ (layer);
    const classAnalysis = analyzePositiveFilterProperty(layerObject.filter, "class");

    if (
      classAnalysis?.isExhaustive &&
      getPositiveFilterAreaDefinition(definition.sourceLayer, "class", classAnalysis.values) ===
        definition
    ) {
      for (const classValue of classAnalysis.values) {
        coveredClassValues.add(classValue);
      }
    }
  }

  return coveredClassValues;
}

/**
 * @param {unknown[]} layers
 * @param {string} source
 * @param {string} sourceLayer
 */
function hasNativePosterAreaFillCoverage(layers, source, sourceLayer) {
  return layers.some((layer) => {
    if (!isRenderedResolvedSourceFillLayer(layer, source, sourceLayer)) {
      return false;
    }

    const layerObject = /** @type {{ filter?: unknown }} */ (layer);
    const classAnalysis = analyzePositiveFilterProperty(layerObject.filter, "class");

    return classAnalysis?.isExhaustive === true && !classAnalysis.hasPositiveSelector;
  });
}

/**
 * @param {unknown} layer
 * @param {string} source
 * @param {string} sourceLayer
 */
function isRenderedResolvedSourceFillLayer(layer, source, sourceLayer) {
  if (!isResolvedSourceFillLayer(layer, source, sourceLayer)) {
    return false;
  }

  const layerObject = /** @type {{ layout?: unknown, paint?: unknown }} */ (layer);
  const layout =
    layerObject.layout &&
    typeof layerObject.layout === "object" &&
    !Array.isArray(layerObject.layout)
      ? /** @type {{ visibility?: unknown }} */ (layerObject.layout)
      : {};
  const paint =
    layerObject.paint && typeof layerObject.paint === "object" && !Array.isArray(layerObject.paint)
      ? /** @type {Record<string, unknown>} */ (layerObject.paint)
      : {};

  if (layout.visibility === "none") {
    return false;
  }

  if (!Object.hasOwn(paint, "fill-opacity")) {
    return true;
  }

  const fillOpacity = paint["fill-opacity"];
  return typeof fillOpacity === "number" && Number.isFinite(fillOpacity) && fillOpacity > 0;
}

/**
 * @param {unknown} layer
 * @param {string} source
 * @param {string} sourceLayer
 */
function isResolvedSourceFillLayer(layer, source, sourceLayer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return false;
  }

  const layerObject = /** @type {{ source?: unknown, "source-layer"?: unknown }} */ (layer);

  return (
    getLayerType(layer) === "fill" &&
    layerObject.source === source &&
    layerObject["source-layer"] === sourceLayer
  );
}

/**
 * @param {unknown[]} layers
 * @param {string} sourceLayer
 * @param {(sourceLayer: string) => string | undefined} resolveSource
 */
function getSupplementalPosterAreaInsertionIndex(layers, sourceLayer, resolveSource) {
  const barrierIndex = getSupplementalPosterAreaBarrierIndex(layers);

  if (sourceLayer === "landuse") {
    const firstLandcoverIndex = layers.findIndex((layer) => {
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
        return false;
      }

      const layerObject = /** @type {{ "source-layer"?: unknown }} */ (layer);
      return getLayerType(layer) === "fill" && layerObject["source-layer"] === "landcover";
    });

    return firstLandcoverIndex === -1 ? barrierIndex : Math.min(firstLandcoverIndex, barrierIndex);
  }

  const source = resolveSource(sourceLayer);

  if (sourceLayer === "landcover" && source !== undefined) {
    const wetlandBaseIndex = layers.findIndex(
      (layer) =>
        isLayerWithId(layer, "landcover_wetland-poster-fill") &&
        isResolvedSourceFillLayer(layer, source, sourceLayer)
    );

    if (wetlandBaseIndex !== -1 && wetlandBaseIndex < barrierIndex) {
      return wetlandBaseIndex;
    }

    const finalLandcoverIndex = layers
      .slice(0, barrierIndex)
      .findLastIndex((layer) => isResolvedSourceFillLayer(layer, source, sourceLayer));

    return finalLandcoverIndex === -1 ? barrierIndex : finalLandcoverIndex + 1;
  }

  if (sourceLayer === "aeroway" && source !== undefined) {
    const firstAerowayIndex = layers.findIndex((layer) =>
      isResolvedSourceLayer(layer, source, sourceLayer)
    );

    return firstAerowayIndex === -1 ? barrierIndex : Math.min(firstAerowayIndex, barrierIndex);
  }

  return barrierIndex;
}

/**
 * @param {unknown[]} layers
 */
function getSupplementalPosterAreaBarrierIndex(layers) {
  const searchStartIndex =
    layers.findLastIndex((layer) => getLayerType(layer) === "background") + 1;
  const barrierOffset = layers
    .slice(searchStartIndex)
    .findIndex(isSupplementalPosterAreaBarrierLayer);

  return barrierOffset === -1 ? layers.length : searchStartIndex + barrierOffset;
}

/**
 * @param {unknown} layer
 * @param {string} source
 * @param {string} sourceLayer
 */
function isResolvedSourceLayer(layer, source, sourceLayer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return false;
  }

  const layerObject = /** @type {{ source?: unknown, "source-layer"?: unknown }} */ (layer);

  return layerObject.source === source && layerObject["source-layer"] === sourceLayer;
}

/**
 * @param {unknown} layer
 * @param {string} id
 */
function isLayerWithId(layer, id) {
  return (
    layer !== null &&
    typeof layer === "object" &&
    !Array.isArray(layer) &&
    /** @type {{ id?: unknown }} */ (layer).id === id
  );
}

/**
 * @param {unknown} layer
 */
function isSupplementalPosterAreaBarrierLayer(layer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return false;
  }

  const layerObject = /** @type {{ type?: unknown, "source-layer"?: unknown }} */ (layer);

  return (
    layerObject.type === "symbol" ||
    (typeof layerObject["source-layer"] === "string" &&
      SUPPLEMENTAL_POSTER_AREA_BARRIER_SOURCE_LAYERS.has(layerObject["source-layer"]))
  );
}

/**
 * @param {(sourceLayer: string) => string | undefined} resolveSource
 */
function createSupplementalPosterTransportLineLayers(resolveSource) {
  const source = resolveSource("transportation");

  if (source === undefined) {
    return [];
  }

  return [
    {
      id: "poster-trail-line",
      type: "line",
      source,
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["path", "track"], true, false],
        ["match", ["get", "brunnel"], ["bridge", "tunnel"], false, true]
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": POSTER_BACKGROUND_MAP_PALETTE.trail,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 14, 1.1, 16, 1.6],
        "line-dasharray": [1.2, 1.1],
        "line-opacity": 0.78
      }
    },
    {
      id: "poster-aerialway-line",
      type: "line",
      source,
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["==", ["get", "class"], "aerialway"]
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": POSTER_BACKGROUND_MAP_PALETTE.aerialway,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 14, 0.9, 16, 1.25],
        "line-dasharray": [0.7, 1.3],
        "line-opacity": 0.82
      }
    },
    {
      id: "poster-shipway-line",
      type: "line",
      source,
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["==", ["get", "class"], "ferry"]
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": POSTER_BACKGROUND_MAP_PALETTE.waterLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 12, 0.7, 15, 1],
        "line-dasharray": [1, 1.8],
        "line-opacity": 0.7
      }
    }
  ];
}

/**
 * @param {(sourceLayer: string) => string | undefined} resolveSource
 */
function createSupplementalPosterBuildingOutlineLayers(resolveSource) {
  const source = resolveSource("building");

  return source === undefined
    ? []
    : [
        {
          id: "poster-building-outline",
          type: "line",
          source,
          "source-layer": "building",
          minzoom: 13,
          filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
          paint: {
            "line-color": POSTER_BACKGROUND_MAP_PALETTE.buildingOutline,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              0.35,
              14,
              0.45,
              16,
              0.65,
              20,
              0.95
            ],
            "line-opacity": 0.9
          }
        }
      ];
}

/**
 * Returns the first textual symbol index after the final non-symbol layer, or
 * from the start when no non-symbol layer exists. Icon-only symbols stay in
 * the geometry tier. If no text-label tier exists, the fail-safe boundary is
 * the end of the layer list.
 *
 * @param {unknown[]} layers
 */
export function getMapTextLabelBoundaryIndex(layers) {
  const finalNonSymbolIndex = layers.findLastIndex((layer) => getLayerType(layer) !== "symbol");
  const searchStartIndex = finalNonSymbolIndex + 1;
  const textLabelOffset = layers.slice(searchStartIndex).findIndex(isMapTextLabelLayer);

  return textLabelOffset === -1 ? layers.length : searchStartIndex + textLabelOffset;
}

/**
 * @param {unknown[]} layers
 */
function normalizeMapTextLabelTier(layers) {
  const textLabelBoundaryIndex = getMapTextLabelBoundaryIndex(layers);

  if (!layers.slice(0, textLabelBoundaryIndex).some(isMapTextLabelLayer)) {
    return layers;
  }

  return [
    ...layers.filter((layer) => !isMapTextLabelLayer(layer)),
    ...layers.filter(isMapTextLabelLayer)
  ];
}

/**
 * @param {unknown} layer
 */
function isMapTextLabelLayer(layer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return false;
  }

  const layerObject = /** @type {{ type?: unknown, layout?: unknown }} */ (layer);
  const { layout } = layerObject;

  return (
    layerObject.type === "symbol" &&
    layout !== null &&
    typeof layout === "object" &&
    !Array.isArray(layout) &&
    Object.hasOwn(layout, "text-field")
  );
}

/**
 * @param {unknown} layer
 */
function applyPosterBackgroundMapPaletteToLayers(layer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return [layer];
  }

  const layerObject =
    /** @type {{ id?: unknown, type?: unknown, "source-layer"?: unknown, filter?: unknown, paint?: unknown, layout?: unknown, minzoom?: unknown }} */ (
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
  const baseLayout = /** @type {Record<string, unknown>} */ (
    layerObject.layout &&
    typeof layerObject.layout === "object" &&
    !Array.isArray(layerObject.layout)
      ? layerObject.layout
      : {}
  );
  let layout = null;
  const posterFillPattern = type === "fill" ? getPosterFillPattern(id, paint) : null;

  if (type === "background") {
    paint["background-color"] = POSTER_BACKGROUND_MAP_PALETTE.background;
  } else if (type === "fill") {
    paint["fill-color"] = getPosterFillColor(sourceLayer, layerKey, layerObject.filter);
    if (hasMapLayerToken(layerKey, ["building"])) {
      paint["fill-outline-color"] = POSTER_BACKGROUND_MAP_PALETTE.buildingOutline;
    } else {
      delete paint["fill-outline-color"];
    }
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
    const isWaterLabel = isWaterLabelLayer(layerKey);

    paint["text-color"] = getPosterLabelColor(layerKey);
    paint["text-halo-color"] = POSTER_BACKGROUND_MAP_PALETTE.labelHalo;
    if (Object.hasOwn(OPENFREEMAP_ROAD_LABEL_MINZOOMS, id) || isWaterLabel) {
      paint["text-halo-width"] = 1;
    }

    if (isWaterLabel) {
      layout = createPosterWaterLabelLayout(baseLayout);
    }
  } else {
    return [{ ...layerObject }];
  }

  return [
    {
      ...layerObject,
      ...getPosterLayerZoomOverrides(id, layerObject.minzoom),
      ...(layout ? { layout } : {}),
      paint
    }
  ];
}

/**
 * @param {Record<string, unknown>} layout
 */
function createPosterWaterLabelLayout(layout) {
  return {
    ...layout,
    "text-font": ["Noto Sans Regular"],
    "text-letter-spacing": 0,
    "text-max-width": 8
  };
}

/**
 * @param {string} id
 * @param {unknown} minzoom
 */
function getPosterLayerZoomOverrides(id, minzoom) {
  if (Object.hasOwn(OPENFREEMAP_ROAD_LABEL_MINZOOMS, id)) {
    return { minzoom: OPENFREEMAP_ROAD_LABEL_MINZOOMS[id] };
  }

  if (id === "waterway_line_label") {
    return { minzoom: Math.min(getNumericMinzoom(minzoom), 12) };
  }

  return {};
}

/**
 * @param {unknown} minzoom
 */
function getNumericMinzoom(minzoom) {
  return Number.isFinite(minzoom) ? Number(minzoom) : 12;
}

/**
 * @param {unknown} layer
 */
function getLayerType(layer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return "";
  }

  const layerObject = /** @type {{ type?: unknown }} */ (layer);

  return typeof layerObject.type === "string" ? layerObject.type : "";
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
  paint["fill-opacity"] = POSTER_BACKGROUND_MAP_PATTERN_OVERLAY_OPACITY;
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
 * @param {string} sourceLayer
 * @param {string} layerKey
 * @param {unknown} filter
 */
function getPosterFillColor(sourceLayer, layerKey, filter) {
  if (hasMapLayerToken(layerKey, ["water", "waterway"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.water;
  }

  if (hasMapLayerToken(layerKey, ["building"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.building;
  }

  const areaDefinition = getPosterAreaDefinition(sourceLayer, filter);

  if (areaDefinition) {
    return areaDefinition.color;
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
    return POSTER_BACKGROUND_MAP_PALETTE.waterLine;
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
 * @param {string} sourceLayer
 * @param {unknown} filter
 */
function getPosterAreaDefinition(sourceLayer, filter) {
  const sourceLayerDefinition = POSTER_AREA_DEFINITIONS.find(
    (definition) =>
      definition.sourceLayer === sourceLayer && definition.classification === "source-layer"
  );

  if (sourceLayerDefinition) {
    return sourceLayerDefinition;
  }

  for (const propertyName of /** @type {const} */ (["class", "subclass"])) {
    const propertyAnalysis = analyzePositiveFilterProperty(filter, propertyName);
    const definition =
      propertyAnalysis &&
      getPositiveFilterAreaDefinition(sourceLayer, propertyName, propertyAnalysis.values);

    if (definition) {
      return definition;
    }
  }

  return undefined;
}

/**
 * @param {string} sourceLayer
 * @param {"class" | "subclass"} propertyName
 * @param {readonly string[]} propertyValues
 */
function getPositiveFilterAreaDefinition(sourceLayer, propertyName, propertyValues) {
  if (propertyValues.length === 0) {
    return undefined;
  }

  const definitionValuesKey = propertyName === "class" ? "classValues" : "subclassValues";

  return POSTER_AREA_DEFINITIONS.find(
    (definition) =>
      definition.sourceLayer === sourceLayer &&
      definition.classification === "positive-filter" &&
      definitionValuesKey in definition &&
      propertyValues.every((propertyValue) =>
        definition[definitionValuesKey].includes(propertyValue)
      )
  );
}

/**
 * @param {string} layerKey
 */
function getPosterLabelColor(layerKey) {
  if (isWaterLabelLayer(layerKey)) {
    return POSTER_BACKGROUND_MAP_PALETTE.waterLabel;
  }

  if (hasMapLayerToken(layerKey, ["trail", "path", "track"])) {
    return POSTER_BACKGROUND_MAP_PALETTE.trail;
  }

  return POSTER_BACKGROUND_MAP_PALETTE.label;
}

/**
 * @param {string} layerKey
 */
function isWaterLabelLayer(layerKey) {
  return hasMapLayerToken(layerKey, ["waterway", "water_name"]);
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

/**
 * @param {"class" | "subclass"} propertyName
 * @param {readonly string[]} values
 */
function createPositivePropertyFilter(propertyName, values) {
  if (values.length === 1) {
    return ["==", ["get", propertyName], values[0]];
  }

  return ["match", ["get", propertyName], [...values], true, false];
}

/**
 * @param {unknown} expression
 * @param {"class" | "subclass"} propertyName
 * @returns {{ values: string[], isExhaustive: boolean, hasPositiveSelector: boolean } | null}
 */
function analyzePositiveFilterProperty(expression, propertyName) {
  if (expression === undefined || expression === null || expression === true) {
    return { values: [], isExhaustive: true, hasPositiveSelector: false };
  }

  if (!Array.isArray(expression) || expression.length === 0) {
    return { values: [], isExhaustive: false, hasPositiveSelector: false };
  }

  const operator = expression[0];

  if (operator === "all") {
    /** @type {Set<string> | null} */
    let propertyValues = null;
    let isExhaustive = true;
    let hasPositiveSelector = false;

    for (const operand of expression.slice(1)) {
      const operandAnalysis = analyzePositiveFilterProperty(operand, propertyName);

      if (operandAnalysis === null) {
        return null;
      }

      isExhaustive = isExhaustive && operandAnalysis.isExhaustive;
      hasPositiveSelector = hasPositiveSelector || operandAnalysis.hasPositiveSelector;

      if (!operandAnalysis.hasPositiveSelector) {
        continue;
      }

      if (propertyValues === null) {
        propertyValues = new Set(operandAnalysis.values);
        continue;
      }

      for (const propertyValue of propertyValues) {
        if (!operandAnalysis.values.includes(propertyValue)) {
          propertyValues.delete(propertyValue);
        }
      }
    }

    return {
      values: propertyValues === null ? [] : [...propertyValues],
      isExhaustive,
      hasPositiveSelector
    };
  }

  if (operator === "any") {
    const propertyValues = new Set();

    for (const operand of expression.slice(1)) {
      const operandAnalysis = analyzePositiveFilterProperty(operand, propertyName);

      if (
        operandAnalysis === null ||
        !operandAnalysis.isExhaustive ||
        !operandAnalysis.hasPositiveSelector ||
        operandAnalysis.values.length === 0
      ) {
        return null;
      }

      for (const propertyValue of operandAnalysis.values) {
        propertyValues.add(propertyValue);
      }
    }

    return propertyValues.size === 0
      ? null
      : {
          values: [...propertyValues],
          isExhaustive: true,
          hasPositiveSelector: true
        };
  }

  if (operator === "==" && expression.length === 3) {
    const leftProperty = getFilterPropertyName(expression[1]);
    const rightProperty = getFilterPropertyName(expression[2]);

    if (leftProperty === propertyName) {
      return typeof expression[2] === "string"
        ? { values: [expression[2]], isExhaustive: true, hasPositiveSelector: true }
        : null;
    }

    if (rightProperty === propertyName) {
      return typeof expression[1] === "string"
        ? { values: [expression[1]], isExhaustive: true, hasPositiveSelector: true }
        : null;
    }

    return expressionContainsGet(expression, propertyName)
      ? null
      : { values: [], isExhaustive: false, hasPositiveSelector: false };
  }

  if (operator !== "match") {
    return expressionContainsGet(expression, propertyName)
      ? null
      : { values: [], isExhaustive: false, hasPositiveSelector: false };
  }

  if (expression.length < 5 || expression.length % 2 === 0 || expression.at(-1) !== false) {
    return null;
  }

  const positiveLabels = new Set();

  for (let index = 2; index < expression.length - 1; index += 2) {
    const output = expression[index + 1];

    if (output !== true && output !== false) {
      return null;
    }

    const labels = Array.isArray(expression[index]) ? expression[index] : [expression[index]];

    if (labels.length === 0) {
      return null;
    }

    if (output === true) {
      for (const label of labels) {
        positiveLabels.add(label);
      }
    }
  }

  if (getFilterPropertyName(expression[1]) === propertyName) {
    return [...positiveLabels].every((label) => typeof label === "string")
      ? {
          values: /** @type {string[]} */ ([...positiveLabels]),
          isExhaustive: true,
          hasPositiveSelector: true
        }
      : null;
  }

  if (
    Array.isArray(expression[1]) &&
    expression[1].length === 1 &&
    expression[1][0] === "geometry-type"
  ) {
    const polygonGeometryLabels = new Set(["Polygon", "MultiPolygon"]);
    const isPolygonGeometryGuard =
      positiveLabels.size === polygonGeometryLabels.size &&
      [...positiveLabels].every((label) => polygonGeometryLabels.has(label));

    return {
      values: [],
      isExhaustive: isPolygonGeometryGuard,
      hasPositiveSelector: false
    };
  }

  return expressionContainsGet(expression, propertyName)
    ? null
    : { values: [], isExhaustive: false, hasPositiveSelector: false };
}

/**
 * @param {unknown} expression
 */
function getFilterPropertyName(expression) {
  return Array.isArray(expression) &&
    expression.length === 2 &&
    expression[0] === "get" &&
    (expression[1] === "class" || expression[1] === "subclass")
    ? expression[1]
    : null;
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
