/**
 * @typedef {object} I18nLike
 * @property {string} language
 * @property {(key: string) => string} t
 */

/**
 * @typedef {{
 *   mapStyleId: string,
 *   title: string,
 *   dateLabel: string,
 *   fileName: string,
 *   warnings: import("../state/app-state.js").AppMessage[],
 *   trackLocation: NonNullable<import("../state/app-state.js").AppState["trackLocation"]> | null,
 *   parsed: import("../core/route-types.js").RouteSource,
 *   analysis: NonNullable<import("../state/app-state.js").AppState["analysis"]>
 * }} PreviewPayload
 */

/**
 * @typedef {{
 *   renderInfographic: (payload: PreviewPayload, i18n: any) => HTMLElement
 * }} PosterRendererModule
 */

/**
 * @typedef {{
 *   render: (
 *     host: HTMLElement,
 *     routePoints: import("../core/route-types.js").RoutePoint[],
 *     i18n: any,
 *     speedSeries: NonNullable<import("../state/app-state.js").AppState["analysis"]>["speedSeries"],
 *     mapStyleId?: string
 *   ) => Promise<void> | void
 * }} RouteMapRenderer
 */

/**
 * @typedef {{
 *   renderElevationChart: (
 *     host: HTMLElement,
 *     analysis: any,
 *     i18n: any
 *   ) => void,
 *   disposeElevationChart?: (host: HTMLElement) => void
 * }} ElevationChartModule
 */

/**
 * @param {{
 *   loadPosterRenderer: () => Promise<PosterRendererModule>,
 *   getRouteMapRenderer: () => Promise<RouteMapRenderer>,
 *   loadElevationChart?: () => Promise<ElevationChartModule>
 * }} dependencies
 */
export function createPreviewRenderer({
  loadPosterRenderer,
  getRouteMapRenderer,
  loadElevationChart = () => import("./elevation-chart.js")
}) {
  let renderToken = 0;
  let posterPreviewResizeObserver = null;
  let latestPosterRenderPromise = Promise.resolve();
  let latestChartRenderPromise = Promise.resolve();
  let latestMapRenderPromise = Promise.resolve();
  /** @type {HTMLElement | null} */
  let latestElevationChartHost = null;
  /** @type {((host: HTMLElement) => void) | null} */
  let latestDisposeElevationChart = null;

  const isCurrentRender = (token) => token === renderToken;

  return {
    reset() {
      renderToken += 1;
      disposeLatestElevationChart();
      disconnectPosterPreviewResizeObserver();
      latestPosterRenderPromise = Promise.resolve();
      latestChartRenderPromise = Promise.resolve();
      latestMapRenderPromise = Promise.resolve();
    },

    /**
     * @param {HTMLElement} host
     * @param {PreviewPayload} payload
     * @param {I18nLike} i18n
     */
    render(host, payload, i18n) {
      const token = renderToken;
      latestPosterRenderPromise = renderPosterPreviewAsync(host, payload, i18n, token);
      return latestPosterRenderPromise;
    },

    getPendingRenderPromises() {
      return {
        poster: latestPosterRenderPromise,
        chart: latestChartRenderPromise,
        map: latestMapRenderPromise
      };
    }
  };

  /**
   * @param {HTMLElement} host
   * @param {PreviewPayload} payload
   * @param {I18nLike} i18n
   * @param {number} token
   */
  async function renderPosterPreviewAsync(host, payload, i18n, token) {
    try {
      const { renderInfographic } = await loadPosterRenderer();

      if (!isCurrentRender(token) || !host.isConnected) {
        return;
      }

      const preview = renderInfographic(payload, i18n);

      if (!isCurrentRender(token) || !host.isConnected) {
        return;
      }

      host.replaceChildren(preview);
      fitPosterPreview(preview);

      const mapHost = preview.querySelector("[data-map-slot]");
      const elevationHost = preview.querySelector("[data-chart='elevation']");

      if (mapHost instanceof HTMLElement) {
        const speedSeries = payload.analysis.speedSeries ?? [];
        const routePoints = payload.analysis.routePoints ?? payload.parsed.points;
        latestMapRenderPromise = renderRouteMapAsync(
          mapHost,
          routePoints,
          i18n,
          speedSeries,
          payload.mapStyleId,
          token
        );
      } else {
        latestMapRenderPromise = Promise.resolve();
      }

      if (elevationHost instanceof HTMLElement) {
        latestChartRenderPromise = renderElevationChartAsync(
          elevationHost,
          payload.analysis,
          i18n,
          token
        );
      } else {
        latestChartRenderPromise = Promise.resolve();
      }
    } catch {
      if (!isCurrentRender(token) || !host.isConnected) {
        return;
      }

      host.replaceChildren(createPreviewRenderError(i18n));
      latestChartRenderPromise = Promise.resolve();
      latestMapRenderPromise = Promise.resolve();
    }
  }

  /**
   * @param {HTMLElement} host
   * @param {import("../core/route-types.js").RoutePoint[]} routePoints
   * @param {I18nLike} i18n
   * @param {NonNullable<import("../state/app-state.js").AppState["analysis"]>["speedSeries"]} speedSeries
   * @param {string} mapStyleId
   * @param {number} token
   */
  async function renderRouteMapAsync(host, routePoints, i18n, speedSeries, mapStyleId, token) {
    try {
      const renderer = await getRouteMapRenderer();

      if (!isCurrentRender(token) || !host.isConnected) {
        return;
      }

      await renderer.render(host, routePoints, i18n, speedSeries, mapStyleId);
    } catch {
      if (!isCurrentRender(token) || !host.isConnected) {
        return;
      }

      host.dataset.mapStatus = "error";
    }
  }

  /**
   * @param {HTMLElement} host
   * @param {NonNullable<import("../state/app-state.js").AppState["analysis"]>} analysis
   * @param {I18nLike} i18n
   * @param {number} token
   */
  async function renderElevationChartAsync(host, analysis, i18n, token) {
    try {
      const chartModule = await loadElevationChart();

      if (!isCurrentRender(token) || !host.isConnected) {
        return;
      }

      chartModule.renderElevationChart(host, analysis, i18n);
      latestElevationChartHost = host;
      latestDisposeElevationChart = chartModule.disposeElevationChart ?? null;
    } catch {
      if (!isCurrentRender(token) || !host.isConnected) {
        return;
      }

      host.dataset.chartStatus = "error";
    }
  }

  /**
   * @param {HTMLElement} preview
   */
  function fitPosterPreview(preview) {
    const frame = preview.closest("[data-poster-preview-frame]");
    const scroll = preview.closest(".poster-scroll");

    if (!(frame instanceof HTMLElement) || !(scroll instanceof HTMLElement)) {
      return;
    }

    const posterWidth =
      readCssPixelValue(preview.style.getPropertyValue("--poster-width")) ?? preview.offsetWidth;
    const posterHeight =
      readCssPixelValue(preview.style.getPropertyValue("--poster-height")) ?? preview.offsetHeight;

    if (posterWidth <= 0 || posterHeight <= 0) {
      return;
    }

    frame.style.setProperty("--poster-width", `${posterWidth}px`);
    frame.style.setProperty("--poster-height", `${posterHeight}px`);

    const updateLayout = () => {
      const availableWidth = scroll.clientWidth;
      const scale = Math.min(1, availableWidth > 0 ? availableWidth / posterWidth : 1);
      const contentHeight = Math.max(posterHeight, preview.offsetHeight, preview.scrollHeight);

      frame.style.setProperty("--poster-preview-scale", String(scale));
      frame.style.setProperty("--poster-preview-width", `${posterWidth * scale}px`);
      frame.style.setProperty("--poster-preview-height", `${contentHeight * scale}px`);
    };

    updateLayout();

    if (typeof ResizeObserver !== "function") {
      return;
    }

    posterPreviewResizeObserver = new ResizeObserver(updateLayout);
    posterPreviewResizeObserver.observe(scroll);
    posterPreviewResizeObserver.observe(preview);
  }

  function disconnectPosterPreviewResizeObserver() {
    posterPreviewResizeObserver?.disconnect();
    posterPreviewResizeObserver = null;
  }

  function disposeLatestElevationChart() {
    if (latestElevationChartHost && latestDisposeElevationChart) {
      latestDisposeElevationChart(latestElevationChartHost);
    }

    latestElevationChartHost = null;
    latestDisposeElevationChart = null;
  }
}

/**
 * @param {I18nLike} i18n
 */
function createPreviewRenderError(i18n) {
  const message = document.createElement("p");
  message.dataset.previewRenderError = "";
  message.className = "message message--error";
  message.setAttribute("role", "alert");
  message.textContent = i18n.t("messages.previewRenderError");
  return message;
}

/**
 * @param {string} value
 * @returns {number | null}
 */
export function readCssPixelValue(value) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}
