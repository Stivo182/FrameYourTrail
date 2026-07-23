import { haversineMeters } from "../../../src/core/geo.js";
import { deepFreeze } from "./fixture-utils.js";

export const points = deepFreeze([
  { latitude: 43.1, longitude: 42.1, elevation: 620 },
  { latitude: 43.2, longitude: 42.2, elevation: 740 }
]);

export const speedSeries = deepFreeze([
  {
    index: 1,
    startDistanceFromStartMeters: 0,
    distanceFromStartMeters: 100,
    distanceMeters: 100,
    durationSeconds: 72,
    rawSpeedKmh: 5,
    speedKmh: 5
  },
  {
    index: 2,
    startDistanceFromStartMeters: 100,
    distanceFromStartMeters: 200,
    distanceMeters: 100,
    durationSeconds: 36,
    rawSpeedKmh: 10,
    speedKmh: 10
  },
  {
    index: 3,
    startDistanceFromStartMeters: 200,
    distanceFromStartMeters: 300,
    distanceMeters: 100,
    durationSeconds: 24,
    rawSpeedKmh: 15,
    speedKmh: 15
  }
]);

export const segmentedPoints = deepFreeze([
  { latitude: 43.1, longitude: 42.1, elevation: 620 },
  { latitude: 43.101, longitude: 42.102, elevation: 640 },
  { latitude: 43.103, longitude: 42.105, elevation: 700 },
  { latitude: 43.105, longitude: 42.108, elevation: 690 }
]);

export function getRouteSegmentDistances(routePoints) {
  const distances = [];

  for (let index = 1; index < routePoints.length; index += 1) {
    distances.push(haversineMeters(routePoints[index - 1], routePoints[index]));
  }

  return distances;
}

export function getRouteDistance(routePoints) {
  return getRouteSegmentDistances(routePoints).reduce((total, distance) => total + distance, 0);
}

export function createSpeedSeriesForDistances(distances, speedsKmh) {
  let distanceFromStartMeters = 0;

  return distances.map((distanceMeters, index) => {
    const startDistanceFromStartMeters = distanceFromStartMeters;
    distanceFromStartMeters += distanceMeters;
    const speedKmh = speedsKmh[index] ?? speedsKmh.at(-1) ?? 0;

    return {
      index: index + 1,
      startDistanceFromStartMeters,
      distanceFromStartMeters,
      distanceMeters,
      durationSeconds: (distanceMeters / Math.max(speedKmh, 0.1)) * 3.6,
      rawSpeedKmh: speedKmh,
      speedKmh
    };
  });
}
