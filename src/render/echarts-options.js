import { formatDistance, formatElevation, getFormatUnits } from "../core/formatters.js";
import { createI18n } from "../i18n/index.js";

const POSTER_BODY_FONT_FAMILY = '"Inter", "Manrope", sans-serif';
const EXTREMUM_LABEL_EDGE_RESERVE_RATIO = 0.08;

/**
 * @typedef {object} ElevationChartSample
 * @property {number} distanceFromStartMeters
 * @property {number} elevation
 * @property {number} [continuousRunId]
 */

/**
 * @param {ElevationChartSample[]} samples
 * @param {ReturnType<typeof createI18n>} [i18n]
 * @param {{ maxDistanceMeters?: number | null }} [options]
 */
export function createElevationPosterOption(samples, i18n = createI18n("en"), options = {}) {
  const data = buildElevationChartData(samples);
  let minSample = samples[0];
  let maxSample = samples[0];
  let minElevation = samples[0].elevation;
  let maxElevation = samples[0].elevation;

  for (const sample of samples) {
    if (sample.elevation < minElevation) {
      minSample = sample;
      minElevation = sample.elevation;
    }

    if (sample.elevation > maxElevation) {
      maxSample = sample;
      maxElevation = sample.elevation;
    }
  }

  const elevationPadding = Math.max(20, (maxElevation - minElevation) * 0.14);
  const minDistance = data[0]?.[0] ?? 0;
  const maxDistance = Math.max(data.at(-1)?.[0] ?? 1, toDistanceKm(options.maxDistanceMeters));
  const minLabelPosition = getExtremumLabelPosition(minSample, minDistance, maxDistance, "right");
  const maxLabelPosition = getExtremumLabelPosition(maxSample, minDistance, maxDistance, "top");

  return {
    animation: false,
    backgroundColor: "transparent",
    textStyle: {
      fontFamily: POSTER_BODY_FONT_FAMILY
    },
    title: {
      show: false,
      text: i18n.t("charts.elevationSeries"),
      left: 42,
      top: 8,
      textStyle: {
        color: "#17211b",
        fontFamily: POSTER_BODY_FONT_FAMILY,
        fontSize: 18,
        fontWeight: 900
      }
    },
    tooltip: {
      trigger: "axis",
      className: "echarts-route-tooltip",
      confine: true,
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "rgba(43, 61, 50, 0.16)",
      borderWidth: 1,
      padding: [8, 10],
      textStyle: {
        color: "#17211b",
        fontFamily: POSTER_BODY_FONT_FAMILY,
        fontSize: 12,
        fontWeight: 800
      },
      axisPointer: {
        type: "line",
        lineStyle: {
          color: "rgba(43, 61, 50, 0.32)",
          width: 1
        }
      },
      formatter: (params) => formatElevationTooltip(params, i18n)
    },
    grid: {
      left: 58,
      right: 24,
      top: 18,
      bottom: 24
    },
    xAxis: {
      type: "value",
      min: minDistance,
      max: maxDistance,
      splitNumber: 5,
      axisLabel: {
        color: "#24364a",
        fontFamily: POSTER_BODY_FONT_FAMILY,
        fontSize: 13,
        fontWeight: 900,
        formatter: (value) =>
          formatDistance(Number(value) * 1000, i18n.language, getFormatUnits(i18n))
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: "value",
      position: "left",
      name: i18n.t("charts.elevationYAxis"),
      nameGap: 34,
      nameLocation: "middle",
      nameRotate: 90,
      nameTextStyle: {
        color: "#5f6c61",
        fontFamily: POSTER_BODY_FONT_FAMILY,
        fontSize: 12,
        fontWeight: 900
      },
      min: Math.floor(minElevation - elevationPadding),
      max: Math.ceil(maxElevation + elevationPadding),
      splitNumber: 5,
      axisLabel: {
        show: true,
        color: "#415348",
        fontFamily: POSTER_BODY_FONT_FAMILY,
        fontSize: 11,
        fontWeight: 800,
        formatter: "{value}"
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: "rgba(43, 61, 50, 0.08)",
          type: [4, 8],
          width: 1
        }
      }
    },
    visualMap: [
      {
        show: false,
        type: "continuous",
        dimension: 1,
        min: minElevation,
        max: maxElevation,
        inRange: {
          color: ["#6f8f4d", "#c99a3d", "#d9793e", "#b94a3a"]
        }
      }
    ],
    series: [
      {
        name: i18n.t("charts.elevationSeries"),
        type: "line",
        data,
        connectNulls: false,
        smooth: true,
        showSymbol: false,
        symbol: "circle",
        symbolSize: 10,
        lineStyle: {
          width: 6,
          cap: "round",
          join: "round",
          shadowBlur: 6,
          shadowColor: "rgba(125, 70, 28, 0.18)"
        },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(217, 121, 62, 0.28)" },
              { offset: 0.58, color: "rgba(201, 154, 61, 0.18)" },
              { offset: 1, color: "rgba(240, 238, 227, 0.04)" }
            ]
          }
        },
        markPoint: {
          symbol: "circle",
          symbolSize: 17,
          itemStyle: {
            borderColor: "#ffffff",
            borderWidth: 3
          },
          label: {
            color: "#17211b",
            fontFamily: POSTER_BODY_FONT_FAMILY,
            fontSize: 13,
            fontWeight: 900,
            formatter: ({ data: point }) => point.value
          },
          data: [
            createElevationMarkPoint(
              minSample,
              i18n.t("charts.minElevation"),
              "#6f8f4d",
              minLabelPosition,
              i18n
            ),
            createElevationMarkPoint(
              maxSample,
              i18n.t("charts.maxElevation"),
              "#b94a3a",
              maxLabelPosition,
              i18n
            )
          ]
        }
      }
    ]
  };
}

/**
 * @param {unknown} params
 * @param {ReturnType<typeof createI18n>} i18n
 */
function formatElevationTooltip(params, i18n) {
  const point = Array.isArray(params) ? params[0] : params;
  const data = point && typeof point === "object" && "data" in point ? point.data : undefined;
  const values = Array.isArray(data) ? data : [0, 0];
  const distanceKm = Number(values[0]);
  const elevation = Number.isFinite(values[1]) ? Number(values[1]) : null;
  const units = getFormatUnits(i18n);

  return `${i18n.t("charts.elevationTooltipDistance")} ${formatDistance(
    distanceKm * 1000,
    i18n.language,
    units
  )}<br/>${i18n.t("charts.elevationTooltipElevation")} ${formatElevation(
    elevation,
    i18n.language,
    units
  )}`;
}

/**
 * @param {ElevationChartSample[]} samples
 * @returns {[number, number | null][]}
 */
function buildElevationChartData(samples) {
  /** @type {[number, number | null][]} */
  const data = [];
  let previousRunId = normalizeRunId(samples[0]?.continuousRunId);

  for (const sample of samples) {
    const runId = normalizeRunId(sample.continuousRunId);
    const distanceKm = toDistanceKm(sample.distanceFromStartMeters);

    if (data.length > 0 && runId !== previousRunId) {
      data.push([distanceKm, null]);
    }

    data.push([distanceKm, sample.elevation]);
    previousRunId = runId;
  }

  return data;
}

/**
 * @param {unknown} value
 */
function normalizeRunId(value) {
  return Number.isInteger(value) ? Number(value) : null;
}

/**
 * @param {ElevationChartSample} sample
 * @param {string} name
 * @param {string} color
 * @param {"top" | "bottom" | "left" | "right"} labelPosition
 * @param {ReturnType<typeof createI18n>} i18n
 */
function createElevationMarkPoint(sample, name, color, labelPosition, i18n) {
  return {
    name,
    coord: [toDistanceKm(sample.distanceFromStartMeters), sample.elevation],
    value: formatElevation(sample.elevation, i18n.language, getFormatUnits(i18n)),
    itemStyle: {
      color
    },
    label: {
      position: labelPosition
    }
  };
}

/**
 * @param {ElevationChartSample} sample
 * @param {number} minDistanceKm
 * @param {number} maxDistanceKm
 * @param {"top" | "bottom" | "left" | "right"} fallbackPosition
 * @returns {"top" | "bottom" | "left" | "right"}
 */
function getExtremumLabelPosition(sample, minDistanceKm, maxDistanceKm, fallbackPosition) {
  const distanceKm = toDistanceKm(sample.distanceFromStartMeters);
  const distanceSpan = Math.max(0, maxDistanceKm - minDistanceKm);

  if (distanceSpan <= 1e-9) {
    return "right";
  }

  const edgeToleranceKm = distanceSpan * EXTREMUM_LABEL_EDGE_RESERVE_RATIO;

  if (distanceKm >= maxDistanceKm - edgeToleranceKm) {
    return "left";
  }

  if (distanceKm <= minDistanceKm + edgeToleranceKm) {
    return "right";
  }

  return fallbackPosition;
}

/**
 * @param {unknown} meters
 */
function toDistanceKm(meters) {
  return Number.isFinite(meters) ? Number(meters) / 1000 : 0;
}
