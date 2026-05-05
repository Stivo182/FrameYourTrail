export { haversineMeters } from "./haversine.js";

/**
 * @param {{ latitude: number, longitude: number }[]} points
 * @returns {{ minLatitude: number, maxLatitude: number, minLongitude: number, maxLongitude: number }}
 */
export function getBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minLatitude: Math.min(bounds.minLatitude, point.latitude),
      maxLatitude: Math.max(bounds.maxLatitude, point.latitude),
      minLongitude: Math.min(bounds.minLongitude, point.longitude),
      maxLongitude: Math.max(bounds.maxLongitude, point.longitude)
    }),
    {
      minLatitude: Number.POSITIVE_INFINITY,
      maxLatitude: Number.NEGATIVE_INFINITY,
      minLongitude: Number.POSITIVE_INFINITY,
      maxLongitude: Number.NEGATIVE_INFINITY
    }
  );
}
