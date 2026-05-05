import { median as getMedian } from "./statistics.js";
import { hasExplicitTimeZone } from "./track-source-primitives.js";

export { getMedian };

// Sampling buckets are diagnostic only; they do not change route geometry.
const DENSE_RECORDING_MAX_SECONDS = 2;
export const REGULAR_RECORDING_MAX_SECONDS = 15;
const SMART_RECORDING_MAX_SECONDS = 60;

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @param {unknown} value
 * @returns {value is Date}
 */
export function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}

/**
 * @param {{ timestamp: Date | null }} start
 * @param {{ timestamp: Date | null } | undefined} end
 * @returns {number | null}
 */
export function secondsBetween(start, end) {
  if (!isValidDate(start.timestamp) || !isValidDate(end?.timestamp)) {
    return null;
  }

  return Math.max(0, (end.timestamp.valueOf() - start.timestamp.valueOf()) / 1000);
}

/**
 * @param {TrackPoint[]} points
 */
export function collectPositiveTimeGaps(points) {
  const gaps = [];

  for (let index = 1; index < points.length; index += 1) {
    if (!isSameSegment(points[index - 1], points[index])) {
      continue;
    }

    const durationSeconds = secondsBetween(points[index - 1], points[index]);

    if (durationSeconds !== null && durationSeconds > 0) {
      gaps.push(durationSeconds);
    }
  }

  return gaps;
}

/**
 * @param {TrackPoint[]} points
 * @returns {number | null}
 */
export function getTotalDurationSeconds(points) {
  let totalSeconds = 0;
  let hasDuration = false;
  let currentSegmentIndex = null;
  let startPoint = null;
  let endPoint = null;

  const flushSegment = () => {
    const segmentSeconds =
      startPoint !== null && endPoint !== null && startPoint !== endPoint
        ? secondsBetween(startPoint, endPoint)
        : null;

    if (Number.isFinite(segmentSeconds)) {
      totalSeconds += Number(segmentSeconds);
      hasDuration = true;
    }
  };

  for (const point of points) {
    const segmentIndex = getSegmentIndex(point);

    if (currentSegmentIndex !== null && segmentIndex !== currentSegmentIndex) {
      flushSegment();
      startPoint = null;
      endPoint = null;
    }

    currentSegmentIndex = segmentIndex;

    if (isValidDate(point.timestamp)) {
      startPoint ??= point;
      endPoint = point;
    }
  }

  flushSegment();

  return hasDuration ? totalSeconds : null;
}

/**
 * @param {TrackPoint[]} points
 */
export function createTemporalDiagnostics(points) {
  let timeZoneExplicitPointCount = 0;
  let timeZoneMissingPointCount = 0;
  let timeZoneInvalidPointCount = 0;
  let timeZoneUnknownPointCount = 0;

  for (const point of points) {
    const status = getTimeZoneStatus(point);

    if (status === "explicit") {
      timeZoneExplicitPointCount += 1;
    } else if (status === "missing") {
      timeZoneMissingPointCount += 1;
    } else if (status === "invalid") {
      timeZoneInvalidPointCount += 1;
    } else if (isValidDate(point.timestamp)) {
      timeZoneUnknownPointCount += 1;
    }
  }

  const confidenceFlags = timeZoneMissingPointCount > 0 ? ["tz_inferred"] : [];

  return {
    timeZoneConfidence: getTimeZoneConfidence(
      timeZoneExplicitPointCount,
      timeZoneMissingPointCount,
      timeZoneInvalidPointCount,
      timeZoneUnknownPointCount
    ),
    timeZoneExplicitPointCount,
    timeZoneMissingPointCount,
    timeZoneInvalidPointCount,
    timeZoneUnknownPointCount,
    confidenceFlags
  };
}

/**
 * @param {TrackPoint[]} points
 */
export function createSamplingDiagnostics(points) {
  const gaps = collectPositiveTimeGaps(points);
  const nominalIntervalSeconds = getMedian(gaps);
  const recordingMode = getRecordingMode(nominalIntervalSeconds);
  const confidenceFlags = [];
  let maxIntervalSeconds = null;

  if (recordingMode === "smart") {
    confidenceFlags.push("sampling_smart_recording");
  }

  if (recordingMode === "sparse") {
    confidenceFlags.push("sampling_sparse");
  }

  for (const gap of gaps) {
    if (maxIntervalSeconds === null || gap > maxIntervalSeconds) {
      maxIntervalSeconds = gap;
    }
  }

  return {
    recordingMode,
    timedPointCount: points.filter((point) => isValidDate(point.timestamp)).length,
    intervalCount: gaps.length,
    nominalIntervalSeconds,
    maxIntervalSeconds,
    confidenceFlags,
    thresholds: {
      denseMaxSeconds: DENSE_RECORDING_MAX_SECONDS,
      regularMaxSeconds: REGULAR_RECORDING_MAX_SECONDS,
      smartMaxSeconds: SMART_RECORDING_MAX_SECONDS
    }
  };
}

/**
 * @param {TrackPoint} left
 * @param {TrackPoint} right
 */
function isSameSegment(left, right) {
  return getSegmentIndex(left) === getSegmentIndex(right);
}

/**
 * @param {TrackPoint} point
 */
function getSegmentIndex(point) {
  return Number.isFinite(point.segmentIndex) ? Number(point.segmentIndex) : 0;
}

/**
 * @param {TrackPoint} point
 * @returns {"explicit" | "missing" | "invalid" | "none"}
 */
function getTimeZoneStatus(point) {
  if (
    point.timeZoneStatus === "explicit" ||
    point.timeZoneStatus === "missing" ||
    point.timeZoneStatus === "invalid" ||
    point.timeZoneStatus === "none"
  ) {
    return point.timeZoneStatus;
  }

  if (typeof point.timeText === "string") {
    return hasExplicitTimeZone(point.timeText) ? "explicit" : "missing";
  }

  return "none";
}

/**
 * @param {number} explicitCount
 * @param {number} missingCount
 * @param {number} invalidCount
 * @param {number} unknownCount
 */
function getTimeZoneConfidence(explicitCount, missingCount, invalidCount, unknownCount) {
  if (missingCount > 0 || invalidCount > 0) {
    return "low";
  }

  if (unknownCount > 0) {
    return "unknown";
  }

  return explicitCount > 0 ? "high" : "none";
}

/**
 * @param {number | null} nominalIntervalSeconds
 */
function getRecordingMode(nominalIntervalSeconds) {
  if (nominalIntervalSeconds === null) {
    return "untimed";
  }

  if (nominalIntervalSeconds <= DENSE_RECORDING_MAX_SECONDS) {
    return "dense";
  }

  if (nominalIntervalSeconds <= REGULAR_RECORDING_MAX_SECONDS) {
    return "regular";
  }

  if (nominalIntervalSeconds <= SMART_RECORDING_MAX_SECONDS) {
    return "smart";
  }

  return "sparse";
}
