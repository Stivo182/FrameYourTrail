import { TIME_GAP_ELEVATION_DISCONTINUITY_METERS } from "./elevation-calibration-constants.js";

/**
 * @param {unknown} value
 */
export function normalizeElevationSegmentIndex(value) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

/**
 * @param {unknown} value
 */
export function normalizeFiniteElevationSegmentIndex(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

/**
 * @param {number} sourceIndex
 * @param {Set<number> | undefined} timeGapBreakIndexes
 * @param {{ elevation?: unknown } | undefined} previous
 * @param {{ elevation?: unknown }} point
 */
export function hasTimeGapElevationDiscontinuity(
  sourceIndex,
  timeGapBreakIndexes,
  previous,
  point
) {
  return (
    previous !== undefined &&
    timeGapBreakIndexes?.has(sourceIndex) === true &&
    Number.isFinite(previous.elevation) &&
    Number.isFinite(point.elevation) &&
    Math.abs(Number(point.elevation) - Number(previous.elevation)) >=
      TIME_GAP_ELEVATION_DISCONTINUITY_METERS
  );
}
