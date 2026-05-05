import { speedMpsToKmh } from "./speed-calibration.js";
import { classifySpeedReliabilityProfile } from "./speed-profile.js";
import {
  getContinuousPairDistanceMeters,
  getMovingPairDistanceMeters,
  isRouteDistancePair,
  isRouteJitterPair
} from "./track-continuity.js";
import { secondsBetween } from "./track-time.js";

// Keep diagnostics bounded for very noisy files while still exposing examples.
const SPEED_OUTLIER_DETAIL_LIMIT = 50;

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @typedef {object} DistanceSample
 * @property {number} index
 * @property {number} distanceFromStartMeters
 * @property {number} latitude
 * @property {number} longitude
 * @property {number | null} elevation
 * @property {Date | null} timestamp
 * @property {number} spanIndex
 */

/**
 * @typedef {object} SpeedSample
 * @property {number} index
 * @property {number} startDistanceFromStartMeters
 * @property {number} distanceFromStartMeters
 * @property {number} distanceMeters
 * @property {number} durationSeconds
 * @property {number} rawSpeedKmh
 * @property {number} speedKmh
 */

/**
 * @param {TrackPoint[]} points
 * @param {ReturnType<import("./track-continuity.js").createContinuityModel>} continuity
 * @returns {DistanceSample[]}
 */
export function buildDistanceSeries(points, continuity) {
  let distanceFromStartMeters = 0;
  let spanIndex = 0;

  return points.map((point, index) => {
    if (index > 0) {
      // Durable stationary XY jitter stays in the point stream for timestamps/charts,
      // but it must not inflate user-visible route distance.
      if (isRouteDistancePair(points, index) && !isRouteJitterPair(index, continuity)) {
        distanceFromStartMeters += getContinuousPairDistanceMeters(points, index);
      } else if (!isRouteDistancePair(points, index)) {
        spanIndex += 1;
      }
    }

    return {
      index,
      distanceFromStartMeters,
      latitude: point.latitude,
      longitude: point.longitude,
      elevation: point.elevation,
      timestamp: point.timestamp,
      spanIndex
    };
  });
}

/**
 * @param {TrackPoint[]} points
 * @param {DistanceSample[]} distanceSeries
 * @param {ReturnType<import("./track-continuity.js").createContinuityModel>} continuity
 * @returns {number | null}
 */
export function getTotalDistance3dMeters(points, distanceSeries, continuity) {
  let totalDistanceMeters = 0;
  let hasContinuousPair = false;

  for (let index = 1; index < points.length; index += 1) {
    if (!isRouteDistancePair(points, index)) {
      continue;
    }

    if (isRouteJitterPair(index, continuity)) {
      hasContinuousPair = true;
      continue;
    }

    const previousElevation = points[index - 1].elevation;
    const currentElevation = points[index].elevation;

    if (!Number.isFinite(previousElevation) || !Number.isFinite(currentElevation)) {
      return null;
    }

    const horizontalMeters = Math.max(
      0,
      distanceSeries[index].distanceFromStartMeters -
        distanceSeries[index - 1].distanceFromStartMeters
    );
    totalDistanceMeters += Math.hypot(
      horizontalMeters,
      Number(currentElevation) - Number(previousElevation)
    );
    hasContinuousPair = true;
  }

  return hasContinuousPair ? totalDistanceMeters : null;
}

/**
 * @param {TrackPoint[]} points
 * @param {DistanceSample[]} distanceSeries
 * @param {ReturnType<import("./track-continuity.js").createContinuityModel>} continuity
 * @returns {SpeedSample[]}
 */
export function buildRawSpeedSeries(points, distanceSeries, continuity) {
  const series = [];

  for (let index = 1; index < points.length; index += 1) {
    if (!isSpeedTimingPair(points, index, continuity)) {
      continue;
    }

    const seconds = secondsBetween(points[index - 1], points[index]);
    const meters = getMovingPairDistanceMeters(points, index, continuity);

    if (seconds !== null && seconds > 0) {
      const rawSpeedKmh = speedMpsToKmh(meters / seconds);

      series.push({
        index,
        startDistanceFromStartMeters: distanceSeries[index - 1].distanceFromStartMeters,
        distanceFromStartMeters: distanceSeries[index].distanceFromStartMeters,
        distanceMeters: meters,
        durationSeconds: seconds,
        rawSpeedKmh,
        speedKmh: rawSpeedKmh
      });
    }
  }

  return series;
}

/**
 * @param {SpeedSample[]} series
 * @returns {SpeedSample[]}
 */
function smoothSpeed(series) {
  return series.map((item, index) => {
    const start = Math.max(0, index - 2);
    const end = Math.min(series.length, index + 3);
    let speedKmhTotal = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      speedKmhTotal += series[sampleIndex].speedKmh;
    }

    const speedKmh = speedKmhTotal / (end - start);
    return { ...item, speedKmh };
  });
}

/**
 * @param {SpeedSample[]} rawSeries
 * @param {{ requestedProfile?: unknown, fallbackProfile?: unknown }} options
 */
export function getReliableSpeedSeries(rawSeries, options) {
  const speedsKmh = rawSeries
    .map((sample) => sample.rawSpeedKmh)
    .filter((speed) => Number.isFinite(speed));
  const profileResult = classifySpeedReliabilityProfile(speedsKmh, {
    requestedProfile: options.requestedProfile,
    fallbackProfile: options.fallbackProfile
  });
  const maxReliableSpeedMps = profileResult.maxReliableSpeedMps;
  const maxReliableSpeedKmh = profileResult.maxReliableSpeedKmh;
  const speedReliabilitySignals = {
    ...profileResult.signals,
    rejectedShareByProfile: profileResult.rejectedShareByProfile
  };
  const reliableSeries = [];
  const speedOutlierSamples = [];

  for (const sample of rawSeries) {
    if (isReliableSpeedSample(sample, maxReliableSpeedKmh)) {
      reliableSeries.push(sample);
      continue;
    }

    if (speedOutlierSamples.length < SPEED_OUTLIER_DETAIL_LIMIT) {
      speedOutlierSamples.push({
        index: sample.index,
        rawSpeedKmh: sample.rawSpeedKmh,
        durationSeconds: sample.durationSeconds,
        distanceMeters: sample.distanceMeters,
        startDistanceFromStartMeters: sample.startDistanceFromStartMeters,
        distanceFromStartMeters: sample.distanceFromStartMeters
      });
    }
  }

  const speedOutlierCount = rawSeries.length - reliableSeries.length;

  const thresholds = {
    speedReliabilityProfile: profileResult.profile,
    speedReliabilityProfileSource: profileResult.source,
    speedReliabilitySignals,
    maxReliableSpeedMps,
    maxReliableSpeedKmh,
    speedOutlierDetailLimit: SPEED_OUTLIER_DETAIL_LIMIT
  };

  if (profileResult.warnings.length > 0) {
    thresholds.speedReliabilityWarnings = profileResult.warnings;
  }

  return {
    speedSeries: smoothSpeed(reliableSeries),
    diagnostics: {
      rawSampleCount: rawSeries.length,
      reliableSampleCount: reliableSeries.length,
      speedOutlierCount,
      speedOutlierSamples,
      filtersApplied: speedOutlierCount > 0 ? ["speed_outlier"] : [],
      confidenceFlags: [],
      thresholds
    }
  };
}

/**
 * @param {SpeedSample} sample
 * @param {number | null} maxReliableSpeedKmh
 */
function isReliableSpeedSample(sample, maxReliableSpeedKmh) {
  return maxReliableSpeedKmh === null || sample.rawSpeedKmh <= maxReliableSpeedKmh;
}

/**
 * @param {TrackPoint[]} points
 * @param {DistanceSample[]} distanceSeries
 */
export function buildSlopeSeries(points, distanceSeries) {
  const series = [];
  const firstSampleBySpan = new Map();
  const cursorIndexBySpan = new Map();

  if (distanceSeries.length > 0) {
    firstSampleBySpan.set(distanceSeries[0].spanIndex, distanceSeries[0]);
    cursorIndexBySpan.set(distanceSeries[0].spanIndex, 0);
  }

  for (let index = 1; index < points.length; index += 1) {
    const currentSample = distanceSeries[index];
    const { spanIndex } = currentSample;

    if (!firstSampleBySpan.has(spanIndex)) {
      firstSampleBySpan.set(spanIndex, currentSample);
      cursorIndexBySpan.set(spanIndex, index);
    }

    const targetDistance = currentSample.distanceFromStartMeters - 100;
    let cursorIndex = cursorIndexBySpan.get(spanIndex) ?? index;

    while (
      cursorIndex + 1 < index &&
      distanceSeries[cursorIndex + 1].spanIndex === spanIndex &&
      distanceSeries[cursorIndex + 1].distanceFromStartMeters <= targetDistance
    ) {
      cursorIndex += 1;
    }

    cursorIndexBySpan.set(spanIndex, cursorIndex);

    const candidate = distanceSeries[cursorIndex];
    const previous =
      candidate?.spanIndex === spanIndex && candidate.distanceFromStartMeters <= targetDistance
        ? candidate
        : firstSampleBySpan.get(spanIndex);
    const currentElevation = points[index].elevation;

    if (previous && Number.isFinite(previous.elevation) && Number.isFinite(currentElevation)) {
      const distanceDelta =
        currentSample.distanceFromStartMeters - previous.distanceFromStartMeters;
      const elevationDelta = Number(currentElevation) - Number(previous.elevation);
      series.push({
        index,
        distanceFromStartMeters: currentSample.distanceFromStartMeters,
        slopePercent: distanceDelta > 0 ? (elevationDelta / distanceDelta) * 100 : 0
      });
    }
  }

  return series;
}

/**
 * @param {number} totalDistanceMeters
 * @param {{ speedOutlierCount: number }} speedDiagnostics
 * @param {SpeedSample[]} speedSeries
 * @returns {number | null}
 */
export function getSpeedAverageDistanceMeters(totalDistanceMeters, speedDiagnostics, speedSeries) {
  if (speedDiagnostics.speedOutlierCount <= 0) {
    return totalDistanceMeters;
  }

  const reliableDistanceMeters = getSpeedSeriesDistanceMeters(speedSeries);

  return reliableDistanceMeters > 0 ? reliableDistanceMeters : null;
}

/**
 * @param {SpeedSample[]} speedSeries
 * @returns {number}
 */
function getSpeedSeriesDistanceMeters(speedSeries) {
  let distanceMeters = 0;

  for (const sample of speedSeries) {
    distanceMeters += sample.distanceMeters;
  }

  return distanceMeters;
}

/**
 * @param {SpeedSample[]} speedSeries
 * @returns {number | null}
 */
export function getMaxRawSpeedKmh(speedSeries) {
  let maxSpeedKmh = null;

  for (const item of speedSeries) {
    if (maxSpeedKmh === null || item.rawSpeedKmh > maxSpeedKmh) {
      maxSpeedKmh = item.rawSpeedKmh;
    }
  }

  return maxSpeedKmh;
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 * @param {ReturnType<import("./track-continuity.js").createContinuityModel>} continuity
 */
function isSpeedTimingPair(points, index, continuity) {
  return (
    isRouteDistancePair(points, index) &&
    (!continuity.timeGapBreakIndexes.has(index) || continuity.movingTimeGapBridgeIndexes.has(index))
  );
}
