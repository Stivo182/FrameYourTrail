const OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
const ELEVATION_BATCH_SIZE = 100;
const ELEVATION_LOOKUP_ATTEMPTS = 3;
/** @type {"terrain"} */
const TERRAIN_ELEVATION_SOURCE = "terrain";

/**
 * @typedef {import("../core/route-types.js").RouteSource} RouteSource
 * @typedef {import("../core/route-types.js").TrackPoint} TrackPoint
 * @typedef {{ ok: boolean, status?: number, json: () => Promise<{ elevation?: unknown[] }> }} ElevationResponse
 * @typedef {(url: string) => Promise<ElevationResponse>} ElevationFetcher
 * @typedef {"fallback" | "replacement"} TerrainElevationMode
 * @typedef {{ mode?: "replace" }} TerrainElevationOptions
 */

/**
 * @param {RouteSource} parsed
 * @param {ElevationFetcher} [fetcher]
 * @param {TerrainElevationOptions} [options]
 * @returns {Promise<RouteSource>}
 */
export async function enrichElevationFromTerrain(parsed, fetcher = globalThis.fetch, options = {}) {
  const mode = options.mode === "replace" ? "replacement" : "fallback";

  if (shouldSkipTerrainLookup(parsed, fetcher, mode)) {
    return parsed;
  }

  try {
    const terrainElevations = await fetchTerrainElevations(
      parsed.rawPoints ?? parsed.points,
      fetcher
    );

    return applyTerrainElevations(parsed, terrainElevations, { mode });
  } catch {
    return parsed;
  }
}

/**
 * @param {RouteSource} parsed
 * @param {unknown[]} terrainElevations
 * @param {{ mode?: TerrainElevationMode }} [options]
 * @returns {RouteSource}
 */
export function applyTerrainElevations(parsed, terrainElevations, options = {}) {
  if (!Array.isArray(terrainElevations) || terrainElevations.length !== parsed.points.length) {
    return parsed;
  }

  const points = parsed.points.map((point, index) => ({
    ...point,
    elevation: parseElevation(terrainElevations[index]),
    elevationSource: TERRAIN_ELEVATION_SOURCE
  }));
  const hasElevation = points.every((point) => Number.isFinite(point.elevation));

  return hasElevation
    ? {
        ...parsed,
        rawPoints: parsed.rawPoints ?? parsed.points,
        points,
        hasElevation: true,
        elevationSource: TERRAIN_ELEVATION_SOURCE,
        provenance: {
          ...parsed.provenance,
          terrainElevation: {
            mode: options.mode ?? "fallback",
            status: "applied",
            pointCount: points.length
          }
        }
      }
    : parsed;
}

/**
 * @param {RouteSource} parsed
 * @param {ElevationFetcher | undefined} fetcher
 * @param {TerrainElevationMode} mode
 * @returns {boolean}
 */
function shouldSkipTerrainLookup(parsed, fetcher, mode) {
  if (typeof fetcher !== "function") {
    return true;
  }

  return (
    mode === "fallback" && (parsed.hasElevation || hasExplicitBarometricElevationSource(parsed))
  );
}

/**
 * @param {RouteSource} parsed
 * @returns {boolean}
 */
function hasExplicitBarometricElevationSource(parsed) {
  return (
    parsed.elevationSource === "barometric" ||
    parsed.points.some((point) => point.elevationSource === "barometric")
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {ElevationFetcher} fetcher
 * @returns {Promise<(number | null)[]>}
 */
async function fetchTerrainElevations(points, fetcher) {
  const elevations = [];

  for (let index = 0; index < points.length; index += ELEVATION_BATCH_SIZE) {
    const batch = points.slice(index, index + ELEVATION_BATCH_SIZE);
    const payload = await fetchTerrainPayload(createElevationUrl(batch), fetcher);
    const batchElevations = Array.isArray(payload.elevation) ? payload.elevation : [];

    elevations.push(...batchElevations.map(parseElevation));
  }

  return elevations;
}

/**
 * @param {string} url
 * @param {ElevationFetcher} fetcher
 * @returns {Promise<{ elevation?: unknown[] }>}
 */
async function fetchTerrainPayload(url, fetcher) {
  let lastError = new Error("Terrain elevation request failed");

  for (let attempt = 0; attempt < ELEVATION_LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(url);

      if (response.ok) {
        return response.json();
      }

      lastError = new Error("Terrain elevation request failed");

      if (response.status === 429) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;
    }
  }

  throw lastError;
}

/**
 * @param {TrackPoint[]} points
 * @returns {string}
 */
function createElevationUrl(points) {
  const url = new URL(OPEN_METEO_ELEVATION_URL);
  url.searchParams.set("latitude", points.map((point) => point.latitude).join(","));
  url.searchParams.set("longitude", points.map((point) => point.longitude).join(","));
  return url.toString();
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function parseElevation(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
