/**
 * @typedef {import("./route-types.js").RouteActivityProvenance} RouteActivityProvenance
 * @typedef {"bike" | "foot" | "water" | "motor"} RouteActivityType
 * @typedef {"fit_session_sport" | "fit_session_sub_sport" | "tcx_activity_sport" | "gpx_track_type" | "gpx_route_type"} RouteActivitySource
 */

/** @type {Map<string, RouteActivityType>} */
const ACTIVITY_TYPE_ALIASES = new Map([
  ["cycling", "bike"],
  ["biking", "bike"],
  ["bike", "bike"],
  ["road_cycling", "bike"],
  ["mountain_biking", "bike"],
  ["running", "foot"],
  ["walking", "foot"],
  ["hiking", "foot"],
  ["walk", "foot"],
  ["run", "foot"],
  ["kayaking", "water"],
  ["canoeing", "water"],
  ["rowing", "water"],
  ["swimming", "water"],
  ["driving", "motor"],
  ["motorcycling", "motor"],
  ["automobile", "motor"]
]);

/**
 * @param {string} raw
 * @param {RouteActivitySource} source
 * @returns {RouteActivityProvenance | null}
 */
export function createActivityProvenance(raw, source) {
  const normalizedType = normalizeActivityType(raw);

  return normalizedType === null ? null : { type: normalizedType, source, raw };
}

/**
 * @param {unknown} value
 * @returns {RouteActivityType | null}
 */
export function normalizeActivityType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ACTIVITY_TYPE_ALIASES.get(key) ?? null;
}
