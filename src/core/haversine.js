const WGS84_EQUATORIAL_RADIUS_METERS = 6378137;
const WGS84_FLATTENING = 1 / 298.257223563;
const WGS84_ECCENTRICITY_SQUARED = 2 * WGS84_FLATTENING - WGS84_FLATTENING ** 2;

/**
 * @param {{ latitude: number, longitude: number }} a
 * @param {{ latitude: number, longitude: number }} b
 * @returns {number}
 */
export function haversineMeters(a, b) {
  if (a.latitude === b.latitude && a.longitude === b.longitude) {
    return 0;
  }

  const meanLatitude = toRadians((a.latitude + b.latitude) / 2);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const sinLatitude = Math.sin(meanLatitude);
  const curvatureBase = Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLatitude ** 2);
  const meridianRadius =
    (WGS84_EQUATORIAL_RADIUS_METERS * (1 - WGS84_ECCENTRICITY_SQUARED)) / curvatureBase ** 3;
  const primeVerticalRadius = WGS84_EQUATORIAL_RADIUS_METERS / curvatureBase;
  const northMeters = meridianRadius * deltaLat;
  const eastMeters = primeVerticalRadius * Math.cos(meanLatitude) * deltaLon;

  return Math.hypot(northMeters, eastMeters);
}

/**
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}
