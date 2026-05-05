import { haversineMeters } from "./haversine.js";
import { speedMpsToKmh } from "./speed-calibration.js";
import {
  DEFAULT_MOVING_OFF_SPEED_KMH,
  DEFAULT_MOVING_ON_SPEED_KMH
} from "./track-calibration-constants.js";
import { isValidDate } from "./track-time.js";

// Sustained slow-progress detection lets deliberate walking below the moving-on
// threshold count as moving, while still requiring enough local evidence.
const SLOW_PROGRESS_WINDOW_SECONDS = 300;
const SLOW_PROGRESS_MIN_DURATION_SECONDS = 120;
const SLOW_PROGRESS_MIN_PAIR_COUNT = 4;
const SLOW_PROGRESS_MIN_SPEED_KMH = 0.5;
const SLOW_PROGRESS_MIN_DISPLACEMENT_METERS = 12;
const SLOW_PROGRESS_LOW_NET_SPEED_KMH = 0.15;

// Direction-quality guards reject reversal-heavy low-speed drift that happens
// to accumulate enough distance inside the slow-progress window.
const SLOW_PROGRESS_DIRECTION_QUALITY_WINDOW_SECONDS = 900;
const SLOW_PROGRESS_DIRECTION_QUALITY_MAX_SEGMENT_POINTS = 120;
const SLOW_PROGRESS_DIRECTION_QUALITY_MIN_REVERSAL_COUNT = 3;
const SLOW_PROGRESS_DIRECTION_QUALITY_MIN_EFFICIENCY = 0.45;
const SLOW_PROGRESS_DIRECTION_QUALITY_MAX_BACKTRACK_TO_NET_RATIO = 1;
const SLOW_PROGRESS_BROAD_DIRECTION_QUALITY_MIN_EFFICIENCY = 0.03;
const SLOW_PROGRESS_BROAD_DIRECTION_QUALITY_MAX_BACKTRACK_TO_NET_RATIO = 20;

export const SLOW_PROGRESS_DIAGNOSTIC_THRESHOLDS = Object.freeze({
  slowProgressWindowSeconds: SLOW_PROGRESS_WINDOW_SECONDS,
  slowProgressMinDurationSeconds: SLOW_PROGRESS_MIN_DURATION_SECONDS,
  slowProgressMinPairCount: SLOW_PROGRESS_MIN_PAIR_COUNT,
  slowProgressMinSpeedKmh: SLOW_PROGRESS_MIN_SPEED_KMH,
  slowProgressMinDisplacementMeters: SLOW_PROGRESS_MIN_DISPLACEMENT_METERS,
  slowProgressLowNetSpeedKmh: SLOW_PROGRESS_LOW_NET_SPEED_KMH,
  slowProgressDirectionQualityWindowSeconds: SLOW_PROGRESS_DIRECTION_QUALITY_WINDOW_SECONDS,
  slowProgressDirectionQualityMaxSegmentPoints: SLOW_PROGRESS_DIRECTION_QUALITY_MAX_SEGMENT_POINTS,
  slowProgressDirectionQualityMinReversalCount: SLOW_PROGRESS_DIRECTION_QUALITY_MIN_REVERSAL_COUNT,
  slowProgressDirectionQualityMinEfficiency: SLOW_PROGRESS_DIRECTION_QUALITY_MIN_EFFICIENCY,
  slowProgressDirectionQualityMaxBacktrackToNetRatio:
    SLOW_PROGRESS_DIRECTION_QUALITY_MAX_BACKTRACK_TO_NET_RATIO,
  slowProgressBroadDirectionQualityMinEfficiency:
    SLOW_PROGRESS_BROAD_DIRECTION_QUALITY_MIN_EFFICIENCY,
  slowProgressBroadDirectionQualityMaxBacktrackToNetRatio:
    SLOW_PROGRESS_BROAD_DIRECTION_QUALITY_MAX_BACKTRACK_TO_NET_RATIO
});

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @param {TrackPoint[]} points
 * @param {number} pairIndex
 * @param {{ onSpeedKmh: number, offSpeedKmh: number } | undefined} thresholds
 * @param {{ continuousSegments: { startIndex: number, endIndex: number, pointCount: number }[] }} continuity
 */
export function isSustainedSlowProgressPair(points, pairIndex, thresholds, continuity) {
  return (
    thresholds !== undefined &&
    usesWalkingMovingThresholds(thresholds) &&
    hasSustainedSlowProgress(points, pairIndex, thresholds, continuity)
  );
}

/**
 * @param {{ onSpeedKmh: number, offSpeedKmh: number } | undefined} thresholds
 */
export function usesWalkingMovingThresholds(thresholds) {
  return (
    thresholds !== undefined &&
    thresholds.onSpeedKmh <= DEFAULT_MOVING_ON_SPEED_KMH &&
    thresholds.offSpeedKmh <= DEFAULT_MOVING_OFF_SPEED_KMH
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {number} pairIndex
 * @param {{ onSpeedKmh: number }} thresholds
 * @param {{ continuousSegments: { startIndex: number, endIndex: number, pointCount: number }[] }} continuity
 */
export function hasSustainedSlowProgress(points, pairIndex, thresholds, continuity) {
  const segment = getContinuousSegmentForPairIndex(pairIndex, continuity);

  if (segment === null) {
    return false;
  }

  const previousTimestamp = points[pairIndex - 1]?.timestamp;
  const currentTimestamp = points[pairIndex]?.timestamp;

  if (!isValidDate(previousTimestamp) || !isValidDate(currentTimestamp)) {
    return false;
  }

  const centerMs = (previousTimestamp.valueOf() + currentTimestamp.valueOf()) / 2;
  const halfWindowMs = (SLOW_PROGRESS_WINDOW_SECONDS * 1000) / 2;
  const windowStartMs = centerMs - halfWindowMs;
  const windowEndMs = centerMs + halfWindowMs;
  let firstIndex = null;
  let firstMs = null;
  let lastIndex = null;
  let lastMs = null;
  let pointCount = 0;

  for (let index = pairIndex - 1; index >= segment.startIndex; index -= 1) {
    const timestamp = points[index]?.timestamp;

    if (!isValidDate(timestamp)) {
      continue;
    }

    const timestampMs = timestamp.valueOf();

    if (timestampMs < windowStartMs) {
      break;
    }

    if (timestampMs > windowEndMs) {
      continue;
    }

    firstIndex = index;
    firstMs = timestampMs;
    pointCount += 1;
  }

  for (let index = pairIndex; index <= segment.endIndex; index += 1) {
    const timestamp = points[index]?.timestamp;

    if (!isValidDate(timestamp)) {
      continue;
    }

    const timestampMs = timestamp.valueOf();

    if (timestampMs > windowEndMs) {
      break;
    }

    if (timestampMs < windowStartMs) {
      continue;
    }

    lastIndex = index;
    lastMs = timestampMs;
    pointCount += 1;
  }

  if (
    firstIndex === null ||
    lastIndex === null ||
    firstMs === null ||
    lastMs === null ||
    pointCount - 1 < SLOW_PROGRESS_MIN_PAIR_COUNT
  ) {
    return false;
  }

  const durationSeconds = (lastMs - firstMs) / 1000;

  if (durationSeconds < SLOW_PROGRESS_MIN_DURATION_SECONDS) {
    return false;
  }

  const shouldCheckSegmentDirectionQuality =
    segment.pointCount <= SLOW_PROGRESS_DIRECTION_QUALITY_MAX_SEGMENT_POINTS;

  if (hasPoorSlowProgressDirectionQuality(points, firstIndex, lastIndex)) {
    return false;
  }

  const directionQualityRange = getTimedRangeAroundCenter(
    points,
    segment,
    pairIndex,
    centerMs,
    SLOW_PROGRESS_DIRECTION_QUALITY_WINDOW_SECONDS
  );

  if (
    directionQualityRange !== null &&
    hasPoorSlowProgressDirectionQuality(
      points,
      directionQualityRange.firstIndex,
      directionQualityRange.lastIndex,
      {
        maxBacktrackToNetRatio: SLOW_PROGRESS_BROAD_DIRECTION_QUALITY_MAX_BACKTRACK_TO_NET_RATIO,
        minEfficiency: SLOW_PROGRESS_BROAD_DIRECTION_QUALITY_MIN_EFFICIENCY
      }
    )
  ) {
    return false;
  }

  if (
    shouldCheckSegmentDirectionQuality &&
    hasPoorSlowProgressDirectionQuality(points, segment.startIndex, segment.endIndex)
  ) {
    return false;
  }

  const displacementMeters = haversineMeters(points[firstIndex], points[lastIndex]);
  const speedKmh = speedMpsToKmh(displacementMeters / durationSeconds);

  if (speedKmh > thresholds.onSpeedKmh) {
    return false;
  }

  return (
    speedKmh >= SLOW_PROGRESS_MIN_SPEED_KMH ||
    (speedKmh >= SLOW_PROGRESS_LOW_NET_SPEED_KMH &&
      displacementMeters >= SLOW_PROGRESS_MIN_DISPLACEMENT_METERS)
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {{ startIndex: number, endIndex: number }} segment
 * @param {number} pairIndex
 * @param {number} centerMs
 * @param {number} durationSeconds
 * @returns {{ firstIndex: number, lastIndex: number } | null}
 */
function getTimedRangeAroundCenter(points, segment, pairIndex, centerMs, durationSeconds) {
  const segmentStartTimestamp = points[segment.startIndex]?.timestamp;
  const segmentEndTimestamp = points[segment.endIndex]?.timestamp;

  if (!isValidDate(segmentStartTimestamp) || !isValidDate(segmentEndTimestamp)) {
    return null;
  }

  const segmentStartMs = segmentStartTimestamp.valueOf();
  const segmentEndMs = segmentEndTimestamp.valueOf();
  const halfWindowMs = (durationSeconds * 1000) / 2;
  const desiredDurationMs = durationSeconds * 1000;
  let windowStartMs = centerMs - halfWindowMs;
  let windowEndMs = centerMs + halfWindowMs;

  if (windowStartMs < segmentStartMs) {
    windowEndMs = Math.min(segmentEndMs, segmentStartMs + desiredDurationMs);
    windowStartMs = segmentStartMs;
  }

  if (windowEndMs > segmentEndMs) {
    windowStartMs = Math.max(segmentStartMs, segmentEndMs - desiredDurationMs);
    windowEndMs = segmentEndMs;
  }

  let firstIndex = null;
  let lastIndex = null;

  for (let index = pairIndex - 1; index >= segment.startIndex; index -= 1) {
    const timestamp = points[index]?.timestamp;

    if (!isValidDate(timestamp)) {
      continue;
    }

    const timestampMs = timestamp.valueOf();

    if (timestampMs < windowStartMs) {
      break;
    }

    if (timestampMs <= windowEndMs) {
      firstIndex = index;
    }
  }

  for (let index = pairIndex; index <= segment.endIndex; index += 1) {
    const timestamp = points[index]?.timestamp;

    if (!isValidDate(timestamp)) {
      continue;
    }

    const timestampMs = timestamp.valueOf();

    if (timestampMs > windowEndMs) {
      break;
    }

    if (timestampMs >= windowStartMs) {
      lastIndex = index;
    }
  }

  if (firstIndex === null || lastIndex === null || firstIndex === lastIndex) {
    return null;
  }

  return { firstIndex, lastIndex };
}

/**
 * @param {TrackPoint[]} points
 * @param {number} startIndex
 * @param {number} endIndex
 * @param {{ maxBacktrackToNetRatio?: number, minEfficiency?: number }} [options]
 */
function hasPoorSlowProgressDirectionQuality(points, startIndex, endIndex, options = {}) {
  const quality = getSlowProgressDirectionQuality(points, startIndex, endIndex);
  const minEfficiency = options.minEfficiency ?? SLOW_PROGRESS_DIRECTION_QUALITY_MIN_EFFICIENCY;
  const maxBacktrackToNetRatio =
    options.maxBacktrackToNetRatio ?? SLOW_PROGRESS_DIRECTION_QUALITY_MAX_BACKTRACK_TO_NET_RATIO;

  if (
    quality === null ||
    quality.reversalCount < SLOW_PROGRESS_DIRECTION_QUALITY_MIN_REVERSAL_COUNT
  ) {
    return false;
  }

  return (
    quality.efficiency < minEfficiency && quality.backtrackToNetRatio >= maxBacktrackToNetRatio
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {number} startIndex
 * @param {number} endIndex
 * @returns {{
 *   backtrackToNetRatio: number,
 *   efficiency: number,
 *   reversalCount: number
 * } | null}
 */
function getSlowProgressDirectionQuality(points, startIndex, endIndex) {
  const projection = getDominantAxisProjection(points, startIndex, endIndex);

  if (projection === null) {
    return null;
  }

  const { values } = projection;
  const netDeltaMeters = values[values.length - 1] - values[0];
  const netMeters = Math.abs(netDeltaMeters);
  const netDirection = Math.sign(netDeltaMeters);
  let previousDirection = 0;
  let pathMeters = 0;
  let backtrackMeters = 0;
  let reversalCount = 0;

  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];

    if (Math.abs(delta) < 1) {
      continue;
    }

    const stepMeters = Math.abs(delta);
    const direction = Math.sign(delta);
    pathMeters += stepMeters;

    if (netDirection !== 0 && direction !== netDirection) {
      backtrackMeters += stepMeters;
    }

    if (previousDirection !== 0 && direction !== previousDirection) {
      reversalCount += 1;
    }

    previousDirection = direction;
  }

  if (pathMeters === 0) {
    return null;
  }

  return {
    backtrackToNetRatio: netMeters > 0 ? backtrackMeters / netMeters : Number.POSITIVE_INFINITY,
    efficiency: netMeters / pathMeters,
    reversalCount
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {number} startIndex
 * @param {number} endIndex
 * @returns {{ values: number[] } | null}
 */
function getDominantAxisProjection(points, startIndex, endIndex) {
  const anchor = points[startIndex];
  const valuesX = [];
  const valuesY = [];
  const metersPerDegreeLatitude = 111319.49079327357;
  const metersPerDegreeLongitude =
    metersPerDegreeLatitude * Math.cos((anchor.latitude * Math.PI) / 180);

  for (let index = startIndex; index <= endIndex; index += 1) {
    if (!isValidDate(points[index]?.timestamp)) {
      continue;
    }

    valuesX.push((points[index].longitude - anchor.longitude) * metersPerDegreeLongitude);
    valuesY.push((points[index].latitude - anchor.latitude) * metersPerDegreeLatitude);
  }

  if (valuesX.length < 3) {
    return null;
  }

  const spanX = getRangeSpan(valuesX);
  const spanY = getRangeSpan(valuesY);
  const values = spanX >= spanY ? valuesX : valuesY;

  return { values };
}

/**
 * @param {number[]} values
 */
function getRangeSpan(values) {
  return Math.max(...values) - Math.min(...values);
}

/**
 * @param {number} pairIndex
 * @param {{ continuousSegments: { startIndex: number, endIndex: number, pointCount: number }[] }} continuity
 */
function getContinuousSegmentForPairIndex(pairIndex, continuity) {
  for (const segment of continuity.continuousSegments) {
    if (pairIndex > segment.startIndex && pairIndex <= segment.endIndex) {
      return segment;
    }
  }

  return null;
}
