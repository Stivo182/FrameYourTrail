import { createI18n } from "../i18n/index.js";
import { initRouteMap } from "./maplibre-route-renderer.js";
import { renderStaticRouteFallback } from "./static-route-map.js";

/** @typedef {import("../core/route-types.js").RouteGeometryPoint} RoutePoint */
/** @typedef {import("../core/route-types.js").RouteSpeedSample} RouteSpeedSample */

export { createEndpointGeoJson, createTrackGeoJson } from "./route-map-data.js";
export { initRouteMap };
export { ROUTE_LINE_COLOR, createRouteSpeedGradient } from "./route-speed-style.js";
export { renderStaticRouteFallback };

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
