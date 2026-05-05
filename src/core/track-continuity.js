import { haversineMeters } from "./haversine.js";
import { HARD_SPEED_CEILING_MPS, speedMpsToKmh } from "./speed-calibration.js";
import {
  XY_JITTER_DISTANCE_METERS,
  XY_JITTER_MAX_SPEED_KMH,
  isLowSpeedXyJitterSegment
} from "./track-calibration-constants.js";
import { isSustainedSlowProgressPair } from "./track-slow-progress.js";
import {
  collectPositiveTimeGaps,
  getMedian,
  isValidDate,
  REGULAR_RECORDING_MAX_SECONDS,
  secondsBetween
} from "./track-time.js";

// Route-distance jitter suppression is intentionally stricter than speed-sample
// jitter suppression: short wobble near real movement stays in route geometry.
const ROUTE_XY_JITTER_MIN_PAIR_COUNT = 25;
const ROUTE_XY_JITTER_BOUNDED_MIN_PAIR_COUNT = 8;
const ROUTE_XY_JITTER_BOUNDED_MAX_SPAN_METERS = 25;
const ROUTE_XY_JITTER_BOUNDED_MIN_SHARE = 0.4;

// Only smart/sparse recordings may bridge long time gaps for moving-time
// estimation; dense/regular logs keep long gaps as recording interruptions.
const MOVING_TIME_GAP_BRIDGE_MIN_MEDIAN_SECONDS = REGULAR_RECORDING_MAX_SECONDS;

// Sparse bridge speeds above the hard point-cleaning ceiling are still treated
// as discontinuities instead of plausible hidden movement.
const MOVING_TIME_GAP_BRIDGE_MAX_SPEED_KMH = speedMpsToKmh(HARD_SPEED_CEILING_MPS);

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @param {TrackPoint[]} points
 */
export function hasSegmentBreaks(points) {
  for (let index = 1; index < points.length; index += 1) {
    if (!isSameSegment(points[index - 1], points[index])) {
      return true;
    }
  }

  return false;
}

/**
 * @param {TrackPoint} left
 * @param {TrackPoint} right
 */
export function isSameSegment(left, right) {
  return getSegmentIndex(left) === getSegmentIndex(right);
}

/**
 * @param {TrackPoint} point
 */
export function getSegmentIndex(point) {
  return Number.isFinite(point.segmentIndex) ? Number(point.segmentIndex) : 0;
}

/**
 * @param {TrackPoint[]} points
 * @param {{ movingThresholds?: { onSpeedKmh: number, offSpeedKmh: number } }} [options]
 */
export function createContinuityModel(points, options = {}) {
  const positiveGaps = collectPositiveTimeGaps(points);
  const medianGapSeconds = getMedian(positiveGaps);
  const timeGapThresholdSeconds =
    medianGapSeconds === null ? null : getTimeGapThresholdSeconds(medianGapSeconds);
  const timeGapBreakIndexes = new Set();
  const timeGapBreaks = [];
  const movingTimeGapBridgeIndexes = new Set();
  const movingTimeGapBridges = [];
  const xyJitterSegmentIndexes = new Set();
  const xyJitterSegments = [];

  if (timeGapThresholdSeconds !== null) {
    for (let index = 1; index < points.length; index += 1) {
      if (!isSameSegment(points[index - 1], points[index])) {
        continue;
      }

      const durationSeconds = secondsBetween(points[index - 1], points[index]);

      if (durationSeconds !== null && durationSeconds > timeGapThresholdSeconds) {
        timeGapBreakIndexes.add(index);
        timeGapBreaks.push({
          index,
          durationSeconds
        });

        const movingBridge = getMovingTimeGapBridge(points, index, {
          durationSeconds,
          medianGapSeconds,
          movingThresholds: options.movingThresholds
        });

        if (movingBridge !== null) {
          movingTimeGapBridgeIndexes.add(index);
          movingTimeGapBridges.push(movingBridge);
        }
      }
    }
  }

  const continuousSegments = buildContinuousSegments(points, timeGapBreakIndexes);
  const progressContinuity = { continuousSegments };
  let xyAnchorPoint = points[0];

  for (let index = 1; index < points.length; index += 1) {
    if (!isSameSegment(points[index - 1], points[index]) || timeGapBreakIndexes.has(index)) {
      xyAnchorPoint = points[index];
      continue;
    }

    const durationSeconds = secondsBetween(points[index - 1], points[index]);
    const pairDistanceMeters = haversineMeters(points[index - 1], points[index]);
    const distanceFromAnchorMeters = haversineMeters(xyAnchorPoint, points[index]);

    if (
      isLowSpeedXyJitterSegment(distanceFromAnchorMeters, pairDistanceMeters, durationSeconds) &&
      !isSustainedSlowProgressPair(points, index, options.movingThresholds, progressContinuity)
    ) {
      xyJitterSegmentIndexes.add(index);
      xyJitterSegments.push({
        index,
        distanceMeters: pairDistanceMeters,
        distanceFromAnchorMeters,
        durationSeconds: Number(durationSeconds)
      });
    } else {
      xyAnchorPoint = points[index];
    }
  }

  const routeXyJitterSegmentIndexes = getRouteXyJitterSegmentIndexes(
    points,
    xyJitterSegments,
    continuousSegments
  );

  return {
    timeGapBreakIndexes,
    movingTimeGapBridgeIndexes,
    xyJitterSegmentIndexes,
    routeXyJitterSegmentIndexes,
    continuousSegments,
    diagnostics: {
      medianGapSeconds,
      timeGapThresholdSeconds,
      timeGapBreakCount: timeGapBreaks.length,
      timeGapBreaks,
      movingTimeGapBridgeCount: movingTimeGapBridges.length,
      movingTimeGapBridges,
      continuousSegmentCount: continuousSegments.length,
      continuousSegments,
      xyJitterSegmentCount: xyJitterSegments.length,
      routeXyJitterSegmentCount: routeXyJitterSegmentIndexes.size,
      xyJitterSegments,
      thresholds: {
        xyJitterDistanceMeters: XY_JITTER_DISTANCE_METERS,
        xyJitterMaxSpeedKmh: XY_JITTER_MAX_SPEED_KMH,
        routeXyJitterMinPairCount: ROUTE_XY_JITTER_MIN_PAIR_COUNT,
        routeXyJitterBoundedMinPairCount: ROUTE_XY_JITTER_BOUNDED_MIN_PAIR_COUNT,
        routeXyJitterBoundedMaxSpanMeters: ROUTE_XY_JITTER_BOUNDED_MAX_SPAN_METERS,
        routeXyJitterBoundedMinShare: ROUTE_XY_JITTER_BOUNDED_MIN_SHARE,
        movingTimeGapBridgeMinMedianSeconds: MOVING_TIME_GAP_BRIDGE_MIN_MEDIAN_SECONDS,
        movingTimeGapBridgeMaxSpeedKmh: MOVING_TIME_GAP_BRIDGE_MAX_SPEED_KMH
      }
    }
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 * @param {{
 *   durationSeconds: number,
 *   medianGapSeconds: number | null,
 *   movingThresholds?: { onSpeedKmh: number, offSpeedKmh: number }
 * }} options
 * @returns {{ index: number, durationSeconds: number, distanceMeters: number, speedKmh: number } | null}
 */
function getMovingTimeGapBridge(points, index, options) {
  if (
    options.medianGapSeconds === null ||
    options.medianGapSeconds <= MOVING_TIME_GAP_BRIDGE_MIN_MEDIAN_SECONDS ||
    !options.movingThresholds
  ) {
    return null;
  }

  const distanceMeters = haversineMeters(points[index - 1], points[index]);
  const speedKmh = speedMpsToKmh(distanceMeters / options.durationSeconds);

  if (
    !Number.isFinite(speedKmh) ||
    speedKmh < options.movingThresholds.onSpeedKmh ||
    speedKmh > MOVING_TIME_GAP_BRIDGE_MAX_SPEED_KMH
  ) {
    return null;
  }

  return {
    index,
    durationSeconds: options.durationSeconds,
    distanceMeters,
    speedKmh
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {{ index: number }[]} xyJitterSegments
 * @param {{ startIndex: number, endIndex: number }[]} continuousSegments
 * @returns {Set<number>}
 */
function getRouteXyJitterSegmentIndexes(points, xyJitterSegments, continuousSegments) {
  const routeXyJitterSegmentIndexes = new Set();
  const xyJitterSegmentIndexes = new Set(xyJitterSegments.map((segment) => segment.index));

  addDurableRouteXyJitterRuns(routeXyJitterSegmentIndexes, xyJitterSegments);
  addBoundedRouteXyJitterSegments(
    routeXyJitterSegmentIndexes,
    xyJitterSegmentIndexes,
    points,
    continuousSegments
  );

  return routeXyJitterSegmentIndexes;
}

/**
 * @param {Set<number>} routeXyJitterSegmentIndexes
 * @param {{ index: number }[]} xyJitterSegments
 */
function addDurableRouteXyJitterRuns(routeXyJitterSegmentIndexes, xyJitterSegments) {
  /** @type {{ index: number }[]} */
  let run = [];
  const flushRun = () => {
    if (run.length >= ROUTE_XY_JITTER_MIN_PAIR_COUNT) {
      for (const segment of run) {
        routeXyJitterSegmentIndexes.add(segment.index);
      }
    }

    run = [];
  };

  for (const segment of xyJitterSegments) {
    if (run.length === 0 || segment.index === run[run.length - 1].index + 1) {
      run.push(segment);
    } else {
      flushRun();
      run = [segment];
    }
  }

  flushRun();
}

/**
 * @param {Set<number>} routeXyJitterSegmentIndexes
 * @param {Set<number>} xyJitterSegmentIndexes
 * @param {TrackPoint[]} points
 * @param {{ startIndex: number, endIndex: number }[]} continuousSegments
 */
function addBoundedRouteXyJitterSegments(
  routeXyJitterSegmentIndexes,
  xyJitterSegmentIndexes,
  points,
  continuousSegments
) {
  for (const segment of continuousSegments) {
    const pairCount = segment.endIndex - segment.startIndex;

    if (pairCount <= 0) {
      continue;
    }

    let xyJitterPairCount = 0;

    for (let index = segment.startIndex + 1; index <= segment.endIndex; index += 1) {
      if (xyJitterSegmentIndexes.has(index)) {
        xyJitterPairCount += 1;
      }
    }

    if (
      xyJitterPairCount === pairCount ||
      isBoundedStationaryRouteJitterSegment(points, segment, pairCount, xyJitterPairCount)
    ) {
      for (let index = segment.startIndex + 1; index <= segment.endIndex; index += 1) {
        if (xyJitterSegmentIndexes.has(index)) {
          routeXyJitterSegmentIndexes.add(index);
        }
      }
    }
  }
}

/**
 * @param {TrackPoint[]} points
 * @param {{ startIndex: number, endIndex: number }} segment
 * @param {number} pairCount
 * @param {number} xyJitterPairCount
 */
function isBoundedStationaryRouteJitterSegment(points, segment, pairCount, xyJitterPairCount) {
  return (
    pairCount >= ROUTE_XY_JITTER_BOUNDED_MIN_PAIR_COUNT &&
    xyJitterPairCount / pairCount >= ROUTE_XY_JITTER_BOUNDED_MIN_SHARE &&
    getPointSpanMeters(points, segment.startIndex, segment.endIndex) <=
      ROUTE_XY_JITTER_BOUNDED_MAX_SPAN_METERS
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {number} startIndex
 * @param {number} endIndex
 */
function getPointSpanMeters(points, startIndex, endIndex) {
  let minLatitude = Infinity;
  let maxLatitude = -Infinity;
  let minLongitude = Infinity;
  let maxLongitude = -Infinity;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const point = points[index];
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
  }

  const middleLatitude = (minLatitude + maxLatitude) / 2;
  const middleLongitude = (minLongitude + maxLongitude) / 2;

  return Math.max(
    haversineMeters(
      { latitude: minLatitude, longitude: middleLongitude },
      { latitude: maxLatitude, longitude: middleLongitude }
    ),
    haversineMeters(
      { latitude: middleLatitude, longitude: minLongitude },
      { latitude: middleLatitude, longitude: maxLongitude }
    )
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {Set<number>} timeGapBreakIndexes
 */
function buildContinuousSegments(points, timeGapBreakIndexes) {
  if (points.length === 0) {
    return [];
  }

  const segments = [];
  let startIndex = 0;

  for (let index = 1; index < points.length; index += 1) {
    if (!isSameSegment(points[index - 1], points[index]) || timeGapBreakIndexes.has(index)) {
      segments.push(createContinuousSegment(points, segments.length, startIndex, index - 1));
      startIndex = index;
    }
  }

  segments.push(createContinuousSegment(points, segments.length, startIndex, points.length - 1));
  return segments;
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 * @param {number} startIndex
 * @param {number} endIndex
 */
function createContinuousSegment(points, index, startIndex, endIndex) {
  return {
    index,
    startIndex,
    endIndex,
    pointCount: endIndex - startIndex + 1,
    durationSeconds: getRangeDurationSeconds(points, startIndex, endIndex)
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {number} startIndex
 * @param {number} endIndex
 * @returns {number | null}
 */
function getRangeDurationSeconds(points, startIndex, endIndex) {
  let firstTimedPoint = null;
  let lastTimedPoint = null;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const point = points[index];

    if (!isValidDate(point.timestamp)) {
      continue;
    }

    firstTimedPoint ??= point;
    lastTimedPoint = point;
  }

  if (firstTimedPoint === null || lastTimedPoint === null || firstTimedPoint === lastTimedPoint) {
    return null;
  }

  return secondsBetween(firstTimedPoint, lastTimedPoint);
}

/**
 * @param {number} medianGapSeconds
 */
function getTimeGapThresholdSeconds(medianGapSeconds) {
  return medianGapSeconds <= 10
    ? Math.max(5 * medianGapSeconds, 30)
    : Math.max(3 * medianGapSeconds, 120);
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 */
export function isRouteDistancePair(points, index) {
  return isSameSegment(points[index - 1], points[index]);
}

/**
 * @param {number} index
 * @param {ReturnType<typeof createContinuityModel>} continuity
 */
export function isRouteJitterPair(index, continuity) {
  return continuity.routeXyJitterSegmentIndexes.has(index);
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 */
export function getContinuousPairDistanceMeters(points, index) {
  return haversineMeters(points[index - 1], points[index]);
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 * @param {ReturnType<typeof createContinuityModel>} continuity
 */
export function getMovingPairDistanceMeters(points, index, continuity) {
  return continuity.xyJitterSegmentIndexes.has(index)
    ? 0
    : getContinuousPairDistanceMeters(points, index);
}
