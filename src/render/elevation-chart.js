import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { createI18n } from "../i18n/index.js";
import { createElevationPosterOption } from "./echarts-options.js";

const WIDTH = 760;
const HEIGHT = 230;

echarts.use([
  LineChart,
  GridComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer
]);

const elevationChartStates = new WeakMap();

/**
 * @typedef {object} DistanceChartSample
 * @property {number} distanceFromStartMeters
 * @property {number | null} [elevation]
 * @property {number} [continuousRunId]
 */

/**
 * @typedef {object} ChartAnalysis
 * @property {DistanceChartSample[]} distanceSeries
 * @property {unknown[]} [elevationSeries]
 * @property {number | null} [totalDistanceMeters]
 */

/**
 * @param {HTMLElement} host
 * @param {ChartAnalysis} analysis
 * @param {ReturnType<typeof createI18n>} [i18n]
 */
export function renderElevationChart(host, analysis, i18n = createI18n("en")) {
  disposeElevationChart(host);
  host.replaceChildren();
  const samples = selectElevationChartSamples(analysis);

  if (samples.length < 2) {
    host.textContent = i18n.t("charts.elevationUnavailable");
    return;
  }

  const chartFrame = document.createElement("div");
  chartFrame.className = "echarts-chart-frame";
  chartFrame.dataset.chartEngine = "echarts";
  chartFrame.setAttribute("role", "img");
  chartFrame.setAttribute("aria-label", i18n.t("charts.elevationAria"));

  const chartHost = document.createElement("div");
  chartHost.className = "echarts-chart echarts-chart--elevation";
  chartFrame.append(chartHost);
  host.append(chartFrame);

  const chart = echarts.init(chartHost, null, {
    renderer: "svg",
    width: WIDTH,
    height: HEIGHT
  });
  chart.setOption(
    createElevationPosterOption(samples, i18n, {
      maxDistanceMeters: analysis.totalDistanceMeters
    })
  );

  const resizeChart = () =>
    chart.resize({
      width: chartHost.clientWidth || WIDTH,
      height: chartHost.clientHeight || HEIGHT
    });
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(resizeChart) : undefined;
  observer?.observe(chartHost);
  const animationFrameId =
    typeof requestAnimationFrame === "function" ? requestAnimationFrame(resizeChart) : undefined;

  if (animationFrameId === undefined) {
    resizeChart();
  }

  elevationChartStates.set(host, { chart, observer, animationFrameId });
}

/**
 * @param {HTMLElement} host
 */
export function disposeElevationChart(host) {
  const state = elevationChartStates.get(host);

  if (!state) {
    return;
  }

  state.observer?.disconnect();
  if (state.animationFrameId !== undefined && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.animationFrameId);
  }
  state.chart.dispose();
  elevationChartStates.delete(host);
}

/**
 * @param {ChartAnalysis} analysis
 * @returns {(DistanceChartSample & { elevation: number })[]}
 */
export function selectElevationChartSamples(analysis) {
  const filteredSamples = getValidElevationSamples(analysis.elevationSeries);

  if (filteredSamples.length >= 2) {
    return filteredSamples;
  }

  return getValidElevationSamples(analysis.distanceSeries);
}

/**
 * @param {unknown} samples
 * @returns {(DistanceChartSample & { elevation: number })[]}
 */
function getValidElevationSamples(samples) {
  return Array.isArray(samples) ? samples.filter(isElevationSample) : [];
}

/**
 * @param {unknown} sample
 * @returns {sample is DistanceChartSample & { elevation: number }}
 */
function isElevationSample(sample) {
  if (!sample || typeof sample !== "object") {
    return false;
  }

  const record = /** @type {Record<string, unknown>} */ (sample);
  return Number.isFinite(record.distanceFromStartMeters) && Number.isFinite(record.elevation);
}
