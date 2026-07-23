import { getLayerType, normalizeMapTextLabelTier } from "./map-style-layer-order.js";
import { getPosterAreaDefinition, isHiddenPosterAreaLayer } from "./openfreemap-poster-areas.js";
import {
  OPENFREEMAP_ROAD_LABEL_MINZOOMS,
  POSTER_BACKGROUND_MAP_PALETTE,
  POSTER_BACKGROUND_MAP_PATTERN_LAYER_IDS,
  POSTER_BACKGROUND_MAP_PATTERN_OVERLAY_OPACITY
} from "./openfreemap-poster-config.js";
import {
  createSupplementalVectorSourceResolver,
  insertSupplementalPosterDetailLayers
} from "./openfreemap-poster-details.js";

/**
 * @param {unknown} style
 */
export function applyPosterBackgroundMapPalette(style) {
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

  if (
    (type === "fill" && isHiddenPosterAreaLayer(sourceLayer, layerObject.filter)) ||
    isRoadShieldLayer(type, sourceLayer, id)
  ) {
    return [];
  }

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
 * @param {string} type
 * @param {string} sourceLayer
 * @param {string} id
 */
function isRoadShieldLayer(type, sourceLayer, id) {
  return (
    type === "symbol" &&
    sourceLayer === "transportation_name" &&
    hasMapLayerToken(id.toLowerCase(), ["shield"])
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
