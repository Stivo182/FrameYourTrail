import { getBounds } from "../core/geo.js";
import { createI18n } from "../i18n/index.js";
import { createRoutePointProgress, getRouteTotalDistanceMeters } from "./route-map-data.js";
import { ROUTE_LINE_COLOR, clamp, createRouteSpeedColorProfile } from "./route-speed-style.js";
import { createRouteSpeedSegments } from "./route-speed-segments.js";

/** @typedef {import("../core/route-types.js").RouteGeometryPoint} RoutePoint */
/** @typedef {import("../core/route-types.js").RouteSpeedSample} RouteSpeedSample */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const STATIC_FALLBACK_WIDTH = 720;
const STATIC_FALLBACK_HEIGHT = 430;
const STATIC_ENDPOINT_LABEL_OFFSET = 16;
const STATIC_ENDPOINT_LABEL_MIN_BASELINE = 32;

/**
 * @param {HTMLElement} host
 * @param {RoutePoint[]} points
 * @param {ReturnType<typeof createI18n>} [i18n]
 * @param {RouteSpeedSample[]} [speedSeries]
 */
export function renderStaticRouteFallback(host, points, i18n = createI18n("en"), speedSeries = []) {
  host.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "static-map-fallback";
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", `0 0 ${STATIC_FALLBACK_WIDTH} ${STATIC_FALLBACK_HEIGHT}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", i18n.t("map.fallbackAria"));

  const routePath = createStaticRoutePath(points, STATIC_FALLBACK_WIDTH, STATIC_FALLBACK_HEIGHT);
  const routeProfile = createRouteSpeedColorProfile(
    speedSeries,
    getRouteTotalDistanceMeters(points)
  );
  const routeSegments = routeProfile
    ? createStaticRouteSegments(points, STATIC_FALLBACK_WIDTH, STATIC_FALLBACK_HEIGHT, routeProfile)
    : createStaticSpeedSampleSegments(
        points,
        STATIC_FALLBACK_WIDTH,
        STATIC_FALLBACK_HEIGHT,
        speedSeries
      );
  const routeHalo = document.createElementNS(SVG_NAMESPACE, "path");
  routeHalo.setAttribute("data-static-route-halo", "");
  routeHalo.setAttribute("class", "static-route-halo");
  routeHalo.setAttribute(
    "d",
    routeSegments.length ? routeSegments.map((segment) => segment.path).join(" ") : routePath
  );
  svg.append(routeHalo);

  if (routeSegments.length > 0) {
    for (const segment of routeSegments) {
      const route = document.createElementNS(SVG_NAMESPACE, "path");
      route.setAttribute("data-static-route", "");
      route.setAttribute("data-static-route-segment", "");
      route.setAttribute("class", "static-route-line");
      route.setAttribute("d", segment.path);
      route.setAttribute("stroke", segment.color);
      route.style.stroke = segment.color;
      svg.append(route);
    }
  } else {
    const route = document.createElementNS(SVG_NAMESPACE, "path");
    route.setAttribute("data-static-route", "");
    route.setAttribute("class", "static-route-line");
    route.setAttribute("d", routePath);
    svg.append(route);
  }

  const endpoints = createStaticEndpointPoints(
    points,
    STATIC_FALLBACK_WIDTH,
    STATIC_FALLBACK_HEIGHT
  );
  for (const endpoint of endpoints) {
    const marker = document.createElementNS(SVG_NAMESPACE, "circle");
    marker.setAttribute(endpoint.kind === "start" ? "data-static-start" : "data-static-finish", "");
    marker.setAttribute("class", `static-route-endpoint static-route-endpoint--${endpoint.kind}`);
    marker.setAttribute("cx", endpoint.x.toFixed(1));
    marker.setAttribute("cy", endpoint.y.toFixed(1));
    marker.setAttribute("r", "12");
    svg.append(marker);

    const labelPlacement = createStaticEndpointLabelPlacement(
      endpoint,
      STATIC_FALLBACK_WIDTH,
      STATIC_FALLBACK_HEIGHT
    );
    const label = document.createElementNS(SVG_NAMESPACE, "text");
    label.setAttribute(
      endpoint.kind === "start" ? "data-static-start-label" : "data-static-finish-label",
      ""
    );
    label.setAttribute(
      "class",
      `static-route-endpoint-label static-route-endpoint-label--${endpoint.kind}`
    );
    label.setAttribute("text-anchor", labelPlacement.textAnchor);
    label.setAttribute("x", labelPlacement.x.toFixed(1));
    label.setAttribute("y", labelPlacement.y.toFixed(1));
    label.textContent = i18n.t(endpoint.kind === "start" ? "map.start" : "map.finish");
    svg.append(label);
  }

  const caption = document.createElement("p");
  caption.textContent = i18n.t("map.fallbackCaption");
  wrapper.append(svg, caption);
  host.append(wrapper);
}

/**
 * @param {RoutePoint[]} points
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function createStaticRoutePath(points, width, height) {
  if (points.length === 0) {
    return "";
  }

  const { scaleX, scaleY } = createStaticScales(points, width, height);

  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${scaleX(point.longitude).toFixed(1)} ${scaleY(
          point.latitude
        ).toFixed(1)}`
    )
    .join(" ");
}

/**
 * @param {RoutePoint[]} points
 * @param {number} width
 * @param {number} height
 * @param {{ stops: { progress: number, color: string }[] }} routeProfile
 * @returns {{ path: string, color: string }[]}
 */
function createStaticRouteSegments(points, width, height, routeProfile) {
  if (points.length < 2) {
    return [];
  }

  const { scaleX, scaleY } = createStaticScales(points, width, height);
  const progressByPoint = createRoutePointProgress(points);
  const segments = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midpointProgress = (progressByPoint[index - 1] + progressByPoint[index]) / 2;
    segments.push({
      path: `M${scaleX(previous.longitude).toFixed(1)} ${scaleY(previous.latitude).toFixed(
        1
      )} L${scaleX(current.longitude).toFixed(1)} ${scaleY(current.latitude).toFixed(1)}`,
      color: getRouteColorAtProgress(routeProfile, midpointProgress)
    });
  }

  return segments;
}

/**
 * @param {RoutePoint[]} points
 * @param {number} width
 * @param {number} height
 * @param {RouteSpeedSample[]} speedSeries
 * @returns {{ path: string, color: string }[]}
 */
function createStaticSpeedSampleSegments(points, width, height, speedSeries) {
  if (points.length < 2) {
    return [];
  }

  const { scaleX, scaleY } = createStaticScales(points, width, height);

  return createRouteSpeedSegments(points, speedSeries).map((segment) => ({
    path: `M${scaleX(segment.previous.longitude).toFixed(1)} ${scaleY(
      segment.previous.latitude
    ).toFixed(1)} L${scaleX(segment.current.longitude).toFixed(1)} ${scaleY(
      segment.current.latitude
    ).toFixed(1)}`,
    color: segment.color
  }));
}

/**
 * @param {RoutePoint[]} points
 * @param {number} width
 * @param {number} height
 */
function createStaticEndpointPoints(points, width, height) {
  if (points.length === 0) {
    return [];
  }

  const { scaleX, scaleY } = createStaticScales(points, width, height);
  const first = points[0];
  const last = points.at(-1) ?? first;

  return [
    { kind: "start", x: scaleX(first.longitude), y: scaleY(first.latitude) },
    { kind: "finish", x: scaleX(last.longitude), y: scaleY(last.latitude) }
  ];
}

/**
 * @param {{ x: number, y: number }} endpoint
 * @param {number} width
 * @param {number} height
 */
function createStaticEndpointLabelPlacement(endpoint, width, height) {
  const isRightSide = endpoint.x > width / 2;
  const x =
    endpoint.x + (isRightSide ? -STATIC_ENDPOINT_LABEL_OFFSET : STATIC_ENDPOINT_LABEL_OFFSET);
  const y =
    endpoint.y - STATIC_ENDPOINT_LABEL_OFFSET < STATIC_ENDPOINT_LABEL_MIN_BASELINE
      ? endpoint.y + STATIC_ENDPOINT_LABEL_OFFSET
      : endpoint.y - STATIC_ENDPOINT_LABEL_OFFSET;

  return {
    textAnchor: isRightSide ? "end" : "start",
    x: clamp(x, STATIC_ENDPOINT_LABEL_OFFSET, width - STATIC_ENDPOINT_LABEL_OFFSET),
    y: clamp(y, STATIC_ENDPOINT_LABEL_MIN_BASELINE, height - STATIC_ENDPOINT_LABEL_OFFSET)
  };
}

/**
 * @param {RoutePoint[]} points
 * @param {number} width
 * @param {number} height
 */
function createStaticScales(points, width, height) {
  const bounds = getBounds(points);
  const longitudeRange = Math.max(0.000001, bounds.maxLongitude - bounds.minLongitude);
  const latitudeRange = Math.max(0.000001, bounds.maxLatitude - bounds.minLatitude);
  const scaleX = (longitude) =>
    ((longitude - bounds.minLongitude) / longitudeRange) * (width - 80) + 40;
  const scaleY = (latitude) =>
    height - (((latitude - bounds.minLatitude) / latitudeRange) * (height - 80) + 40);

  return { scaleX, scaleY };
}

/**
 * @param {{ stops: { progress: number, color: string }[] }} routeProfile
 * @param {number} progress
 */
function getRouteColorAtProgress(routeProfile, progress) {
  for (const stop of routeProfile.stops) {
    if (stop.progress >= progress) {
      return stop.color;
    }
  }

  return routeProfile.stops.at(-1)?.color ?? ROUTE_LINE_COLOR;
}
