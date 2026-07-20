import { getBounds, haversineMeters } from "../core/geo.js";
import { createI18n } from "../i18n/index.js";
import { DEFAULT_MAP_STYLE_ID, loadMapStyle, normalizeMapStyleId } from "./map-styles.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export const ROUTE_LINE_COLOR = "#c95b2e";

const ROUTE_COLOR_PROPERTY = "routeColor";
const ROUTE_MAP_FIT_PADDING_PIXELS = 48;
const ROUTE_MAP_DETAIL_MIN_ZOOM = 13;
const SPEED_GRADIENT_COLORS = Object.freeze({
  slow: "#b94a3a",
  medium: "#d99a3a",
  fast: "#6f8f4d"
});
const SPEED_GRADIENT_MIN_SAMPLES = 2;
const SPEED_RANGE_LOWER_QUANTILE = 0.1;
const SPEED_RANGE_UPPER_QUANTILE = 0.9;
const SPEED_RANGE_EPSILON_KMH = 0.1;
const SPEED_COVERAGE_EPSILON_METERS = 1;
const MAP_IDLE_TIMEOUT_MS = 12000;
const STATIC_FALLBACK_WIDTH = 720;
const STATIC_FALLBACK_HEIGHT = 430;
const STATIC_ENDPOINT_LABEL_OFFSET = 16;
const STATIC_ENDPOINT_LABEL_MIN_BASELINE = 32;

/** @type {Promise<typeof import("maplibre-gl")> | undefined} */
let maplibreAssetsPromise;

async function loadMapLibreAssets() {
  maplibreAssetsPromise ??= Promise.all([
    // @ts-expect-error Vite handles CSS modules, but tsc has no project CSS declaration.
    import("maplibre-gl/dist/maplibre-gl.css"),
    import("maplibre-gl")
  ]).then(
    ([, module]) => /** @type {{ default: typeof import("maplibre-gl") }} */ (module).default
  );

  return maplibreAssetsPromise;
}

class RouteMapAbortError extends Error {
  constructor() {
    super("Route map render was cancelled");
    this.name = "RouteMapAbortError";
  }
}

/**
 * @param {AbortSignal | undefined} signal
 */
function throwIfRouteMapAborted(signal) {
  if (signal?.aborted) {
    throw new RouteMapAbortError();
  }
}

/**
 * @param {unknown} error
 */
function isRouteMapAbortError(error) {
  return error instanceof RouteMapAbortError;
}

function consumeRecoverableMapLibreError() {
  // MapLibre prints error events to console when no listener exists. Runtime
  // tile/style expression errors are recoverable and should not read as app failures.
}

/**
 * @typedef {import("../core/route-types.js").RouteGeometryPoint} RoutePoint
 */

/**
 * @typedef {object} RouteSpeedSample
 * @property {number} index
 * @property {number} startDistanceFromStartMeters
 * @property {number} distanceFromStartMeters
 * @property {number} distanceMeters
 * @property {number} durationSeconds
 * @property {number} rawSpeedKmh
 * @property {number} speedKmh
 */

/**
 * @typedef {"start" | "finish"} EndpointKind
 */

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
 * @param {RouteSpeedSample[]} [speedSeries]
 * @param {number} [routeDistanceMeters]
 */
export function createRouteSpeedGradient(speedSeries = [], routeDistanceMeters) {
  const profile = createRouteSpeedColorProfile(speedSeries, routeDistanceMeters);

  if (!profile) {
    return null;
  }

  return createLineProgressGradientExpression(profile);
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
 * @param {RouteSpeedSample[]} speedSeries
 * @param {number} [routeDistanceMeters]
 */
function createRouteSpeedColorProfile(speedSeries, routeDistanceMeters) {
  const samples = normalizeSpeedSamples(speedSeries);
  const colorScale = createRouteSpeedColorScaleForSamples(samples);

  if (samples.length < SPEED_GRADIENT_MIN_SAMPLES || !colorScale) {
    return null;
  }

  const { lowSpeedKmh, highSpeedKmh } = colorScale;
  const totalDistanceMeters = getSpeedProfileTotalDistanceMeters(samples, routeDistanceMeters);

  if (
    !Number.isFinite(totalDistanceMeters) ||
    totalDistanceMeters <= 0 ||
    !hasCompleteSpeedCoverage(samples, totalDistanceMeters)
  ) {
    return null;
  }

  const stops = [];
  addColorStop(stops, {
    progress: 0,
    color: getRouteSpeedColor(samples[0].speedKmh, lowSpeedKmh, highSpeedKmh)
  });

  for (const sample of samples) {
    addColorStop(stops, {
      progress: roundProgress(sample.distanceFromStartMeters / totalDistanceMeters),
      color: getRouteSpeedColor(sample.speedKmh, lowSpeedKmh, highSpeedKmh)
    });
  }

  if (stops.at(-1)?.progress !== 1) {
    addColorStop(stops, {
      progress: 1,
      color: stops.at(-1)?.color ?? SPEED_GRADIENT_COLORS.medium
    });
  }

  return { stops };
}

/**
 * @param {RoutePoint[]} points
 * @param {RouteSpeedSample[]} speedSeries
 */
function createIndexedRouteSpeedGradient(points, speedSeries) {
  const profile = createIndexedRouteSpeedColorProfile(points, speedSeries);

  if (!profile) {
    return null;
  }

  return createLineProgressGradientExpression(profile);
}

/**
 * @param {RoutePoint[]} points
 * @param {RouteSpeedSample[]} speedSeries
 */
function createIndexedRouteSpeedColorProfile(points, speedSeries) {
  if (points.length < 2) {
    return null;
  }

  const routeSamples = normalizeSpeedColorSamples(speedSeries).filter(
    (sample) => sample.index < points.length
  );
  const colorScale = createRouteSpeedColorScaleForSamples(routeSamples);

  if (!colorScale) {
    return null;
  }

  const { samples, lowSpeedKmh, highSpeedKmh } = colorScale;
  const progressByPoint = createRoutePointProgress(points);
  const stops = [];

  addColorStop(stops, {
    progress: 0,
    color: getRouteSpeedColor(samples[0].speedKmh, lowSpeedKmh, highSpeedKmh)
  });

  for (const sample of samples) {
    const progress = progressByPoint[sample.index];

    if (Number.isFinite(progress)) {
      addColorStop(stops, {
        progress,
        color: getRouteSpeedColor(sample.speedKmh, lowSpeedKmh, highSpeedKmh)
      });
    }
  }

  if (stops.at(-1)?.progress !== 1) {
    addColorStop(stops, {
      progress: 1,
      color: stops.at(-1)?.color ?? SPEED_GRADIENT_COLORS.medium
    });
  }

  return stops.length >= SPEED_GRADIENT_MIN_SAMPLES ? { stops } : null;
}

/**
 * @param {{ stops: { progress: number, color: string }[] }} profile
 * @returns {import("maplibre-gl").ExpressionSpecification}
 */
function createLineProgressGradientExpression(profile) {
  const expression = /** @type {unknown[]} */ (["interpolate", ["linear"], ["line-progress"]]);

  for (const stop of profile.stops) {
    expression.push(stop.progress, stop.color);
  }

  return /** @type {import("maplibre-gl").ExpressionSpecification} */ (expression);
}

/**
 * @param {RouteSpeedSample[]} speedSeries
 */
function createRouteSpeedColorScale(speedSeries) {
  const samples = normalizeSpeedColorSamples(speedSeries);

  return createRouteSpeedColorScaleForSamples(samples);
}

/**
 * @param {RouteSpeedSample[]} samples
 */
function createRouteSpeedColorScaleForSamples(samples) {
  if (samples.length < SPEED_GRADIENT_MIN_SAMPLES) {
    return null;
  }

  const speeds = samples.map((sample) => sample.speedKmh).sort((a, b) => a - b);
  const lowSpeedKmh = getQuantile(speeds, SPEED_RANGE_LOWER_QUANTILE);
  const highSpeedKmh = getQuantile(speeds, SPEED_RANGE_UPPER_QUANTILE);

  if (
    !Number.isFinite(lowSpeedKmh) ||
    !Number.isFinite(highSpeedKmh) ||
    highSpeedKmh - lowSpeedKmh < SPEED_RANGE_EPSILON_KMH
  ) {
    return null;
  }

  return { samples, lowSpeedKmh, highSpeedKmh };
}

/**
 * @param {RouteSpeedSample[]} speedSeries
 */
function normalizeSpeedColorSamples(speedSeries) {
  return speedSeries
    .filter(
      (sample) =>
        Number.isFinite(sample.speedKmh) && sample.speedKmh >= 0 && Number.isFinite(sample.index)
    )
    .map((sample) => ({
      ...sample,
      index: Math.trunc(Number(sample.index)),
      speedKmh: Number(sample.speedKmh)
    }))
    .filter((sample) => sample.index > 0)
    .sort((a, b) => a.index - b.index);
}

/**
 * @param {RouteSpeedSample[]} speedSeries
 */
function normalizeSpeedSamples(speedSeries) {
  return speedSeries
    .filter(
      (sample) =>
        Number.isFinite(sample.speedKmh) &&
        sample.speedKmh >= 0 &&
        Number.isFinite(sample.index) &&
        Number.isFinite(sample.startDistanceFromStartMeters) &&
        sample.startDistanceFromStartMeters >= 0 &&
        Number.isFinite(sample.distanceFromStartMeters) &&
        sample.distanceFromStartMeters > sample.startDistanceFromStartMeters &&
        Number.isFinite(sample.distanceMeters) &&
        sample.distanceMeters > 0
    )
    .map((sample) => ({
      ...sample,
      index: Math.trunc(Number(sample.index)),
      speedKmh: Number(sample.speedKmh),
      startDistanceFromStartMeters: Number(sample.startDistanceFromStartMeters),
      distanceFromStartMeters: Number(sample.distanceFromStartMeters)
    }))
    .filter((sample) => sample.index > 0)
    .sort((a, b) => a.distanceFromStartMeters - b.distanceFromStartMeters);
}

/**
 * @param {RouteSpeedSample[]} samples
 * @param {number} [routeDistanceMeters]
 */
function getSpeedProfileTotalDistanceMeters(samples, routeDistanceMeters) {
  const routeDistance = Number(routeDistanceMeters);

  if (Number.isFinite(routeDistance) && routeDistance > 0) {
    return routeDistance;
  }

  return samples.at(-1)?.distanceFromStartMeters ?? 0;
}

/**
 * @param {RouteSpeedSample[]} samples
 * @param {number} totalDistanceMeters
 */
function hasCompleteSpeedCoverage(samples, totalDistanceMeters) {
  const first = samples[0];
  const last = samples.at(-1);

  if (!first || !last) {
    return false;
  }

  if (Math.abs(first.startDistanceFromStartMeters) > SPEED_COVERAGE_EPSILON_METERS) {
    return false;
  }

  if (
    Math.abs(last.distanceFromStartMeters - totalDistanceMeters) > SPEED_COVERAGE_EPSILON_METERS
  ) {
    return false;
  }

  for (let index = 1; index < samples.length; index += 1) {
    if (
      Math.abs(
        samples[index].startDistanceFromStartMeters - samples[index - 1].distanceFromStartMeters
      ) > SPEED_COVERAGE_EPSILON_METERS
    ) {
      return false;
    }
  }

  return true;
}

/**
 * @param {{ progress: number, color: string }[]} stops
 * @param {{ progress: number, color: string }} stop
 */
function addColorStop(stops, stop) {
  const progress = clamp(roundProgress(stop.progress), 0, 1);
  const previous = stops.at(-1);

  if (previous && previous.progress === progress) {
    previous.color = stop.color;
    return;
  }

  stops.push({ progress, color: stop.color });
}

/**
 * @param {number[]} sortedValues
 * @param {number} quantile
 */
function getQuantile(sortedValues, quantile) {
  if (sortedValues.length === 0) {
    return Number.NaN;
  }

  const position = (sortedValues.length - 1) * quantile;
  const base = Math.floor(position);
  const fraction = position - base;
  const next = sortedValues[base + 1];

  if (!Number.isFinite(next)) {
    return sortedValues[base];
  }

  return sortedValues[base] + (next - sortedValues[base]) * fraction;
}

/**
 * @param {number} speedKmh
 * @param {number} lowSpeedKmh
 * @param {number} highSpeedKmh
 */
function getRouteSpeedColor(speedKmh, lowSpeedKmh, highSpeedKmh) {
  const normalized = clamp((speedKmh - lowSpeedKmh) / (highSpeedKmh - lowSpeedKmh), 0, 1);

  if (normalized <= 0.5) {
    return interpolateHexColor(
      SPEED_GRADIENT_COLORS.slow,
      SPEED_GRADIENT_COLORS.medium,
      normalized / 0.5
    );
  }

  return interpolateHexColor(
    SPEED_GRADIENT_COLORS.medium,
    SPEED_GRADIENT_COLORS.fast,
    (normalized - 0.5) / 0.5
  );
}

/**
 * @param {RoutePoint} point
 * @returns {[number, number, number]}
 */
function createRouteCoordinate(point) {
  return [point.longitude, point.latitude, point.elevation ?? 0];
}

/**
 * @param {RoutePoint[]} points
 * @param {RouteSpeedSample[]} speedSeries
 */
function createSpeedSegmentGeoJson(points, speedSeries) {
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
function createRouteSpeedSegments(points, speedSeries) {
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

/**
 * @param {unknown} point
 * @returns {point is RoutePoint}
 */
function isRoutePoint(point) {
  if (!point || typeof point !== "object") {
    return false;
  }

  const record = /** @type {Record<string, unknown>} */ (point);
  return Number.isFinite(record.latitude) && Number.isFinite(record.longitude);
}

/**
 * @param {string} from
 * @param {string} to
 * @param {number} ratio
 */
function interpolateHexColor(from, to, ratio) {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);

  return rgbToHex(
    fromRgb.map((channel, index) =>
      Math.round(channel + (toRgb[index] - channel) * clamp(ratio, 0, 1))
    )
  );
}

/**
 * @param {string} hex
 */
function hexToRgb(hex) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

/**
 * @param {number[]} rgb
 */
function rgbToHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {number} value
 */
function roundProgress(value) {
  return Math.round(clamp(value, 0, 1) * 1000000) / 1000000;
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
 * @param {HTMLElement} host
 * @param {RoutePoint[]} points
 * @param {ReturnType<typeof createI18n>} [i18n]
 * @param {RouteSpeedSample[]} [speedSeries]
 * @param {{ signal?: AbortSignal, preserveHostContent?: boolean, onMapInitialized?: (map: import("maplibre-gl").Map) => void, idleTimeoutMs?: number }} [options]
 * @param {string} [mapStyleId]
 */
export async function initRouteMap(
  host,
  points,
  i18n = createI18n("en"),
  speedSeries = [],
  options = {},
  mapStyleId = DEFAULT_MAP_STYLE_ID
) {
  const { preserveHostContent = false, signal, onMapInitialized, idleTimeoutMs } = options;

  if (signal?.aborted) {
    return { status: "cancelled" };
  }

  if (!preserveHostContent) {
    host.replaceChildren();
  }

  const mapNode = document.createElement("div");
  mapNode.className = "maplibre-host";

  if (preserveHostContent) {
    host.insertBefore(mapNode, host.firstChild);
  } else {
    host.append(mapNode);
  }

  /** @type {import("maplibre-gl").Map | undefined} */
  let map;

  try {
    const [maplibregl, openFreeMapStyle] = await Promise.all([
      loadMapLibreAssets(),
      loadMapStyle(mapStyleId)
    ]);
    throwIfRouteMapAborted(signal);
    const firstSymbolLayerId = openFreeMapStyle.layers.find((layer) => layer.type === "symbol")?.id;

    map = new maplibregl.Map({
      container: mapNode,
      style: openFreeMapStyle,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true },
      interactive: false
    });
    map.on("error", consumeRecoverableMapLibreError);

    const routeGradient =
      createRouteSpeedGradient(speedSeries, getRouteTotalDistanceMeters(points)) ??
      createIndexedRouteSpeedGradient(points, speedSeries);
    const speedSegmentGeoJson = routeGradient
      ? null
      : createSpeedSegmentGeoJson(points, speedSeries);
    const hasSpeedSegments = (speedSegmentGeoJson?.features.length ?? 0) > 0;

    await waitForMapLoad(map, signal);
    map.addSource("route", {
      type: "geojson",
      lineMetrics: Boolean(routeGradient),
      data: /** @type {import("maplibre-gl").GeoJSONSourceSpecification["data"]} */ (
        hasSpeedSegments ? speedSegmentGeoJson : createTrackGeoJson(points)
      )
    });
    map.addSource("route-endpoints", {
      type: "geojson",
      data: /** @type {import("maplibre-gl").GeoJSONSourceSpecification["data"]} */ (
        createEndpointGeoJson(points, i18n)
      )
    });
    map.addLayer(
      {
        id: "route-line-halo",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#ffffff",
          "line-width": 12,
          "line-opacity": 0.9
        },
        layout: {
          "line-cap": "round",
          "line-join": "round"
        }
      },
      firstSymbolLayerId
    );
    map.addLayer(
      {
        id: "route-line",
        type: "line",
        source: "route",
        paint: {
          ...(routeGradient
            ? { "line-gradient": routeGradient }
            : {
                "line-color": hasSpeedSegments
                  ? ["coalesce", ["get", ROUTE_COLOR_PROPERTY], ROUTE_LINE_COLOR]
                  : ROUTE_LINE_COLOR
              }),
          "line-width": 7,
          "line-opacity": 0.96
        },
        layout: {
          "line-cap": "round",
          "line-join": "round"
        }
      },
      firstSymbolLayerId
    );
    map.addLayer({
      id: "route-endpoint-circles",
      type: "circle",
      source: "route-endpoints",
      paint: {
        "circle-radius": 9,
        "circle-color": [
          "match",
          ["get", "kind"],
          "start",
          "#6f8f4d",
          "finish",
          "#b94a3a",
          "#17211b"
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 4
      }
    });
    map.addLayer({
      id: "route-endpoint-labels",
      type: "symbol",
      source: "route-endpoints",
      layout: {
        "text-anchor": "bottom",
        "text-field": ["get", "label"],
        "text-font": ["Noto Sans Regular"],
        "text-offset": [0, -1.8],
        "text-size": 13
      },
      paint: {
        "text-color": "#17211b",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2
      }
    });

    const bounds = getBounds(points);
    const mapBounds = /** @type {[[number, number], [number, number]]} */ ([
      [bounds.minLongitude, bounds.minLatitude],
      [bounds.maxLongitude, bounds.maxLatitude]
    ]);
    map.fitBounds(mapBounds, { padding: ROUTE_MAP_FIT_PADDING_PIXELS, duration: 0 });
    if (normalizeMapStyleId(mapStyleId) === DEFAULT_MAP_STYLE_ID) {
      nudgeRouteMapToDetailZoom(map, mapBounds);
    }

    throwIfRouteMapAborted(signal);
    onMapInitialized?.(map);

    await waitForMapIdle(map, signal, idleTimeoutMs);
    return { status: "ready", map };
  } catch (error) {
    map?.remove();

    if (isRouteMapAbortError(error)) {
      if (preserveHostContent) {
        mapNode.remove();
      } else {
        host.replaceChildren();
      }
      return { status: "cancelled", error };
    }

    if (preserveHostContent) {
      mapNode.remove();

      if (!host.querySelector(".static-map-fallback")) {
        renderStaticRouteFallback(host, points, i18n, speedSeries);
      }
    } else {
      renderStaticRouteFallback(host, points, i18n, speedSeries);
    }
    return { status: "fallback", error };
  }
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {[[number, number], [number, number]]} bounds
 */
function nudgeRouteMapToDetailZoom(map, bounds) {
  const currentZoom = map.getZoom();

  if (!Number.isFinite(currentZoom) || currentZoom >= ROUTE_MAP_DETAIL_MIN_ZOOM) {
    return;
  }

  const noPaddingCamera = map.cameraForBounds(bounds, { padding: 0 });
  const noPaddingZoom = noPaddingCamera?.zoom;

  if (
    typeof noPaddingZoom !== "number" ||
    !Number.isFinite(noPaddingZoom) ||
    noPaddingZoom < ROUTE_MAP_DETAIL_MIN_ZOOM
  ) {
    return;
  }

  map.jumpTo({ zoom: ROUTE_MAP_DETAIL_MIN_ZOOM });
}

export function createRouteMapRenderer() {
  /** @type {AbortController | null} */
  let activeController = null;
  /** @type {import("maplibre-gl").Map | null} */
  let activeMap = null;

  function disposeActiveRender() {
    activeController?.abort();
    activeController = null;
    activeMap?.remove();
    activeMap = null;
  }

  return {
    /**
     * @param {HTMLElement} host
     * @param {RoutePoint[]} points
     * @param {ReturnType<typeof createI18n>} [i18n]
     * @param {RouteSpeedSample[]} [speedSeries]
     * @param {string} [mapStyleId]
     */
    render(host, points, i18n = createI18n("en"), speedSeries = [], mapStyleId) {
      disposeActiveRender();
      const controller = new AbortController();
      activeController = controller;

      renderStaticRouteFallback(host, points, i18n, speedSeries);

      return initRouteMap(
        host,
        points,
        i18n,
        speedSeries,
        {
          preserveHostContent: true,
          signal: controller.signal
        },
        mapStyleId
      )
        .then((result) => {
          if (activeController === controller && result.status === "ready") {
            host.querySelector(".static-map-fallback")?.remove();
            activeMap = result.map ?? null;
          }

          return result;
        })
        .finally(() => {
          if (activeController === controller) {
            activeController = null;
          }
        });
    },
    dispose() {
      disposeActiveRender();
    }
  };
}

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
 */
function createRoutePointProgress(points) {
  const distances = [0];
  let totalDistanceMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    totalDistanceMeters += haversineMeters(points[index - 1], points[index]);
    distances.push(totalDistanceMeters);
  }

  if (totalDistanceMeters <= 0) {
    return points.map((_point, index) => index / Math.max(1, points.length - 1));
  }

  return distances.map((distance) => distance / totalDistanceMeters);
}

/**
 * @param {RoutePoint[]} points
 */
function getRouteTotalDistanceMeters(points) {
  let totalDistanceMeters = 0;

  for (let index = 1; index < points.length; index += 1) {
    totalDistanceMeters += haversineMeters(points[index - 1], points[index]);
  }

  return totalDistanceMeters;
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
 * @param {import("maplibre-gl").Map} map
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<void>}
 */
function waitForMapLoad(map, signal) {
  throwIfRouteMapAborted(signal);

  if (typeof map.loaded === "function" && map.loaded()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new RouteMapAbortError());
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Map load timeout"));
    }, 12000);

    signal?.addEventListener("abort", abort, { once: true });
    map.once("load", () => {
      cleanup();
      resolve();
    });
    map.once("error", (event) => {
      cleanup();
      reject(event.error ?? new Error("Map error"));
    });
  });
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {AbortSignal | undefined} signal
 * @param {number | undefined} timeoutMs
 * @returns {Promise<void>}
 */
function waitForMapIdle(map, signal, timeoutMs) {
  return waitForMapEvent(map, "idle", signal, timeoutMs ?? MAP_IDLE_TIMEOUT_MS);
}

/**
 * @param {import("maplibre-gl").Map} map
 * @param {string} eventName
 * @param {AbortSignal | undefined} signal
 * @param {number | undefined} timeoutMs
 * @returns {Promise<void>}
 */
function waitForMapEvent(map, eventName, signal, timeoutMs) {
  throwIfRouteMapAborted(signal);

  return new Promise((resolve, reject) => {
    /** @type {number | undefined} */
    let timeout;
    const cleanup = () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new RouteMapAbortError());
    };

    signal?.addEventListener("abort", abort, { once: true });
    if (Number.isFinite(timeoutMs) && Number(timeoutMs) > 0) {
      timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Map ${eventName} timeout`));
      }, Number(timeoutMs));
    }
    map.once(eventName, () => {
      cleanup();
      resolve();
    });
  });
}
