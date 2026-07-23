import { getBounds } from "../core/geo.js";
import { createI18n } from "../i18n/index.js";
import {
  DEFAULT_MAP_STYLE_ID,
  getMapTextLabelBoundaryIndex,
  loadMapStyle,
  normalizeMapStyleId
} from "./map-styles.js";
import {
  createEndpointGeoJson,
  createTrackGeoJson,
  getRouteTotalDistanceMeters
} from "./route-map-data.js";
import {
  ROUTE_LINE_COLOR,
  createIndexedRouteSpeedGradient,
  createRouteSpeedGradient
} from "./route-speed-style.js";
import { ROUTE_COLOR_PROPERTY, createSpeedSegmentGeoJson } from "./route-speed-segments.js";
import { renderStaticRouteFallback } from "./static-route-map.js";

/** @typedef {import("../core/route-types.js").RouteGeometryPoint} RoutePoint */
/** @typedef {import("../core/route-types.js").RouteSpeedSample} RouteSpeedSample */

const ROUTE_MAP_FIT_PADDING_PIXELS = 48;
const ROUTE_MAP_DETAIL_ENDPOINT_PADDING_PIXELS = 40;
const ROUTE_MAP_DETAIL_MIN_ZOOM = 13;
const MAP_IDLE_TIMEOUT_MS = 12000;

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
    const textLabelBoundaryIndex = getMapTextLabelBoundaryIndex(openFreeMapStyle.layers);
    const routeLayerAnchorId = openFreeMapStyle.layers[textLabelBoundaryIndex]?.id;

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
    const initializedMap = map;
    /**
     * @param {import("maplibre-gl").LineLayerSpecification} layer
     */
    const addRouteLineLayer = (layer) => {
      if (routeLayerAnchorId) {
        initializedMap.addLayer(layer, routeLayerAnchorId);
      } else {
        initializedMap.addLayer(layer);
      }
    };

    addRouteLineLayer({
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
    });
    addRouteLineLayer({
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
    });
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

  const safePaddingCamera = map.cameraForBounds(bounds, {
    padding: ROUTE_MAP_DETAIL_ENDPOINT_PADDING_PIXELS
  });
  const safePaddingZoom = safePaddingCamera?.zoom;

  if (
    typeof safePaddingZoom !== "number" ||
    !Number.isFinite(safePaddingZoom) ||
    safePaddingZoom < ROUTE_MAP_DETAIL_MIN_ZOOM
  ) {
    return;
  }

  map.jumpTo({ zoom: ROUTE_MAP_DETAIL_MIN_ZOOM });
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
