import { haversineMeters } from "./haversine.js";
import { getSegmentIndex } from "./track-continuity.js";
import { secondsBetween } from "./track-time.js";

// GNSS quality thresholds. Hard thresholds reject the point; soft thresholds
// keep it but add confidence warnings so diagnostics explain the compromise.
const MAX_PDOP = 6;
const MAX_HDOP = 5;
const HARD_MAX_HDOP = 8;
const MAX_VDOP = 8;
const MIN_SATELLITES = 4;
const HARD_MIN_SATELLITES = 3;

// Near-zero coordinates are usually parser/device null-island placeholders, not
// real route fixes.
const ZERO_COORDINATE_EPSILON_DEGREES = 0.000001;
const NULL_ISLAND_CONTEXT_DISTANCE_METERS = 100000;

// Heading-flip jitter catches very short out-and-back spikes before the speed
// ceiling sees them as valid route movement.
const HEADING_FLIP_MAX_DURATION_SECONDS = 5;
const HEADING_FLIP_MIN_LEG_METERS = 5;
const HEADING_FLIP_MAX_LEG_METERS = 10;
const HEADING_FLIP_RETURN_DISTANCE_METERS = 5;
const HEADING_FLIP_MIN_TURN_DEGREES = 120;

export const TRACK_CLEANING_THRESHOLDS = Object.freeze({
  minSatellites: MIN_SATELLITES,
  hardMinSatellites: HARD_MIN_SATELLITES,
  maxPdop: MAX_PDOP,
  maxHdop: MAX_HDOP,
  hardMaxHdop: HARD_MAX_HDOP,
  maxVdop: MAX_VDOP,
  nullIslandContextDistanceMeters: NULL_ISLAND_CONTEXT_DISTANCE_METERS,
  headingFlipMaxDurationSeconds: HEADING_FLIP_MAX_DURATION_SECONDS,
  headingFlipMinLegMeters: HEADING_FLIP_MIN_LEG_METERS,
  headingFlipMaxLegMeters: HEADING_FLIP_MAX_LEG_METERS,
  headingFlipReturnDistanceMeters: HEADING_FLIP_RETURN_DISTANCE_METERS,
  headingFlipMinTurnDegrees: HEADING_FLIP_MIN_TURN_DEGREES
});

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @param {TrackPoint} point
 */
export function hasValidCoordinates(point) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

/**
 * @param {TrackPoint} point
 */
function isZeroCoordinate(point) {
  return (
    Math.abs(point.latitude) <= ZERO_COORDINATE_EPSILON_DEGREES &&
    Math.abs(point.longitude) <= ZERO_COORDINATE_EPSILON_DEGREES
  );
}

/**
 * @param {TrackPoint} previous
 * @param {TrackPoint} point
 * @param {TrackPoint} next
 */
export function isIsolatedZeroCoordinateFix(previous, point, next) {
  if (!isZeroCoordinate(point) || !hasValidCoordinates(next)) {
    return false;
  }

  if (getSegmentIndex(previous) !== getSegmentIndex(point)) {
    return false;
  }

  if (getSegmentIndex(point) !== getSegmentIndex(next)) {
    return false;
  }

  return (
    haversineMeters(point, previous) > NULL_ISLAND_CONTEXT_DISTANCE_METERS &&
    haversineMeters(point, next) > NULL_ISLAND_CONTEXT_DISTANCE_METERS
  );
}

/**
 * @param {TrackPoint} point
 */
export function assessFixQuality(point) {
  const fix = typeof point.fix === "string" ? point.fix.toLowerCase() : "";
  const warningReasons = [];

  if (fix === "none" || fix === "unknown") {
    return { rejected: true, warningReasons };
  }

  if (Number.isFinite(point.satellites)) {
    const satellites = Number(point.satellites);

    if (satellites < HARD_MIN_SATELLITES) {
      return { rejected: true, warningReasons };
    }

    if (satellites < MIN_SATELLITES) {
      warningReasons.push("low_satellites");
    }
  }

  if (Number.isFinite(point.pdop) && Number(point.pdop) > MAX_PDOP) {
    return { rejected: true, warningReasons };
  }

  if (Number.isFinite(point.hdop)) {
    const hdop = Number(point.hdop);

    if (hdop > HARD_MAX_HDOP) {
      return { rejected: true, warningReasons };
    }

    if (hdop > MAX_HDOP) {
      warningReasons.push("high_hdop");
    }
  }

  if (Number.isFinite(point.vdop) && Number(point.vdop) > MAX_VDOP) {
    return { rejected: true, warningReasons };
  }

  return { rejected: false, warningReasons };
}

/**
 * @param {TrackPoint} left
 * @param {TrackPoint} right
 */
export function isDuplicatePoint(left, right) {
  const sameCoordinates = left.latitude === right.latitude && left.longitude === right.longitude;
  const sameTimestamp = getTimeValue(left) === getTimeValue(right);

  return sameCoordinates && sameTimestamp;
}

/**
 * @param {TrackPoint} left
 * @param {TrackPoint} right
 */
export function isNonMonotonicTime(left, right) {
  if (getSegmentIndex(left) !== getSegmentIndex(right)) {
    return false;
  }

  const leftValue = getTimeValue(left);
  const rightValue = getTimeValue(right);

  return leftValue !== null && rightValue !== null && rightValue <= leftValue;
}

/**
 * @param {TrackPoint} previous
 * @param {TrackPoint} point
 * @param {TrackPoint} next
 */
export function isShortHeadingFlipJitter(previous, point, next) {
  if (!hasValidCoordinates(next) || getSegmentIndex(previous) !== getSegmentIndex(point)) {
    return false;
  }

  if (getSegmentIndex(point) !== getSegmentIndex(next)) {
    return false;
  }

  const firstSeconds = secondsBetween(previous, point);
  const secondSeconds = secondsBetween(point, next);

  if (
    firstSeconds === null ||
    secondSeconds === null ||
    firstSeconds <= 0 ||
    secondSeconds <= 0 ||
    firstSeconds > HEADING_FLIP_MAX_DURATION_SECONDS ||
    secondSeconds > HEADING_FLIP_MAX_DURATION_SECONDS
  ) {
    return false;
  }

  const firstDistanceMeters = haversineMeters(previous, point);
  const secondDistanceMeters = haversineMeters(point, next);
  const returnDistanceMeters = haversineMeters(previous, next);

  if (
    firstDistanceMeters < HEADING_FLIP_MIN_LEG_METERS ||
    secondDistanceMeters < HEADING_FLIP_MIN_LEG_METERS ||
    firstDistanceMeters > HEADING_FLIP_MAX_LEG_METERS ||
    secondDistanceMeters > HEADING_FLIP_MAX_LEG_METERS ||
    returnDistanceMeters > HEADING_FLIP_RETURN_DISTANCE_METERS
  ) {
    return false;
  }

  return getTurnDegrees(previous, point, next) >= HEADING_FLIP_MIN_TURN_DEGREES;
}

/**
 * @param {TrackPoint} previous
 * @param {TrackPoint} point
 * @param {TrackPoint} next
 */
export function getTurnDegrees(previous, point, next) {
  return getBearingDeltaDegrees(getBearingDegrees(previous, point), getBearingDegrees(point, next));
}

/**
 * @param {TrackPoint} start
 * @param {TrackPoint} end
 */
function getBearingDegrees(start, end) {
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const deltaLongitude = toRadians(end.longitude - start.longitude);
  const y = Math.sin(deltaLongitude) * Math.cos(endLatitude);
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(deltaLongitude);

  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

/**
 * @param {number} left
 * @param {number} right
 */
function getBearingDeltaDegrees(left, right) {
  const delta = Math.abs(left - right) % 360;
  return delta > 180 ? 360 - delta : delta;
}

/**
 * @param {number} degrees
 */
function normalizeDegrees(degrees) {
  return (degrees + 360) % 360;
}

/**
 * @param {number} degrees
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * @param {TrackPoint} left
 * @param {TrackPoint} right
 * @param {number} speedCeilingMps
 */
export function isImpossibleJump(left, right, speedCeilingMps) {
  if (getSegmentIndex(left) !== getSegmentIndex(right)) {
    return false;
  }

  const seconds = secondsBetween(left, right);

  if (seconds === null || seconds <= 0) {
    return false;
  }

  return haversineMeters(left, right) / seconds > speedCeilingMps;
}

/**
 * @param {TrackPoint} point
 */
function getTimeValue(point) {
  return point.timestamp instanceof Date && !Number.isNaN(point.timestamp.valueOf())
    ? point.timestamp.valueOf()
    : null;
}
