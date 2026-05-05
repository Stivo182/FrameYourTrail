/**
 * @param {unknown} source
 * @returns {"barometric" | "terrain" | "gpx" | "unknown"}
 */
export function normalizeElevationSource(source) {
  if (source === "barometric" || source === "terrain" || source === "gpx") {
    return source;
  }
  return "unknown";
}

/**
 * @param {{ elevationSource?: unknown }} previous
 * @param {{ elevationSource?: unknown }} point
 * @returns {boolean}
 */
export function hasElevationSourceSwitch(previous, point) {
  return (
    normalizeElevationSource(previous.elevationSource) !==
    normalizeElevationSource(point.elevationSource)
  );
}
