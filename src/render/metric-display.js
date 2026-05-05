import {
  formatDistanceMeters,
  formatDurationSeconds,
  formatElevationMeters,
  formatSpeedKmh,
  getFormatUnits
} from "../core/formatters.js";

/**
 * @typedef {"distance" | "movingTime" | "stoppedTime" | "totalTime" | "averageSpeed" | "movingSpeed" | "maxSpeed" | "gain" | "loss" | "minElevation" | "maxElevation" | "elevationRange"} MetricIconName
 */

/**
 * @typedef {"meters" | "seconds" | "kmh"} MetricUnit
 */

/**
 * @typedef {object} FormatUnits
 * @property {string} kilometer
 * @property {string} meter
 * @property {string} speed
 */

/**
 * @typedef {object} MetricDisplayI18n
 * @property {string} language
 * @property {(key: string, values?: Record<string, unknown>) => string} t
 */

/**
 * @typedef {object} MetricDefinition
 * @property {string} id
 * @property {MetricIconName} iconName
 * @property {string} labelKey
 * @property {MetricUnit} unit
 * @property {(value: number | null, language?: string, units?: FormatUnits) => string} formatter
 * @property {string[]} fields
 * @property {boolean} [hero]
 */

/**
 * @typedef {object} MetricDisplayItem
 * @property {string} id
 * @property {string} label
 * @property {MetricIconName} iconName
 * @property {number | null} rawValue
 * @property {MetricUnit} unit
 * @property {string} formattedValue
 * @property {boolean} hero
 */

/** @type {MetricDefinition[]} */
const METRICS = [
  {
    id: "distance",
    iconName: "distance",
    labelKey: "metrics.distance",
    unit: "meters",
    formatter: formatDistanceMeters,
    fields: ["distanceMeters", "totalDistanceMeters"],
    hero: true
  },
  {
    id: "moving-time",
    iconName: "movingTime",
    labelKey: "metrics.movingTime",
    unit: "seconds",
    formatter: formatDurationSeconds,
    fields: ["movingTimeSeconds", "movingDurationSeconds"],
    hero: true
  },
  {
    id: "stopped-time",
    iconName: "stoppedTime",
    labelKey: "metrics.stoppedTime",
    unit: "seconds",
    formatter: formatDurationSeconds,
    fields: ["stoppedTimeSeconds", "stoppedDurationSeconds"]
  },
  {
    id: "total-time",
    iconName: "totalTime",
    labelKey: "metrics.totalTime",
    unit: "seconds",
    formatter: formatDurationSeconds,
    fields: ["totalTimeSeconds", "totalDurationSeconds"]
  },
  {
    id: "average-speed",
    iconName: "averageSpeed",
    labelKey: "metrics.averageSpeed",
    unit: "kmh",
    formatter: formatSpeedKmh,
    fields: ["overallAverageSpeedKmh"]
  },
  {
    id: "moving-speed",
    iconName: "movingSpeed",
    labelKey: "metrics.movingSpeed",
    unit: "kmh",
    formatter: formatSpeedKmh,
    fields: ["movingAverageSpeedKmh", "averageSpeedKmh"]
  },
  {
    id: "max-speed",
    iconName: "maxSpeed",
    labelKey: "metrics.maxSpeed",
    unit: "kmh",
    formatter: formatSpeedKmh,
    fields: ["maxSpeedKmh"]
  },
  {
    id: "elevation-gain",
    iconName: "gain",
    labelKey: "metrics.elevationGain",
    unit: "meters",
    formatter: formatElevationMeters,
    fields: ["elevationGainMeters"],
    hero: true
  },
  {
    id: "elevation-loss",
    iconName: "loss",
    labelKey: "metrics.elevationLoss",
    unit: "meters",
    formatter: formatElevationMeters,
    fields: ["elevationLossMeters"]
  },
  {
    id: "min-elevation",
    iconName: "minElevation",
    labelKey: "metrics.minElevation",
    unit: "meters",
    formatter: formatElevationMeters,
    fields: ["minElevationMeters"]
  },
  {
    id: "max-elevation",
    iconName: "maxElevation",
    labelKey: "metrics.maxElevation",
    unit: "meters",
    formatter: formatElevationMeters,
    fields: ["maxElevationMeters"]
  },
  {
    id: "elevation-range",
    iconName: "elevationRange",
    labelKey: "metrics.elevationRange",
    unit: "meters",
    formatter: formatElevationMeters,
    fields: ["elevationRangeMeters"]
  }
];

/**
 * @param {Record<string, unknown>} analysis
 * @param {MetricDisplayI18n} i18n
 * @returns {MetricDisplayItem[]}
 */
export function getMetricDisplayItems(analysis, i18n) {
  const units = getFormatUnits(i18n);

  return METRICS.map(({ id, iconName, labelKey, unit, formatter, fields, hero = false }) => {
    const rawValue = getFirstValue(analysis, fields);

    return {
      id,
      label: i18n.t(labelKey),
      iconName,
      rawValue,
      unit,
      formattedValue: formatter(rawValue, i18n.language, units),
      hero
    };
  });
}

/**
 * @param {Record<string, unknown>} analysis
 * @param {string[]} fields
 * @returns {number | null}
 */
function getFirstValue(analysis, fields) {
  for (const field of fields) {
    const value = analysis[field];

    if (value !== undefined) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
  }

  return null;
}
