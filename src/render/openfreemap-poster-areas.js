import {
  analyzePositiveFilterProperty,
  createPositivePropertyFilter
} from "./maplibre-style-filters.js";
import { getLayerType } from "./map-style-layer-order.js";
import {
  POSTER_AREA_DEFINITIONS,
  SUPPLEMENTAL_POSTER_AREA_BARRIER_SOURCE_LAYERS
} from "./openfreemap-poster-config.js";

export function insertSupplementalPosterAreaLayers(layers, resolveSource) {
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

    if ("hidden" in definition && definition.hidden) {
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
 * @param {string} sourceLayer
 * @param {unknown} filter
 */
export function getPosterAreaDefinition(sourceLayer, filter) {
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
 * @param {unknown} filter
 */
export function isHiddenPosterAreaLayer(sourceLayer, filter) {
  const definition = getPosterAreaDefinition(sourceLayer, filter);
  return Boolean(definition && "hidden" in definition && definition.hidden);
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
