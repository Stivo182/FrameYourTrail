import { speedMpsToKmh } from "./speed-calibration.js";
import {
  DEFAULT_MOVING_OFF_SPEED_KMH,
  DEFAULT_MOVING_ON_SPEED_KMH
} from "./track-calibration-constants.js";
import { getTimerEventAction, getTimerEventTypeByCode } from "./timer-event-types.js";
import {
  hasSustainedSlowProgress,
  SLOW_PROGRESS_DIAGNOSTIC_THRESHOLDS,
  usesWalkingMovingThresholds
} from "./track-slow-progress.js";
import { isValidDate } from "./track-time.js";

// State changes must persist for a few seconds so single noisy samples do not
// flip moving/stopped status.
const MOVING_ON_DURATION_SECONDS = 5;
const MOVING_OFF_DURATION_SECONDS = 10;

// Per-profile moving thresholds follow the same activity profile used by point
// cleaning; explicit slow mode stays more sensitive than inferred slow mode.
export const MOVING_SPEED_THRESHOLDS_BY_PROFILE = Object.freeze({
  slow: Object.freeze({ onSpeedKmh: 1.2, offSpeedKmh: 0.5 }),
  slowInferred: Object.freeze({
    onSpeedKmh: DEFAULT_MOVING_ON_SPEED_KMH,
    offSpeedKmh: DEFAULT_MOVING_OFF_SPEED_KMH
  }),
  moderate: Object.freeze({
    onSpeedKmh: DEFAULT_MOVING_ON_SPEED_KMH,
    offSpeedKmh: DEFAULT_MOVING_OFF_SPEED_KMH
  }),
  fast: Object.freeze({ onSpeedKmh: 3, offSpeedKmh: 1.5 }),
  unrestricted: Object.freeze({ onSpeedKmh: 3, offSpeedKmh: 1.5 }),
  unknown: Object.freeze({
    onSpeedKmh: DEFAULT_MOVING_ON_SPEED_KMH,
    offSpeedKmh: DEFAULT_MOVING_OFF_SPEED_KMH
  })
});

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @typedef {import("./track-series.js").SpeedSample} SpeedSample
 */

/**
 * @param {TrackPoint[]} points
 * @param {SpeedSample[]} speedSeries
 * @param {{ speedProfile: string, onSpeedKmh: number, offSpeedKmh: number }} thresholds
 * @param {{ timerEvents?: unknown[], continuity: ReturnType<import("./track-continuity.js").createContinuityModel> }} options
 */
export function getMovingDurationResult(points, speedSeries, thresholds, options) {
  const timerResult = getTimerEventMovingDurationResult(
    points,
    speedSeries,
    options.timerEvents,
    options.continuity
  );

  if (timerResult !== null) {
    return timerResult;
  }

  return {
    source: "hysteresis",
    ...getMovingStats(points, speedSeries, thresholds, options.continuity),
    thresholds
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {SpeedSample[]} speedSeries
 * @param {unknown[] | undefined} timerEvents
 * @param {ReturnType<import("./track-continuity.js").createContinuityModel>} continuity
 */
function getTimerEventMovingDurationResult(points, speedSeries, timerEvents, continuity) {
  const intervalResult = getTimerRunningIntervals(points, timerEvents);

  if (intervalResult === null) {
    return null;
  }

  const intervals = clipIntervalsToContinuousRanges(
    intervalResult.intervals,
    getContinuousTimeRanges(points, continuity.continuousSegments)
  );

  return {
    source: "timer_events",
    durationSeconds: intervals.reduce(
      (total, interval) => total + (interval.endMs - interval.startMs) / 1000,
      0
    ),
    distanceMeters: getSpeedSeriesDistanceInIntervals(points, speedSeries, intervals),
    timerEvents: {
      eventCount: intervalResult.eventCount,
      recognizedEventCount: intervalResult.recognizedEventCount,
      intervalCount: intervals.length
    }
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {SpeedSample[]} speedSeries
 * @param {{ startMs: number, endMs: number }[]} intervals
 */
function getSpeedSeriesDistanceInIntervals(points, speedSeries, intervals) {
  let distanceMeters = 0;

  for (const sample of speedSeries) {
    const startTimestamp = points[sample.index - 1]?.timestamp;
    const endTimestamp = points[sample.index]?.timestamp;

    if (!isValidDate(startTimestamp) || !isValidDate(endTimestamp)) {
      continue;
    }

    const startMs = startTimestamp.valueOf();
    const endMs = endTimestamp.valueOf();

    if (endMs <= startMs) {
      continue;
    }

    for (const interval of intervals) {
      const overlapMs = Math.min(endMs, interval.endMs) - Math.max(startMs, interval.startMs);

      if (overlapMs > 0) {
        distanceMeters += sample.distanceMeters * (overlapMs / (endMs - startMs));
      }
    }
  }

  return distanceMeters;
}

/**
 * @param {TrackPoint[]} points
 * @param {{ startIndex: number, endIndex: number }[]} continuousSegments
 */
function getContinuousTimeRanges(points, continuousSegments) {
  const ranges = [];

  for (const segment of continuousSegments) {
    let startMs = null;
    let endMs = null;

    for (let index = segment.startIndex; index <= segment.endIndex; index += 1) {
      const timestamp = points[index]?.timestamp;

      if (!isValidDate(timestamp)) {
        continue;
      }

      startMs ??= timestamp.valueOf();
      endMs = timestamp.valueOf();
    }

    if (startMs !== null && endMs !== null && endMs > startMs) {
      ranges.push({ startMs, endMs });
    }
  }

  return ranges;
}

/**
 * @param {{ startMs: number, endMs: number }[]} intervals
 * @param {{ startMs: number, endMs: number }[]} ranges
 */
function clipIntervalsToContinuousRanges(intervals, ranges) {
  const clippedIntervals = [];

  for (const interval of intervals) {
    for (const range of ranges) {
      addPositiveInterval(
        clippedIntervals,
        Math.max(interval.startMs, range.startMs),
        Math.min(interval.endMs, range.endMs)
      );
    }
  }

  return clippedIntervals;
}

/**
 * @param {TrackPoint[]} points
 * @param {unknown[] | undefined} timerEvents
 */
function getTimerRunningIntervals(points, timerEvents) {
  if (!Array.isArray(timerEvents) || timerEvents.length === 0) {
    return null;
  }

  const bounds = getTrackTimeBounds(points);

  if (bounds === null) {
    return null;
  }

  const normalizedEvents = timerEvents
    .map(normalizeTimerEvent)
    .filter((event) => event !== null)
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (normalizedEvents.length === 0) {
    return null;
  }

  const intervals = [];
  let state = "unknown";
  let runningStartMs = null;

  for (const event of normalizedEvents) {
    const timestampMs = clamp(event.timestampMs, bounds.startMs, bounds.endMs);

    if (event.action === "start") {
      if (state !== "running") {
        runningStartMs = timestampMs;
        state = "running";
      }
      continue;
    }

    if (state === "unknown") {
      addPositiveInterval(intervals, bounds.startMs, timestampMs);
    } else if (state === "running" && runningStartMs !== null) {
      addPositiveInterval(intervals, runningStartMs, timestampMs);
    }

    state = "stopped";
    runningStartMs = null;
  }

  if (state === "running" && runningStartMs !== null) {
    addPositiveInterval(intervals, runningStartMs, bounds.endMs);
  }

  return {
    intervals,
    eventCount: timerEvents.length,
    recognizedEventCount: normalizedEvents.length
  };
}

/**
 * @param {unknown} value
 */
function normalizeTimerEvent(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = /** @type {Record<string, unknown>} */ (value);
  const timestampMs = toTimestampMs(record.timestamp);
  const rawEventType = record.eventType ?? record.event_type ?? record.type;
  const eventTypeCode = typeof rawEventType === "number" ? rawEventType : null;
  const eventType =
    getTimerEventTypeByCode(eventTypeCode) ?? String(rawEventType ?? "").toLowerCase();
  const action = getTimerEventAction(eventType);

  if (!Number.isFinite(timestampMs) || action === null) {
    return null;
  }

  return { timestampMs, action };
}

/**
 * @param {TrackPoint[]} points
 */
function getTrackTimeBounds(points) {
  const timestamps = points.map((point) => point.timestamp).filter(isValidDate);

  const startTimestamp = timestamps[0];
  const endTimestamp = timestamps.at(-1);

  if (!startTimestamp || !endTimestamp) {
    return null;
  }

  return {
    startMs: startTimestamp.valueOf(),
    endMs: endTimestamp.valueOf()
  };
}

/**
 * @param {{ startMs: number, endMs: number }[]} intervals
 * @param {number} startMs
 * @param {number} endMs
 */
function addPositiveInterval(intervals, startMs, endMs) {
  if (endMs > startMs) {
    intervals.push({ startMs, endMs });
  }
}

/**
 * @param {unknown} value
 */
function toTimestampMs(value) {
  if (isValidDate(value)) {
    return value.valueOf();
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return new Date(value).valueOf();
  }

  return Number.NaN;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {TrackPoint[]} points
 * @param {SpeedSample[]} speedSeries
 * @param {{ speedProfile: string, onSpeedKmh: number, offSpeedKmh: number }} thresholds
 * @param {ReturnType<import("./track-continuity.js").createContinuityModel>} continuity
 * @returns {{ durationSeconds: number | null, distanceMeters: number | null }}
 */
function getMovingStats(points, speedSeries, thresholds, continuity) {
  const slowProgressIndexes = getSlowProgressMovingSampleIndexes(
    points,
    speedSeries,
    thresholds,
    continuity
  );
  let moving = false;
  let movingSeconds = 0;
  let movingDistanceMeters = 0;
  let pendingMoveSeconds = 0;
  let pendingMoveDistanceMeters = 0;
  let pendingStopSeconds = 0;
  let pendingStopDistanceMeters = 0;

  for (const sample of speedSeries) {
    const hasSlowProgress = slowProgressIndexes.has(sample.index);

    if (moving) {
      if (sample.rawSpeedKmh <= thresholds.offSpeedKmh && !hasSlowProgress) {
        pendingStopSeconds += sample.durationSeconds;
        pendingStopDistanceMeters += sample.distanceMeters;

        if (pendingStopSeconds >= MOVING_OFF_DURATION_SECONDS) {
          moving = false;
          pendingStopSeconds = 0;
          pendingStopDistanceMeters = 0;
        }
      } else {
        movingSeconds += pendingStopSeconds + sample.durationSeconds;
        movingDistanceMeters += pendingStopDistanceMeters + sample.distanceMeters;
        pendingStopSeconds = 0;
        pendingStopDistanceMeters = 0;
      }
      continue;
    }

    if (sample.rawSpeedKmh >= thresholds.onSpeedKmh || hasSlowProgress) {
      pendingMoveSeconds += sample.durationSeconds;
      pendingMoveDistanceMeters += sample.distanceMeters;

      if (pendingMoveSeconds >= MOVING_ON_DURATION_SECONDS) {
        moving = true;
        movingSeconds += pendingMoveSeconds;
        movingDistanceMeters += pendingMoveDistanceMeters;
        pendingMoveSeconds = 0;
        pendingMoveDistanceMeters = 0;
      }
    } else {
      pendingMoveSeconds = 0;
      pendingMoveDistanceMeters = 0;
    }
  }

  return {
    durationSeconds: movingSeconds || null,
    distanceMeters: movingSeconds > 0 ? movingDistanceMeters : null
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {SpeedSample[]} speedSeries
 * @param {{ speedProfile: string, onSpeedKmh: number, offSpeedKmh: number }} thresholds
 * @param {ReturnType<import("./track-continuity.js").createContinuityModel>} continuity
 * @returns {Set<number>}
 */
function getSlowProgressMovingSampleIndexes(points, speedSeries, thresholds, continuity) {
  const indexes = new Set();

  if (!usesWalkingMovingThresholds(thresholds)) {
    return indexes;
  }

  for (const sample of speedSeries) {
    if (sample.rawSpeedKmh >= thresholds.onSpeedKmh) {
      continue;
    }

    if (hasSustainedSlowProgress(points, sample.index, thresholds, continuity)) {
      indexes.add(sample.index);
    }
  }

  return indexes;
}

/**
 * @param {unknown} value
 */
export function getMovingThresholds(value) {
  const record =
    value && typeof value === "object" ? /** @type {Record<string, unknown>} */ (value) : null;
  const speedProfile = record?.speedProfile ?? value;
  const speedProfileSource = record?.speedProfileSource;
  const profile = typeof speedProfile === "string" ? speedProfile : "unknown";
  const thresholdProfile =
    profile === "slow" && speedProfileSource === "inferred" ? "slowInferred" : profile;
  const normalizedProfile = hasOwnProfile(MOVING_SPEED_THRESHOLDS_BY_PROFILE, profile)
    ? profile
    : "unknown";
  const normalizedThresholdProfile = hasOwnProfile(
    MOVING_SPEED_THRESHOLDS_BY_PROFILE,
    thresholdProfile
  )
    ? thresholdProfile
    : "unknown";
  const thresholds = MOVING_SPEED_THRESHOLDS_BY_PROFILE[normalizedThresholdProfile];

  return {
    speedProfile: normalizedProfile,
    onSpeedKmh: thresholds.onSpeedKmh,
    offSpeedKmh: thresholds.offSpeedKmh
  };
}

/**
 * @param {object} profiles
 * @param {string} profile
 */
function hasOwnProfile(profiles, profile) {
  return Object.prototype.hasOwnProperty.call(profiles, profile);
}

/**
 * @param {ReturnType<typeof getMovingDurationResult>} movingResult
 */
export function createMovingDiagnostics(movingResult) {
  if ("timerEvents" in movingResult) {
    return {
      source: "timer_events",
      filtersApplied: ["moving_time_timer_events"],
      confidenceFlags: ["moving_time_timer_events"],
      timerEvents: movingResult.timerEvents
    };
  }

  const thresholds =
    "thresholds" in movingResult
      ? movingResult.thresholds
      : {
          speedProfile: "unknown",
          onSpeedKmh: DEFAULT_MOVING_ON_SPEED_KMH,
          offSpeedKmh: DEFAULT_MOVING_OFF_SPEED_KMH
        };

  return {
    source: "hysteresis",
    filtersApplied: ["moving_time_hysteresis"],
    confidenceFlags: movingResult.durationSeconds === null ? [] : ["moving_time_heuristic"],
    thresholds: {
      speedProfile: thresholds.speedProfile,
      onSpeedKmh: thresholds.onSpeedKmh,
      offSpeedKmh: thresholds.offSpeedKmh,
      onDurationSeconds: MOVING_ON_DURATION_SECONDS,
      offDurationSeconds: MOVING_OFF_DURATION_SECONDS,
      ...SLOW_PROGRESS_DIAGNOSTIC_THRESHOLDS
    }
  };
}

/**
 * @param {number | null} distanceMeters
 * @param {number | null} movingSeconds
 * @returns {number | null}
 */
function getMovingAverageSpeed(distanceMeters, movingSeconds) {
  if (!movingSeconds || !Number.isFinite(distanceMeters) || Number(distanceMeters) <= 0) {
    return null;
  }

  return speedMpsToKmh(Number(distanceMeters) / movingSeconds);
}

/**
 * @param {number | null} fallbackDistanceMeters
 * @param {ReturnType<typeof getMovingDurationResult>} movingResult
 * @param {{ speedOutlierCount: number }} speedDiagnostics
 * @returns {number | null}
 */
export function getMovingAverageSpeedForAnalysis(
  fallbackDistanceMeters,
  movingResult,
  speedDiagnostics
) {
  const reliableMovingDistanceMeters =
    "distanceMeters" in movingResult && Number.isFinite(movingResult.distanceMeters)
      ? Number(movingResult.distanceMeters)
      : null;

  if (
    reliableMovingDistanceMeters !== null &&
    (movingResult.source === "timer_events" || speedDiagnostics.speedOutlierCount > 0)
  ) {
    return getMovingAverageSpeed(reliableMovingDistanceMeters, movingResult.durationSeconds);
  }

  return getMovingAverageSpeed(fallbackDistanceMeters, movingResult.durationSeconds);
}
