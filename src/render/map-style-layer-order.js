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
export function normalizeMapTextLabelTier(layers) {
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
export function getLayerType(layer) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
    return "";
  }

  const layerObject = /** @type {{ type?: unknown }} */ (layer);

  return typeof layerObject.type === "string" ? layerObject.type : "";
}
