import * as d3 from "d3";
import { formatDistance, formatSpeed, getFormatUnits } from "../core/formatters.js";
import { createI18n } from "../i18n/index.js";

const WIDTH = 760;
const HEIGHT = 230;
const MARGIN = { top: 38, right: 22, bottom: 30, left: 46 };
const TOOLTIP_WIDTH = 126;
const TOOLTIP_HEIGHT = 46;
let gradientIndex = 0;

/**
 * @typedef {object} SpeedChartSample
 * @property {number} distanceFromStartMeters
 * @property {number | null} [speedKmh]
 */

/**
 * @typedef {object} SlopeChartSample
 * @property {number} distanceFromStartMeters
 * @property {number | null} [slopePercent]
 */

/**
 * @typedef {object} ChartAnalysis
 * @property {SpeedChartSample[]} speedSeries
 * @property {SlopeChartSample[]} slopeSeries
 * @property {number | null} averageSpeedKmh
 * @property {number | null} [movingAverageSpeedKmh]
 */

const sampleDistanceBisector = d3.bisector(
  /**
   * @param {SpeedChartSample | SlopeChartSample} sample
   */
  (sample) => sample.distanceFromStartMeters
).left;

/**
 * @param {HTMLElement} host
 * @param {ChartAnalysis} analysis
 * @param {ReturnType<typeof createI18n>} [i18n]
 */
export function renderSpeedChart(host, analysis, i18n = createI18n("en")) {
  host.replaceChildren();
  const samples = analysis.speedSeries.filter(isSpeedSample);

  if (samples.length < 2) {
    host.textContent = i18n.t("charts.speedUnavailable");
    return;
  }

  const svg = createSvg(host, i18n.t("charts.speedAria"));
  const speedGradientId = getNextGradientId("speed-ribbon-gradient");
  addSpeedRibbonGradient(svg, speedGradientId);
  addChartHeading(svg, i18n.t("charts.speedTitle"), "speed");
  const x = createDistanceScale(samples);
  let maxSpeed = 1;

  for (const sample of samples) {
    if (sample.speedKmh > maxSpeed) {
      maxSpeed = sample.speedKmh;
    }
  }

  const speedCeiling = Math.max(maxSpeed * 1.25, maxSpeed + 1, 4);
  const y = d3
    .scaleLinear()
    .domain([0, speedCeiling])
    .nice()
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);
  const line = /** @type {d3.Line<SpeedChartSample & { speedKmh: number }>} */ (d3.line());
  line
    .x((sample) => x(sample.distanceFromStartMeters))
    .y((sample) => y(sample.speedKmh))
    .curve(d3.curveMonotoneX);
  const area = /** @type {d3.Area<SpeedChartSample & { speedKmh: number }>} */ (d3.area());
  area
    .x((sample) => x(sample.distanceFromStartMeters))
    .y0(HEIGHT - MARGIN.bottom)
    .y1((sample) => y(sample.speedKmh))
    .curve(d3.curveMonotoneX);

  addGrid(svg, x, y);
  svg
    .append("path")
    .attr("data-chart-ribbon", "speed")
    .attr("class", "chart-area chart-area--speed")
    .attr("fill", `url(#${speedGradientId})`)
    .attr("d", area(samples));
  svg
    .append("path")
    .attr("data-chart-line", "speed")
    .attr("class", "chart-line chart-line--speed")
    .attr("d", line(samples));

  if (Number.isFinite(analysis.averageSpeedKmh)) {
    svg
      .append("line")
      .attr("data-average-speed", "")
      .attr("class", "chart-average")
      .attr("x1", MARGIN.left)
      .attr("x2", WIDTH - MARGIN.right)
      .attr("y1", y(Number(analysis.averageSpeedKmh)))
      .attr("y2", y(Number(analysis.averageSpeedKmh)));
  }

  if (Number.isFinite(analysis.movingAverageSpeedKmh)) {
    svg
      .append("line")
      .attr("data-moving-speed", "")
      .attr("class", "chart-moving-speed")
      .attr("x1", MARGIN.left)
      .attr("x2", WIDTH - MARGIN.right)
      .attr("y1", y(Number(analysis.movingAverageSpeedKmh)))
      .attr("y2", y(Number(analysis.movingAverageSpeedKmh)));
  }

  addChartLegend(svg, "speed", [
    { kind: "speed", label: i18n.t("charts.speedLegendRibbon"), width: 72 },
    { kind: "average", label: i18n.t("charts.speedLegendAverage"), width: 92 },
    { kind: "moving", label: i18n.t("charts.speedLegendMoving"), width: 116 }
  ]);
  addPointTooltip(
    svg,
    "speed",
    samples,
    x,
    y,
    (sample) => sample.speedKmh,
    (sample) => formatSpeed(sample.speedKmh, i18n.language, getFormatUnits(i18n)),
    i18n
  );
}

/**
 * @param {HTMLElement} host
 * @param {ChartAnalysis} analysis
 * @param {ReturnType<typeof createI18n>} [i18n]
 */
export function renderSlopeChart(host, analysis, i18n = createI18n("en")) {
  host.replaceChildren();
  const samples = analysis.slopeSeries.filter(isSlopeSample);

  if (samples.length < 2) {
    host.textContent = i18n.t("charts.slopeUnavailable");
    return;
  }

  const svg = createSvg(host, i18n.t("charts.slopeAria"));
  addChartHeading(svg, i18n.t("charts.slopeTitle"), "slope");
  const maxAbs = getSlopeScaleMax(samples);
  const x = createDistanceScale(samples);
  const y = d3
    .scaleLinear()
    .domain([-maxAbs, maxAbs])
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);
  const zeroY = y(0);
  const barSegments = createSlopeBarSegments(samples, x, y, zeroY, maxAbs);

  addGrid(svg, x, y);
  svg
    .append("g")
    .attr("class", "chart-slope-bars")
    .selectAll("rect")
    .data(barSegments)
    .join("rect")
    .attr("data-slope-bar", (segment) => segment.kind)
    .attr("class", (segment) => `chart-slope-bar chart-slope-bar--${segment.kind}`)
    .attr("x", (segment) => segment.x)
    .attr("y", (segment) => segment.y)
    .attr("rx", 2)
    .attr("width", (segment) => segment.width)
    .attr("height", (segment) => segment.height);
  svg
    .append("line")
    .attr("data-slope-baseline", "")
    .attr("class", "chart-zero")
    .attr("x1", MARGIN.left)
    .attr("x2", WIDTH - MARGIN.right)
    .attr("y1", zeroY)
    .attr("y2", zeroY);

  addChartLegend(svg, "slope", [
    { kind: "slope-up", label: i18n.t("charts.slopeLegendUp"), width: 84 },
    { kind: "slope-down", label: i18n.t("charts.slopeLegendDown"), width: 78 }
  ]);
  addPointTooltip(
    svg,
    "slope",
    samples,
    x,
    y,
    (sample) => clampSlope(sample.slopePercent, maxAbs),
    (sample) => formatSlopePercent(sample.slopePercent),
    i18n
  );
}

/**
 * @param {HTMLElement} host
 * @param {string} label
 */
function createSvg(host, label) {
  return d3
    .select(host)
    .append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
    .attr("role", "img")
    .attr("aria-label", label);
}

/**
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg
 * @param {string} label
 * @param {string} name
 */
function addChartHeading(svg, label, name) {
  svg
    .append("text")
    .attr("class", "chart-title chart-title--poster")
    .attr("data-chart-heading", name)
    .attr("x", MARGIN.left)
    .attr("y", 28)
    .text(label);
}

/**
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg
 * @param {string} gradientId
 */
function addSpeedRibbonGradient(svg, gradientId) {
  const gradient = svg
    .append("defs")
    .append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "0%")
    .attr("y1", "0%")
    .attr("y2", "100%");

  gradient
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "#2f82d8")
    .attr("stop-opacity", 0.38);
  gradient
    .append("stop")
    .attr("offset", "62%")
    .attr("stop-color", "#6fb7e8")
    .attr("stop-opacity", 0.18);
  gradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#e9f4fb")
    .attr("stop-opacity", 0.02);
}

/**
 * @typedef {object} ChartLegendItem
 * @property {string} kind
 * @property {string} label
 * @property {number} width
 */

/**
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg
 * @param {string} name
 * @param {ChartLegendItem[]} items
 */
function addChartLegend(svg, name, items) {
  let cursor = 0;
  const legend = svg
    .append("g")
    .attr("class", "chart-legend")
    .attr("data-chart-legend", name)
    .attr("transform", `translate(${WIDTH - MARGIN.right - 286}, 9)`);

  for (const item of items) {
    const entry = legend.append("g").attr("transform", `translate(${cursor}, 0)`);
    entry
      .append("rect")
      .attr("class", `chart-legend__swatch chart-legend__swatch--${item.kind}`)
      .attr("width", 10)
      .attr("height", 10)
      .attr("rx", 3);
    entry
      .append("text")
      .attr("class", "chart-legend__label")
      .attr("x", 15)
      .attr("y", 10)
      .text(item.label);
    cursor += item.width;
  }
}

/**
 * @template {SpeedChartSample | SlopeChartSample} T
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg
 * @param {string} name
 * @param {T[]} samples
 * @param {d3.ScaleLinear<number, number>} x
 * @param {d3.ScaleLinear<number, number>} y
 * @param {(sample: T) => number} getYValue
 * @param {(sample: T) => string} formatValue
 * @param {ReturnType<typeof createI18n>} i18n
 */
function addPointTooltip(svg, name, samples, x, y, getYValue, formatValue, i18n) {
  const svgNode = svg.node();
  const units = getFormatUnits(i18n);

  if (!svgNode) {
    return;
  }

  const tooltip = svg
    .append("g")
    .attr("class", "chart-tooltip")
    .attr("data-chart-tooltip", name)
    .attr("opacity", 0);
  const guide = tooltip
    .append("line")
    .attr("class", "chart-tooltip__guide")
    .attr("y1", MARGIN.top)
    .attr("y2", HEIGHT - MARGIN.bottom);
  const dot = tooltip.append("circle").attr("class", "chart-tooltip__dot").attr("r", 5);
  const label = tooltip.append("g").attr("class", "chart-tooltip__label");
  label
    .append("rect")
    .attr("class", "chart-tooltip__panel")
    .attr("width", TOOLTIP_WIDTH)
    .attr("height", TOOLTIP_HEIGHT)
    .attr("rx", 6);
  const distanceText = label
    .append("text")
    .attr("class", "chart-tooltip__distance")
    .attr("x", 10)
    .attr("y", 17);
  const valueText = label
    .append("text")
    .attr("class", "chart-tooltip__value")
    .attr("x", 10)
    .attr("y", 36);

  const updateTooltip = (event) => {
    const bounds = svgNode.getBoundingClientRect();
    const viewX =
      bounds.width > 0 ? ((event.clientX - bounds.left) / bounds.width) * WIDTH : MARGIN.left;
    const distance = x.invert(clampNumber(viewX, MARGIN.left, WIDTH - MARGIN.right));
    const sample = getNearestSample(samples, distance);
    const sampleX = x(sample.distanceFromStartMeters);
    const sampleY = y(getYValue(sample));
    const panelX = clampNumber(sampleX + 12, MARGIN.left, WIDTH - MARGIN.right - TOOLTIP_WIDTH);
    const panelY = clampNumber(
      sampleY - TOOLTIP_HEIGHT - 10,
      MARGIN.top + 4,
      HEIGHT - MARGIN.bottom - TOOLTIP_HEIGHT - 4
    );

    tooltip.attr("opacity", 1);
    guide.attr("x1", sampleX).attr("x2", sampleX);
    dot.attr("cx", sampleX).attr("cy", sampleY);
    label.attr("transform", `translate(${panelX},${panelY})`);
    distanceText.text(formatDistance(sample.distanceFromStartMeters, i18n.language, units));
    valueText.text(formatValue(sample));
  };

  svg
    .append("rect")
    .attr("class", "chart-hover-target")
    .attr("data-chart-hover-target", name)
    .attr("x", MARGIN.left)
    .attr("y", MARGIN.top)
    .attr("width", WIDTH - MARGIN.left - MARGIN.right)
    .attr("height", HEIGHT - MARGIN.top - MARGIN.bottom)
    .on("pointermove", updateTooltip)
    .on("mousemove", updateTooltip)
    .on("mouseleave", () => tooltip.attr("opacity", 0));
}

/**
 * @param {(SpeedChartSample | SlopeChartSample)[]} samples
 */
function createDistanceScale(samples) {
  const extent = d3.extent(samples, (sample) => sample.distanceFromStartMeters);
  const min = extent[0] ?? 0;
  const max = extent[1] ?? min + 1;
  return d3
    .scaleLinear()
    .domain(min === max ? [min, min + 1] : [min, max])
    .range([MARGIN.left, WIDTH - MARGIN.right]);
}

/**
 * @typedef {object} SlopeBarSegment
 * @property {"up" | "down"} kind
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @param {(SlopeChartSample & { slopePercent: number })[]} samples
 * @param {d3.ScaleLinear<number, number>} x
 * @param {d3.ScaleLinear<number, number>} y
 * @param {number} zeroY
 * @param {number} maxAbs
 * @returns {SlopeBarSegment[]}
 */
function createSlopeBarSegments(samples, x, y, zeroY, maxAbs) {
  const domain = x.domain();

  return samples.map((sample, index) => {
    const previous = samples[index - 1];
    const next = samples[index + 1];
    const leftDistance = previous
      ? (previous.distanceFromStartMeters + sample.distanceFromStartMeters) / 2
      : domain[0];
    const rightDistance = next
      ? (sample.distanceFromStartMeters + next.distanceFromStartMeters) / 2
      : domain[1];
    const clampedSlope = clampSlope(sample.slopePercent, maxAbs);
    const barY = y(clampedSlope);
    const left = x(leftDistance);
    const right = x(rightDistance);

    return {
      kind: sample.slopePercent >= 0 ? "up" : "down",
      x: Math.min(left, right),
      y: Math.min(zeroY, barY),
      width: Math.max(4, Math.abs(right - left)),
      height: Math.max(3, Math.abs(barY - zeroY))
    };
  });
}

/**
 * @param {(SlopeChartSample & { slopePercent: number })[]} samples
 */
function getSlopeScaleMax(samples) {
  const values = samples
    .map((sample) => Math.abs(sample.slopePercent))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const percentileIndex = Math.max(0, Math.floor((values.length - 1) * 0.92));
  const percentile = values[percentileIndex] ?? 0;

  return Math.max(6, percentile * 1.2);
}

/**
 * @param {number} value
 * @param {number} maxAbs
 */
function clampSlope(value, maxAbs) {
  return Math.max(-maxAbs, Math.min(maxAbs, value));
}

/**
 * @template {SpeedChartSample | SlopeChartSample} T
 * @param {T[]} samples
 * @param {number} distance
 * @returns {T}
 */
function getNearestSample(samples, distance) {
  const insertionIndex = sampleDistanceBisector(samples, distance);

  if (insertionIndex <= 0) {
    return samples[0];
  }

  if (insertionIndex >= samples.length) {
    return samples.at(-1) ?? samples[0];
  }

  const rightSample = samples[insertionIndex];
  const leftSample = samples[insertionIndex - 1];
  const leftDelta = Math.abs(leftSample.distanceFromStartMeters - distance);
  const rightDelta = Math.abs(rightSample.distanceFromStartMeters - distance);

  return leftDelta <= rightDelta ? leftSample : rightSample;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {number} value
 */
function formatSlopePercent(value) {
  return `${value.toFixed(1)}%`;
}

/**
 * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg
 * @param {d3.ScaleLinear<number, number>} x
 * @param {d3.ScaleLinear<number, number>} y
 */
function addGrid(svg, x, y) {
  svg
    .append("g")
    .attr("class", "chart-grid-lines")
    .call(
      d3
        .axisLeft(y)
        .ticks(4)
        .tickSize(-(WIDTH - MARGIN.left - MARGIN.right))
        .tickFormat(formatEmptyTick)
    );
  svg
    .append("g")
    .attr("class", "chart-axis chart-axis--x")
    .attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(formatDistanceTick));
}

/**
 * @param {d3.NumberValue} value
 */
function formatDistanceTick(value) {
  const kilometers = Number(value) / 1000;

  if (Math.abs(kilometers) >= 10 || Number.isInteger(kilometers)) {
    return `${Math.round(kilometers)}`;
  }

  return kilometers.toFixed(1);
}

function formatEmptyTick() {
  return "";
}

/**
 * @param {string} [prefix]
 * @returns {string}
 */
function getNextGradientId(prefix = "elevation-line-gradient") {
  gradientIndex += 1;
  return `${prefix}-${gradientIndex}`;
}

/**
 * @param {SpeedChartSample} sample
 * @returns {sample is SpeedChartSample & { speedKmh: number }}
 */
function isSpeedSample(sample) {
  return Number.isFinite(sample.distanceFromStartMeters) && Number.isFinite(sample.speedKmh);
}

/**
 * @param {SlopeChartSample} sample
 * @returns {sample is SlopeChartSample & { slopePercent: number }}
 */
function isSlopeSample(sample) {
  return Number.isFinite(sample.distanceFromStartMeters) && Number.isFinite(sample.slopePercent);
}
