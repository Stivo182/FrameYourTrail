import FitParser from "fit-file-parser";

import { createActivityProvenance } from "./activity-provenance.js";
import { GpxParseError } from "./gpx-parser.js";
import {
  isValidLatitude,
  isValidLongitude,
  normalizeSemicircleCoordinate
} from "./track-source-primitives.js";
import {
  getTimerEventTypeByCode,
  isTimerStartEventType,
  isTimerStopEventType
} from "./timer-event-types.js";
/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @param {ArrayBuffer} source
 * @param {string} fileName
 */
export async function parseFit(source, fileName) {
  if (!(source instanceof ArrayBuffer)) {
    throw new GpxParseError("FIT source must be binary", "parse_error");
  }

  const parser = new FitParser({
    force: false,
    mode: "list",
    lengthUnit: "m",
    speedUnit: "m/s",
    elapsedRecordField: true
  });
  let decoded;

  try {
    decoded = /** @type {Record<string, unknown>} */ (
      /** @type {unknown} */ (await parser.parseAsync(source))
    );
  } catch {
    throw new GpxParseError("FIT cannot be parsed", "parse_error");
  }

  return normalizeFitActivity(decoded, fileName);
}

/**
 * @param {Record<string, unknown>} decoded
 * @param {string} fileName
 */
export function normalizeFitActivity(decoded, fileName) {
  const records = getList(decoded.records);

  if (records.length === 0) {
    throw new GpxParseError("FIT does not contain points", "empty_track");
  }

  const sessions = getList(decoded.sessions);
  const laps = getList(decoded.laps);
  const events = getList(decoded.events);
  const timerEvents = events.filter(isTimerEvent);
  const activity = extractActivity(sessions);
  const normalizedPoints = records.map((record, index) => normalizeRecord(record, index));
  const segmentDiagnostics = getFitSegmentDiagnostics(normalizedPoints, laps, timerEvents);
  const points = assignFitSegments(normalizedPoints, segmentDiagnostics.breaks);

  return {
    fileName,
    name: getFileDisplayName(fileName),
    points,
    hasElevation: points.some((point) => Number.isFinite(point.elevation)),
    hasTime: points.some((point) => point.timestamp instanceof Date),
    elevationSource: points.some((point) => point.elevationSource === "barometric")
      ? "barometric"
      : "none",
    activity,
    importedSummary: extractImportedSummary(sessions),
    provenance: {
      format: "fit",
      pointCount: points.length,
      segmentCount: getPointSegmentCount(points),
      segmentSource: getSegmentSource(segmentDiagnostics),
      lapBoundaryCount: segmentDiagnostics.lapBoundaryCount,
      timerBreakCount: segmentDiagnostics.timerBreakCount,
      sessionCount: sessions.length,
      lapCount: laps.length,
      eventCount: events.length,
      profileVersion: decoded.profile_version ?? decoded.profileVersion,
      protocolVersion: decoded.protocol_version ?? decoded.protocolVersion,
      timerEvents: {
        count: timerEvents.length,
        events: timerEvents.map((event) => ({
          timestamp: toIsoString(getValue(event, "timestamp")),
          eventType: getValue(event, "event_type")
        }))
      }
    }
  };
}

/**
 * @param {Record<string, unknown>[]} sessions
 */
function extractActivity(sessions) {
  const session = sessions[0];

  if (!session) {
    return null;
  }

  const sport = getValue(session, "sport");

  if (typeof sport === "string" && sport.trim()) {
    return createActivityProvenance(sport, "fit_session_sport");
  }

  const subSport = getValue(session, "sub_sport");

  if (typeof subSport === "string" && subSport.trim()) {
    return createActivityProvenance(subSport, "fit_session_sub_sport");
  }

  return null;
}

/**
 * @param {TrackPoint[]} points
 * @param {{ pointIndex: number }[]} breaks
 * @returns {TrackPoint[]}
 */
function assignFitSegments(points, breaks) {
  if (breaks.length === 0) {
    return points;
  }

  let segmentIndex = 0;
  let breakIndex = 0;

  return points.map((point, index) => {
    while (breakIndex < breaks.length && index >= breaks[breakIndex].pointIndex) {
      segmentIndex += 1;
      breakIndex += 1;
    }

    return { ...point, segmentIndex };
  });
}

/**
 * @param {TrackPoint[]} points
 * @param {Record<string, unknown>[]} laps
 * @param {Record<string, unknown>[]} timerEvents
 */
function getFitSegmentDiagnostics(points, laps, timerEvents) {
  const lapBreakTimes = collectLapBreakTimes(laps);
  const timerBreakTimes = collectTimerBreakTimes(timerEvents);
  const breaks = collectEffectiveBreaks(points, [
    ...lapBreakTimes.map((timestampMs) => createBreakTime(timestampMs, "lap")),
    ...timerBreakTimes.map((timestampMs) => createBreakTime(timestampMs, "timer"))
  ]);

  return {
    breaks,
    lapBoundaryCount: breaks.filter((boundary) => boundary.sources.has("lap")).length,
    timerBreakCount: breaks.filter((boundary) => boundary.sources.has("timer")).length
  };
}

/**
 * @param {number} timestampMs
 * @param {"lap" | "timer"} source
 */
function createBreakTime(timestampMs, source) {
  return { timestampMs, source };
}

/**
 * @param {TrackPoint[]} points
 * @param {{ timestampMs: number, source: "lap" | "timer" }[]} breakTimes
 */
function collectEffectiveBreaks(points, breakTimes) {
  const breaksByTime = new Map();

  for (const breakTime of breakTimes) {
    const sources = breaksByTime.get(breakTime.timestampMs) ?? new Set();
    sources.add(breakTime.source);
    breaksByTime.set(breakTime.timestampMs, sources);
  }

  const breaksByPointIndex = new Map();

  for (const [timestampMs, sources] of [...breaksByTime.entries()].sort(compareTimeEntries)) {
    const pointIndex = findBreakPointIndex(points, timestampMs);

    if (pointIndex === null) {
      continue;
    }

    const existingSources = breaksByPointIndex.get(pointIndex);
    if (existingSources) {
      for (const source of sources) {
        existingSources.add(source);
      }
    } else {
      breaksByPointIndex.set(pointIndex, new Set(sources));
    }
  }

  return [...breaksByPointIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([pointIndex, sources]) => ({ pointIndex, sources }));
}

/**
 * @param {TrackPoint[]} points
 * @param {number} breakTime
 */
function findBreakPointIndex(points, breakTime) {
  let previousTimedPointIndex = null;
  let previousTime = null;

  for (let index = 0; index < points.length; index += 1) {
    const timestampMs = toTimestampMs(points[index].timestamp);

    if (timestampMs === null) {
      continue;
    }

    if (timestampMs >= breakTime) {
      if (previousTime === null || previousTime >= breakTime) {
        return null;
      }

      const pointIndex =
        previousTimedPointIndex !== null && previousTimedPointIndex < index - 1
          ? previousTimedPointIndex + 1
          : index;
      return pointIndex > 0 && pointIndex < points.length ? pointIndex : null;
    }

    previousTime = timestampMs;
    previousTimedPointIndex = index;
  }

  return null;
}

/**
 * @param {Record<string, unknown>[]} laps
 */
function collectLapBreakTimes(laps) {
  const startTimes = sortUniqueTimes(
    laps.map((lap) => toTimestampMs(parseTimestamp(getValue(lap, "start_time"))))
  );

  return startTimes.slice(1);
}

/**
 * @param {Record<string, unknown>[]} timerEvents
 */
function collectTimerBreakTimes(timerEvents) {
  let stopped = false;
  const breakTimes = [];
  const timedEvents = timerEvents
    .map((event) => ({
      timestampMs: toTimestampMs(parseTimestamp(getValue(event, "timestamp"))),
      eventType: normalizeEventType(getValue(event, "event_type"))
    }))
    .filter((event) => event.timestampMs !== null)
    .sort((left, right) => compareNullableTimes(left.timestampMs, right.timestampMs));

  for (const event of timedEvents) {
    if (isTimerStopEventType(event.eventType)) {
      stopped = true;
    } else if (stopped && isTimerStartEventType(event.eventType)) {
      breakTimes.push(/** @type {number} */ (event.timestampMs));
      stopped = false;
    }
  }

  return sortUniqueTimes(breakTimes);
}

/**
 * @param {unknown} value
 */
function normalizeEventType(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return getTimerEventTypeByCode(value) ?? "";
  }

  return typeof value === "string" ? value.toLowerCase() : "";
}

/**
 * @param {Record<string, unknown>} event
 */
function isTimerEvent(event) {
  const eventValue = getValue(event, "event");
  return eventValue === 0 || normalizeEventName(eventValue) === "timer";
}

/**
 * @param {unknown} value
 */
function normalizeEventName(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/**
 * @param {TrackPoint[]} points
 */
function getPointSegmentCount(points) {
  return new Set(points.map((point) => point.segmentIndex)).size || 1;
}

/**
 * @param {{ lapBoundaryCount: number, timerBreakCount: number }} diagnostics
 */
function getSegmentSource(diagnostics) {
  if (diagnostics.timerBreakCount > 0) {
    return "fit_timer_events";
  }

  if (diagnostics.lapBoundaryCount > 0) {
    return "fit_laps";
  }

  return "fit_records";
}

/**
 * @param {Record<string, unknown>} record
 * @param {number} index
 * @returns {TrackPoint}
 */
function normalizeRecord(record, index) {
  const latitude = normalizeSemicircleCoordinate(getNumber(record, "position_lat"), "latitude");
  const longitude = normalizeSemicircleCoordinate(getNumber(record, "position_long"), "longitude");

  if (latitude === null || longitude === null) {
    throw new GpxParseError(
      `Point ${index + 1} does not contain coordinates`,
      "missing_coordinates"
    );
  }

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    throw new GpxParseError(
      `Point ${index + 1} contains coordinates outside geographic bounds`,
      "coordinates_out_of_bounds"
    );
  }

  const elevation = getNumber(record, "enhanced_altitude") ?? getNumber(record, "altitude");
  const timestamp = parseTimestamp(getValue(record, "timestamp"));

  return {
    latitude,
    longitude,
    elevation,
    elevationSource: elevation === null ? "none" : "barometric",
    timestamp,
    timeText: timestamp ? timestamp.toISOString() : null,
    timeZoneStatus: timestamp ? "explicit" : "none",
    segmentIndex: 0
  };
}

/**
 * @param {Record<string, unknown>[]} sessions
 */
function extractImportedSummary(sessions) {
  const session = sessions[0];

  if (!session) {
    return null;
  }

  const hasAny = [
    "total_distance",
    "total_elapsed_time",
    "total_timer_time",
    "avg_speed",
    "max_speed",
    "total_ascent",
    "total_descent"
  ].some((field) => getNumber(session, field) !== null);

  if (!hasAny) {
    return null;
  }

  return {
    mode: "imported_summary",
    totalDistanceMeters: getNumber(session, "total_distance"),
    totalDurationSeconds: getNumber(session, "total_elapsed_time"),
    movingDurationSeconds: getNumber(session, "total_timer_time"),
    movingAverageSpeedKmh: multiplyNullable(getNumber(session, "avg_speed"), 3.6),
    maxSpeedKmh: multiplyNullable(getNumber(session, "max_speed"), 3.6),
    elevationGainMeters: getNumber(session, "total_ascent"),
    elevationLossMeters: getNumber(session, "total_descent"),
    sourceTag: "fit_session"
  };
}

/**
 * @param {unknown} value
 */
function parseTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

/**
 * @param {string} fileName
 */
function getFileDisplayName(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>[]}
 */
function getList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object").map((item) => item)
    : [];
}

/**
 * @param {unknown} object
 * @param {string} key
 */
function getValue(object, key) {
  return object && typeof object === "object"
    ? /** @type {Record<string, unknown>} */ (object)[key]
    : undefined;
}

/**
 * @param {Record<string, unknown>} object
 * @param {string} key
 */
function getNumber(object, key) {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * @param {unknown} value
 */
function toIsoString(value) {
  return parseTimestamp(value)?.toISOString() ?? null;
}

/**
 * @param {Date | null | undefined} timestamp
 */
function toTimestampMs(timestamp) {
  if (!(timestamp instanceof Date)) {
    return null;
  }

  const timestampMs = timestamp.valueOf();
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

/**
 * @param {(number | null)[]} times
 */
function sortUniqueTimes(times) {
  const validTimes = times.filter((time) => time !== null);
  return [...new Set(validTimes)].sort((left, right) => left - right);
}

/**
 * @param {number | null} left
 * @param {number | null} right
 */
function compareNullableTimes(left, right) {
  return /** @type {number} */ (left) - /** @type {number} */ (right);
}

/**
 * @param {[number, Set<"lap" | "timer">]} left
 * @param {[number, Set<"lap" | "timer">]} right
 */
function compareTimeEntries(left, right) {
  return left[0] - right[0];
}

/**
 * @param {number | null} value
 * @param {number} multiplier
 */
function multiplyNullable(value, multiplier) {
  return value === null ? null : value * multiplier;
}
