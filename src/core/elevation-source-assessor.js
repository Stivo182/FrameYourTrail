import {
  ELEVATION_IMPLAUSIBLE_GRADE,
  ELEVATION_IMPLAUSIBLE_VERTICAL_SPEED_MPS
} from "./elevation-calibration-constants.js";
import {
  hasTimeGapElevationDiscontinuity,
  normalizeElevationSegmentIndex
} from "./elevation-continuity.js";
import { normalizeElevationSource } from "./elevation-source.js";
import { haversineMeters } from "./haversine.js";
import { nearestRankPercentile } from "./statistics.js";

const SOURCE_KEYS = ["barometric", "terrain", "gpx", "unknown"];
const DENSE_PAIR_MAX_DISTANCE_METERS = 80;
const CHATTER_GRADE = 0.18;

// Source trust values are calibrated weights, not probabilities. Keep the full
// table and rationale in docs/elevation-calibration.md#source-assessment.

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @param {TrackPoint[]} points
 * @param {{ timeGapBreakIndexes?: Set<number> }} [options]
 */
export function assessElevationSources(points, options = {}) {
  const grouped = groupElevationRunsBySource(points, options);
  const assessments = {
    barometric: assessSource("barometric", grouped.barometric),
    terrain: assessSource("terrain", grouped.terrain),
    gpx: assessSource("gpx", grouped.gpx),
    unknown: assessSource("unknown", grouped.unknown)
  };

  const primaryAbsoluteSource = choosePrimarySource(assessments, "absTrust");
  const primaryRelativeSource = choosePrimarySource(assessments, "relTrust");

  return {
    primaryAbsoluteSource,
    primaryRelativeSource,
    gpsRelTrust: assessments.gpx.relTrust,
    gpsAbsTrust: assessments.gpx.absTrust,
    baroRelTrust: assessments.barometric.relTrust,
    baroAbsTrust: assessments.barometric.absTrust,
    terrainRelTrust: assessments.terrain.relTrust,
    terrainAbsTrust: assessments.terrain.absTrust,
    unknownRelTrust: assessments.unknown.relTrust,
    unknownAbsTrust: assessments.unknown.absTrust,
    assessments
  };
}

/**
 * @typedef {{
 *   elevation: number,
 *   latitude: number,
 *   longitude: number,
 *   timestamp?: Date,
 *   sourceIndex: number,
 *   gappedFromPrevious: boolean,
 * }} SourceObservation
 */

/**
 * @typedef {{
 *   absDelta: number,
 *   distanceMeters: number,
 *   grade: number | null,
 *   verticalSpeedMps: number | null
 * }} SourcePairStats
 */

/**
 * @param {"barometric" | "terrain" | "gpx" | "unknown"} source
 * @param {SourceObservation[][]} runs
 */
function assessSource(source, runs) {
  const reasonCodes = [];
  const sampleCount = runs.reduce((total, run) => total + run.length, 0);
  if (sampleCount < 2) {
    reasonCodes.push("insufficient_samples");
    return {
      source,
      absTrust: 0,
      relTrust: 0,
      sampleCount,
      continuousPairCount: 0,
      reasonCodes,
      ...emptyNoiseStats()
    };
  }

  const pairStats = collectPairStats(runs);
  const deltas = pairStats.map((pair) => pair.absDelta);
  const continuousPairCount = pairStats.length;
  if (continuousPairCount < 1) {
    reasonCodes.push("insufficient_continuous_pairs");
    return {
      source,
      absTrust: 0,
      relTrust: 0,
      sampleCount,
      continuousPairCount,
      reasonCodes,
      ...emptyNoiseStats()
    };
  }

  const p75 = nearestRankPercentile(deltas, 0.75) ?? 0;
  const p95 = nearestRankPercentile(deltas, 0.95) ?? 0;
  const range = collectRunRanges(runs).reduce((total, value) => total + value, 0);
  const rawChange = deltas.reduce((total, value) => total + value, 0);
  const changeToRangeRatio =
    range > 0 ? rawChange / range : rawChange > 0 ? Number.POSITIVE_INFINITY : 0;
  const sampleDistances = pairStats
    .map((pair) => pair.distanceMeters)
    .filter((distance) => Number.isFinite(distance) && distance > 0);
  const grades = pairStats.map((pair) => pair.grade).filter(isFiniteNumber);
  const verticalSpeeds = pairStats.map((pair) => pair.verticalSpeedMps).filter(isFiniteNumber);
  const medianSampleDistanceMeters = nearestRankPercentile(sampleDistances, 0.5);
  const p95Grade = nearestRankPercentile(grades, 0.95);
  const p95VerticalSpeedMps = nearestRankPercentile(verticalSpeeds, 0.95);
  const driftPossible = source === "barometric" && hasSlowBarometricTrend(runs);
  const lowReliefChatter =
    source === "barometric" && range > 0 && range <= 1 && changeToRangeRatio >= 8;
  // These cutoffs identify vertical chatter that can explode naive gain/loss.
  // Large sparse deltas are not noise by themselves; they need implausible
  // grade/speed context or dense point-to-point chatter.
  const medianDistanceMeters = medianSampleDistanceMeters ?? 0;
  const denseRecording =
    medianDistanceMeters > 0 ? medianDistanceMeters <= DENSE_PAIR_MAX_DISTANCE_METERS : true;
  const implausibleVerticalPairs = pairStats.some(
    (pair) =>
      pair.absDelta >= 8 &&
      ((pair.grade !== null && pair.grade >= ELEVATION_IMPLAUSIBLE_GRADE) ||
        (pair.verticalSpeedMps !== null &&
          pair.verticalSpeedMps >= ELEVATION_IMPLAUSIBLE_VERTICAL_SPEED_MPS))
  );
  const denseChatter =
    denseRecording &&
    (p75 >= 2 || p95 >= 8) &&
    ((p95Grade ?? 0) >= CHATTER_GRADE || (p95VerticalSpeedMps ?? 0) >= 0.5);
  const highChangeRatioNoise =
    source !== "barometric" &&
    changeToRangeRatio >= 12 &&
    (denseRecording || (p95Grade ?? 0) >= CHATTER_GRADE);
  const noisy = implausibleVerticalPairs || denseChatter || highChangeRatioNoise;
  const barometricSpikes = source === "barometric" && hasBarometricSpikeRun(runs);
  const noiseStats = {
    p75DeltaMeters: p75,
    p95DeltaMeters: p95,
    rawChangeToRangeRatio: changeToRangeRatio,
    medianSampleDistanceMeters,
    p95Grade,
    p95VerticalSpeedMps
  };

  if (source === "barometric") {
    reasonCodes.push("barometric_relative_signal");
    if (driftPossible) {
      reasonCodes.push("barometric_absolute_drift_possible");
    }
    if (lowReliefChatter) {
      reasonCodes.push("barometric_low_relief_chatter");
    }
    if (barometricSpikes) {
      reasonCodes.push("barometric_vertical_spikes");
    }
    return {
      source,
      absTrust: clamp(noisy || driftPossible || lowReliefChatter ? 0.35 : 0.55),
      relTrust: clamp(barometricSpikes ? 0.55 : 0.9),
      sampleCount,
      continuousPairCount,
      reasonCodes,
      ...noiseStats
    };
  }

  if (source === "terrain") {
    reasonCodes.push("terrain_absolute_anchor");
    return {
      source,
      absTrust: 0.78,
      relTrust: noisy ? 0.25 : 0.45,
      sampleCount,
      continuousPairCount,
      reasonCodes,
      ...noiseStats
    };
  }

  if (source === "gpx") {
    if (noisy) {
      reasonCodes.push("gps_vertical_noise");
    } else {
      reasonCodes.push("gps_low_noise");
    }
    return {
      source,
      absTrust: noisy ? 0.35 : 0.55,
      relTrust: noisy ? 0.25 : 0.6,
      sampleCount,
      continuousPairCount,
      reasonCodes,
      ...noiseStats
    };
  }

  reasonCodes.push(noisy ? "unknown_vertical_noise" : "unknown_low_noise");
  return {
    source,
    absTrust: noisy ? 0.25 : 0.45,
    relTrust: noisy ? 0.2 : 0.5,
    sampleCount,
    continuousPairCount,
    reasonCodes,
    ...noiseStats
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {{ timeGapBreakIndexes?: Set<number> }} options
 */
function groupElevationRunsBySource(points, options) {
  /** @type {Record<"barometric" | "terrain" | "gpx" | "unknown", SourceObservation[][]>} */
  const grouped = {
    barometric: [],
    terrain: [],
    gpx: [],
    unknown: []
  };
  /** @type {"barometric" | "terrain" | "gpx" | "unknown" | null} */
  let previousSource = null;
  /** @type {number | null} */
  let previousSegmentIndex = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (
      index > 0 &&
      hasTimeGapElevationDiscontinuity(index, options.timeGapBreakIndexes, points[index - 1], point)
    ) {
      previousSource = null;
      previousSegmentIndex = null;
    }

    if (!Number.isFinite(point.elevation)) {
      previousSource = null;
      previousSegmentIndex = null;
      continue;
    }
    const source = normalizeElevationSource(point.elevationSource);
    const segmentIndex = normalizeElevationSegmentIndex(point.segmentIndex);
    const currentRuns = grouped[source];
    if (
      source !== previousSource ||
      segmentIndex !== previousSegmentIndex ||
      currentRuns.length === 0
    ) {
      currentRuns.push([]);
    }
    currentRuns[currentRuns.length - 1].push({
      elevation: Number(point.elevation),
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      timestamp: point.timestamp instanceof Date ? point.timestamp : undefined,
      sourceIndex: index,
      gappedFromPrevious: options.timeGapBreakIndexes?.has(index) === true
    });
    previousSource = source;
    previousSegmentIndex = segmentIndex;
  }
  return grouped;
}

/**
 * @param {Record<string, { absTrust: number, relTrust: number }>} assessments
 * @param {"absTrust" | "relTrust"} key
 */
function choosePrimarySource(assessments, key) {
  let bestSource = "unknown";
  let bestTrust = 0;
  for (const source of SOURCE_KEYS) {
    const trust = assessments[source][key];
    if (trust > bestTrust) {
      bestTrust = trust;
      bestSource = source;
    }
  }
  return bestTrust > 0 ? bestSource : null;
}

/**
 * @param {SourceObservation[][]} runs
 */
function collectPairStats(runs) {
  /** @type {SourcePairStats[]} */
  const pairs = [];
  for (const run of runs) {
    for (let index = 1; index < run.length; index += 1) {
      const previous = run[index - 1];
      const current = run[index];
      if (current.gappedFromPrevious) {
        continue;
      }
      const absDelta = Math.abs(current.elevation - previous.elevation);
      const distanceMeters = haversineMeters(previous, current);
      const grade = distanceMeters > 0 ? absDelta / distanceMeters : null;
      const durationSeconds =
        previous.timestamp instanceof Date && current.timestamp instanceof Date
          ? (current.timestamp.valueOf() - previous.timestamp.valueOf()) / 1000
          : null;
      const verticalSpeedMps =
        durationSeconds !== null && durationSeconds > 0 ? absDelta / durationSeconds : null;
      pairs.push({ absDelta, distanceMeters, grade, verticalSpeedMps });
    }
  }
  return pairs;
}

/**
 * @param {SourceObservation[][]} runs
 */
function collectRunRanges(runs) {
  return runs.map((run) => {
    if (!run.length) {
      return 0;
    }
    const elevations = run.map((observation) => observation.elevation);
    return Math.max(...elevations) - Math.min(...elevations);
  });
}

/**
 * @param {SourceObservation[][]} runs
 */
function hasSlowBarometricTrend(runs) {
  return runs.some((run) => {
    if (run.length < 4) {
      return false;
    }
    const deltas = collectPairStats([run]).map((pair) => pair.absDelta);
    const rawChange = deltas.reduce((total, value) => total + value, 0);
    const elevations = run.map((observation) => observation.elevation);
    const range = Math.max(...elevations) - Math.min(...elevations);
    const netChange = Math.abs(run[run.length - 1].elevation - run[0].elevation);
    const directionalConsistency = rawChange > 0 ? netChange / rawChange : 0;
    const p95 = nearestRankPercentile(deltas, 0.95) ?? 0;
    return range >= 8 && p95 < 2 && directionalConsistency >= 0.85;
  });
}

/**
 * @param {SourceObservation[][]} runs
 */
function hasBarometricSpikeRun(runs) {
  return runs.some((run) => {
    const deltas = collectPairStats([run]).map((pair) => pair.absDelta);
    const p75 = nearestRankPercentile(deltas, 0.75) ?? 0;
    const p95 = nearestRankPercentile(deltas, 0.95) ?? 0;
    return p75 >= 2 || p95 >= 8;
  });
}

function emptyNoiseStats() {
  return {
    p75DeltaMeters: null,
    p95DeltaMeters: null,
    rawChangeToRangeRatio: null,
    medianSampleDistanceMeters: null,
    p95Grade: null,
    p95VerticalSpeedMps: null
  };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return Number.isFinite(value);
}

/**
 * @param {number} value
 */
function clamp(value) {
  return Math.max(0, Math.min(1, value));
}
