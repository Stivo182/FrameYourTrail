const SEMICIRCLES_TO_DEGREES = 180 / 2 ** 31;

/**
 * @param {string | null} value
 * @returns {number | null}
 */
export function parseOptionalNumber(value) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {string | null} value
 * @returns {number | null}
 */
export function parseOptionalInteger(value) {
  const parsed = parseOptionalNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

/**
 * @param {string | null} value
 * @returns {{ timestamp: Date | null, timeZoneStatus: "explicit" | "missing" | "invalid" | "none" }}
 */
export function parseOptionalDateInfo(value) {
  if (value === null) {
    return { timestamp: null, timeZoneStatus: "none" };
  }

  const timeZoneStatus = hasExplicitTimeZone(value) ? "explicit" : "missing";
  const parsed = new Date(timeZoneStatus === "explicit" ? value : `${value}Z`);

  return Number.isNaN(parsed.valueOf())
    ? { timestamp: null, timeZoneStatus: "invalid" }
    : { timestamp: parsed, timeZoneStatus };
}

/**
 * @param {string} value
 */
export function hasExplicitTimeZone(value) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
}

/**
 * @param {unknown} value
 * @param {"latitude" | "longitude"} kind
 * @returns {number | null}
 */
export function normalizeSemicircleCoordinate(value, kind) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const isOutOfDegreeBounds = kind === "latitude" ? Math.abs(value) > 90 : Math.abs(value) > 180;
  return isOutOfDegreeBounds ? value * SEMICIRCLES_TO_DEGREES : value;
}

/**
 * @param {number} latitude
 * @returns {boolean}
 */
export function isValidLatitude(latitude) {
  return latitude >= -90 && latitude <= 90;
}

/**
 * @param {number} longitude
 * @returns {boolean}
 */
export function isValidLongitude(longitude) {
  return longitude >= -180 && longitude <= 180;
}
