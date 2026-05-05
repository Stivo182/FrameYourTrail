const EMPTY_VALUE = "—";

const DEFAULT_UNITS = {
  kilometer: "km",
  meter: "m",
  speed: "km/h"
};

/**
 * @param {{ t: (key: string) => string }} i18n
 * @returns {{ kilometer: string, meter: string, speed: string }}
 */
export function getFormatUnits(i18n) {
  return {
    kilometer: i18n.t("units.km"),
    meter: i18n.t("units.m"),
    speed: i18n.t("units.kmh")
  };
}

/**
 * @param {number | null} meters
 * @param {string} [language]
 * @param {{ kilometer: string, meter: string }} [units]
 */
export function formatDistanceMeters(meters, language = "en", units = DEFAULT_UNITS) {
  if (!Number.isFinite(meters)) {
    return EMPTY_VALUE;
  }

  return `${formatDecimal(Number(meters) / 1000, language)} ${units.kilometer}`;
}

/**
 * @param {number | null} seconds
 */
export function formatDurationSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return EMPTY_VALUE;
  }

  const totalSeconds = Math.round(Number(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const restSeconds = totalSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

/**
 * @param {number | null} meters
 * @param {string} [language]
 * @param {{ meter: string }} [units]
 */
export function formatElevationMeters(meters, language = "en", units = DEFAULT_UNITS) {
  if (!Number.isFinite(meters)) {
    return EMPTY_VALUE;
  }

  return `${formatDecimal(Number(meters), language)} ${units.meter}`;
}

/**
 * @param {number | null} kmh
 * @param {string} [language]
 * @param {{ speed: string }} [units]
 */
export function formatSpeedKmh(kmh, language = "en", units = DEFAULT_UNITS) {
  if (!Number.isFinite(kmh)) {
    return EMPTY_VALUE;
  }

  return `${formatDecimal(Number(kmh), language)} ${units.speed}`;
}

/**
 * @param {number | null} meters
 * @param {string} [language]
 * @param {{ kilometer: string, meter: string }} [units]
 */
export function formatDistance(meters, language = "en", units = DEFAULT_UNITS) {
  return formatDistanceMeters(meters, language, units);
}

/**
 * @param {number | null} seconds
 */
export function formatDuration(seconds) {
  return formatDurationSeconds(seconds);
}

/**
 * @param {number | null} meters
 * @param {string} [language]
 * @param {{ meter: string }} [units]
 */
export function formatElevation(meters, language = "en", units = DEFAULT_UNITS) {
  return formatElevationMeters(meters, language, units);
}

/**
 * @param {number | null} kmh
 * @param {string} [language]
 * @param {{ speed: string }} [units]
 */
export function formatSpeed(kmh, language = "en", units = DEFAULT_UNITS) {
  return formatSpeedKmh(kmh, language, units);
}

/**
 * @param {number} value
 * @param {string} language
 */
function formatDecimal(value, language) {
  return normalizeSpaces(
    new Intl.NumberFormat(language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value)
  );
}

/**
 * @param {string} value
 */
function normalizeSpaces(value) {
  return value.replace(/[\u00a0\u202f]/g, " ");
}
