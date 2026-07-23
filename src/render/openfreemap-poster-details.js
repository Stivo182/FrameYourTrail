import { getLayerType, getMapTextLabelBoundaryIndex } from "./map-style-layer-order.js";
import { insertSupplementalPosterAreaLayers } from "./openfreemap-poster-areas.js";
import {
  OPENFREEMAP_NAME_TEXT_FIELD,
  POSTER_BACKGROUND_MAP_PALETTE,
  SUPPLEMENTAL_POSTER_LABEL_DEFINITIONS,
  SUPPLEMENTAL_POSTER_LABEL_PAINT
} from "./openfreemap-poster-config.js";

/**
 * @param {Record<string, unknown>} style
 */
export function createSupplementalVectorSourceResolver(style) {
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
export function insertSupplementalPosterDetailLayers(layers, resolveSource) {
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
 * @param {unknown} layer
 */
