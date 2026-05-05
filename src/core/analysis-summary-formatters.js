/**
 * @param {unknown} value
 */
export function formatRoundedMeters(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} m` : "n/a";
}

/**
 * @param {unknown} value
 */
export function formatRoundedSeconds(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} s` : "n/a";
}

/**
 * @param {unknown} value
 */
export function formatRoundedCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "0";
}

/**
 * @param {number | null} minElevationMeters
 * @param {number | null} maxElevationMeters
 * @returns {number | null}
 */
export function getElevationRangeMeters(minElevationMeters, maxElevationMeters) {
  if (!Number.isFinite(minElevationMeters) || !Number.isFinite(maxElevationMeters)) {
    return null;
  }

  return Math.max(0, Number(maxElevationMeters) - Number(minElevationMeters));
}
