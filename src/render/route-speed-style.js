import { createRoutePointProgress } from "./route-map-data.js";

/** @typedef {import("../core/route-types.js").RouteGeometryPoint} RoutePoint */
/** @typedef {import("../core/route-types.js").RouteSpeedSample} RouteSpeedSample */

export const ROUTE_LINE_COLOR = "#c95b2e";

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
 * @param {RouteSpeedSample[]} speedSeries
 * @param {number} [routeDistanceMeters]
 */
export function createRouteSpeedColorProfile(speedSeries, routeDistanceMeters) {
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
export function createIndexedRouteSpeedGradient(points, speedSeries) {
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
export function createRouteSpeedColorScale(speedSeries) {
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
export function getRouteSpeedColor(speedKmh, lowSpeedKmh, highSpeedKmh) {
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
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {number} value
 */
function roundProgress(value) {
  return Math.round(clamp(value, 0, 1) * 1000000) / 1000000;
}
