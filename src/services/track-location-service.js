const BIGDATACLOUD_REVERSE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const REGION_RESPONSE_FIELDS = ["principalSubdivision", "city", "locality"];
const coordinateLocationCache = new Map();

/**
 * @typedef {import("../core/route-types.js").TrackPoint} TrackPoint
 * @typedef {{ latitude: number, longitude: number }} TrackCoordinate
 * @typedef {{ region: string | null, country: string | null, label: string }} TrackLocation
 * @typedef {{ ok: boolean, json: () => Promise<unknown> }} ReverseGeocodeResponse
 * @typedef {(url: string, options: { headers: Record<string, string> }) => Promise<ReverseGeocodeResponse>} ReverseGeocodeFetcher
 */

/**
 * @param {TrackPoint[] | undefined} points
 * @returns {TrackCoordinate | null}
 */
export function findRepresentativeTrackPoint(points) {
  if (!Array.isArray(points)) {
    return null;
  }

  const validPoints = points
    .filter((point) => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude))
    .map((point) => ({ latitude: point.latitude, longitude: point.longitude }));

  return validPoints.length > 0 ? validPoints[Math.floor(validPoints.length / 2)] : null;
}

/**
 * @param {TrackCoordinate} point
 * @param {string} language
 * @returns {string}
 */
export function createTrackLocationCacheKey(point, language) {
  return `${language}:${roundCoordinate(point.latitude)}:${roundCoordinate(point.longitude)}`;
}

/**
 * @param {unknown} payload
 * @returns {TrackLocation | null}
 */
export function formatBigDataCloudTrackLocation(payload) {
  if (!isRecord(payload)) {
    return null;
  }

  const region =
    REGION_RESPONSE_FIELDS.map((field) => readRecordString(payload, field)).find(Boolean) ?? null;
  const country = readRecordString(payload, "countryName");

  if (!region || !country) {
    return null;
  }

  return { region, country, label: `${region}, ${country}` };
}

/**
 * @param {{ points?: TrackPoint[] } | null | undefined} parsed
 * @param {{ language?: string, fetcher?: ReverseGeocodeFetcher }} [options]
 * @returns {Promise<TrackLocation | null>}
 */
export async function reverseGeocodeTrackLocation(parsed, options = {}) {
  const point = findRepresentativeTrackPoint(parsed?.points);
  const language = options.language ?? "en";
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!point || typeof fetcher !== "function") {
    return null;
  }

  const cacheKey = createTrackLocationCacheKey(point, language);

  if (coordinateLocationCache.has(cacheKey)) {
    return coordinateLocationCache.get(cacheKey);
  }

  const location = await fetchTrackLocation(point, language, fetcher);
  coordinateLocationCache.set(cacheKey, location);
  return location;
}

/**
 * @param {TrackCoordinate} point
 * @param {string} language
 * @param {ReverseGeocodeFetcher} fetcher
 * @returns {Promise<TrackLocation | null>}
 */
async function fetchTrackLocation(point, language, fetcher) {
  try {
    const response = await fetcher(createBigDataCloudReverseUrl(point, language), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response?.ok) {
      return null;
    }

    return formatBigDataCloudTrackLocation(await response.json());
  } catch {
    return null;
  }
}

/**
 * @param {TrackCoordinate} point
 * @param {string} language
 * @returns {string}
 */
function createBigDataCloudReverseUrl(point, language) {
  const url = new URL(BIGDATACLOUD_REVERSE_URL);
  url.searchParams.set("latitude", String(point.latitude));
  url.searchParams.set("longitude", String(point.longitude));
  url.searchParams.set("localityLanguage", language);
  return url.toString();
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} field
 * @returns {string | null}
 */
function readRecordString(record, field) {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * @param {number} coordinate
 * @returns {string}
 */
function roundCoordinate(coordinate) {
  const rounded = Math.round(coordinate * 10000) / 10000;
  return Object.is(rounded, -0) ? "0.0000" : rounded.toFixed(4);
}
