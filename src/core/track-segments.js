import { speedMpsToKmh } from "./speed-calibration.js";

// Segment summaries use coarse distance buckets for stable report rows.
const SEGMENT_DISTANCE_METERS = 5000;

/**
 * @typedef {object} DistanceSample
 * @property {number} distanceFromStartMeters
 */

/**
 * @typedef {object} SpeedSample
 * @property {number} startDistanceFromStartMeters
 * @property {number} distanceFromStartMeters
 * @property {number} distanceMeters
 * @property {number} durationSeconds
 */

/**
 * @param {DistanceSample[]} distanceSeries
 * @param {SpeedSample[]} speedSeries
 */
export function buildSegments(distanceSeries, speedSeries) {
  const totalDistanceMeters = distanceSeries.at(-1)?.distanceFromStartMeters ?? 0;
  const count = Math.max(1, Math.ceil(totalDistanceMeters / SEGMENT_DISTANCE_METERS));

  return Array.from({ length: count }, (_item, index) => {
    const startMeters = index * SEGMENT_DISTANCE_METERS;
    const endMeters = Math.min((index + 1) * SEGMENT_DISTANCE_METERS, totalDistanceMeters);
    const timing = getSegmentTiming(speedSeries, startMeters, endMeters);

    return {
      index: index + 1,
      startMeters,
      endMeters,
      distanceMeters: endMeters - startMeters,
      averageSpeedKmh: timing.averageSpeedKmh,
      durationSeconds: timing.durationSeconds
    };
  });
}

/**
 * @param {SpeedSample[]} speedSeries
 * @param {number} segmentStartMeters
 * @param {number} segmentEndMeters
 * @returns {{ averageSpeedKmh: number | null, durationSeconds: number | null }}
 */
function getSegmentTiming(speedSeries, segmentStartMeters, segmentEndMeters) {
  let timedDistanceMeters = 0;
  let durationSeconds = 0;

  for (const sample of speedSeries) {
    const sampleStartMeters = sample.startDistanceFromStartMeters;
    const sampleEndMeters = sample.distanceFromStartMeters;
    const routeDistanceMeters = sampleEndMeters - sampleStartMeters;
    const movingDistanceMeters = sample.distanceMeters;
    const overlapStartMeters = Math.max(segmentStartMeters, sampleStartMeters);
    const overlapEndMeters = Math.min(segmentEndMeters, sampleEndMeters);
    const overlapMeters = overlapEndMeters - overlapStartMeters;

    if (overlapMeters <= 0 || routeDistanceMeters <= 0 || movingDistanceMeters <= 0) {
      continue;
    }

    const overlapRatio = overlapMeters / routeDistanceMeters;
    timedDistanceMeters += movingDistanceMeters * overlapRatio;
    durationSeconds += sample.durationSeconds * overlapRatio;
  }

  if (durationSeconds <= 0) {
    return {
      averageSpeedKmh: null,
      durationSeconds: null
    };
  }

  return {
    averageSpeedKmh: speedMpsToKmh(timedDistanceMeters / durationSeconds),
    durationSeconds
  };
}
