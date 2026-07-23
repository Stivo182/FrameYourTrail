import { createRouteCoordinate, isRoutePoint } from "./route-map-data.js";
import { createRouteSpeedColorScale, getRouteSpeedColor } from "./route-speed-style.js";

/** @typedef {import("../core/route-types.js").RouteGeometryPoint} RoutePoint */
/** @typedef {import("../core/route-types.js").RouteSpeedSample} RouteSpeedSample */

export const ROUTE_COLOR_PROPERTY = "routeColor";

/**
 * @param {RoutePoint[]} points
 * @param {RouteSpeedSample[]} speedSeries
 */
export function createSpeedSegmentGeoJson(points, speedSeries) {
  const routeSegments = createRouteSpeedSegments(points, speedSeries);

  return {
    type: "FeatureCollection",
    features: routeSegments.map((segment) => ({
      type: "Feature",
      properties: { [ROUTE_COLOR_PROPERTY]: segment.color },
      geometry: {
        type: "LineString",
        coordinates: [
          createRouteCoordinate(segment.previous),
          createRouteCoordinate(segment.current)
        ]
      }
    }))
  };
}

/**
 * @param {RoutePoint[]} points
 * @param {RouteSpeedSample[]} speedSeries
 * @returns {{ previous: RoutePoint, current: RoutePoint, color: string }[]}
 */
export function createRouteSpeedSegments(points, speedSeries) {
  const colorScale = createRouteSpeedColorScale(speedSeries);

  if (!colorScale) {
    return [];
  }

  const { samples, lowSpeedKmh, highSpeedKmh } = colorScale;
  const samplesByIndex = new Map(samples.map((sample) => [sample.index, sample]));
  const segments = [];
  let previousSample = null;
  let nextSampleIndex = 0;

  for (let index = 1; index < points.length; index += 1) {
    while (nextSampleIndex < samples.length && samples[nextSampleIndex].index < index) {
      previousSample = samples[nextSampleIndex];
      nextSampleIndex += 1;
    }

    const exactSample = samplesByIndex.get(index);
    const sample = exactSample ?? previousSample ?? samples[nextSampleIndex];
    const previous = points[index - 1];
    const current = points[index];

    if (!sample || !isRoutePoint(previous) || !isRoutePoint(current)) {
      continue;
    }

    segments.push({
      previous,
      current,
      color: getRouteSpeedColor(sample.speedKmh, lowSpeedKmh, highSpeedKmh)
    });

    if (exactSample) {
      previousSample = exactSample;
      while (nextSampleIndex < samples.length && samples[nextSampleIndex].index <= index) {
        nextSampleIndex += 1;
      }
    }
  }

  return segments;
}
