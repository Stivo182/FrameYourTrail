import { speedMpsToKmh } from "./speed-calibration.js";

// Shared track-analysis calibration values. Full rationale lives in
// docs/speed-calibration.md.
export const XY_JITTER_DISTANCE_METERS = 5;
export const XY_JITTER_MAX_SPEED_KMH = 0.9;
export const DEFAULT_MOVING_ON_SPEED_KMH = 1.5;
export const DEFAULT_MOVING_OFF_SPEED_KMH = 0.8;

/**
 * @param {number} distanceFromAnchorMeters
 * @param {number} pairDistanceMeters
 * @param {number | null} durationSeconds
 */
export function isLowSpeedXyJitterSegment(
  distanceFromAnchorMeters,
  pairDistanceMeters,
  durationSeconds
) {
  if (durationSeconds === null || durationSeconds <= 0 || pairDistanceMeters <= 0) {
    return false;
  }

  const speedKmh = speedMpsToKmh(pairDistanceMeters / durationSeconds);
  return (
    distanceFromAnchorMeters <= XY_JITTER_DISTANCE_METERS && speedKmh <= XY_JITTER_MAX_SPEED_KMH
  );
}
