import { haversineMeters } from "../core/geo.js";
import { createI18n } from "../i18n/index.js";

/** @typedef {import("../core/route-types.js").RouteGeometryPoint} RoutePoint */
/** @typedef {"start" | "finish"} EndpointKind */

/**
 * @param {RoutePoint[]} points
 */
export function createTrackGeoJson(points) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: points.map(createRouteCoordinate)
        }
      }
    ]
  };
}

/**
 * @param {RoutePoint[]} points
 * @param {ReturnType<typeof createI18n>} [i18n]
 */
export function createEndpointGeoJson(points, i18n = createI18n("en")) {
  const first = points[0];
  const last = points.at(-1);
  const features = [];

  if (first) {
    features.push(createEndpointFeature(first, "start", i18n.t("map.start")));
  }

  if (last && last !== first) {
    features.push(createEndpointFeature(last, "finish", i18n.t("map.finish")));
  }

  return { type: "FeatureCollection", features };
}

/**
 * @param {RoutePoint} point
 * @returns {[number, number, number]}
 */
export function createRouteCoordinate(point) {
  return [point.longitude, point.latitude, point.elevation ?? 0];
}

/**
 * @param {RoutePoint} point
 * @param {EndpointKind} kind
 * @param {string} label
 */
function createEndpointFeature(point, kind, label) {
  return {
    type: "Feature",
    properties: { kind, label },
    geometry: {
      type: "Point",
      coordinates: [point.longitude, point.latitude]
    }
  };
}

/**
 * @param {RoutePoint[]} points
 */
export function createRoutePointProgress(points) {
  const { distances, totalDistanceMeters } = createRouteDistanceProfile(points);

  if (totalDistanceMeters <= 0) {
    return points.map((_point, index) => index / Math.max(1, points.length - 1));
  }

  return distances.map((distance) => distance / totalDistanceMeters);
}

/**
 * @param {RoutePoint[]} points
 */
export function getRouteTotalDistanceMeters(points) {
  return createRouteDistanceProfile(points).totalDistanceMeters;
}

/**
 * @param {RoutePoint[]} points
 */
function createRouteDistanceProfile(points) {
  const distances = [0];
  let totalDistanceMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    totalDistanceMeters += haversineMeters(points[index - 1], points[index]);
    distances.push(totalDistanceMeters);
  }

  return { distances, totalDistanceMeters };
}

/**
 * @param {unknown} point
 * @returns {point is RoutePoint}
 */
export function isRoutePoint(point) {
  if (!point || typeof point !== "object") {
    return false;
  }

  const record = /** @type {Record<string, unknown>} */ (point);
  return Number.isFinite(record.latitude) && Number.isFinite(record.longitude);
}
