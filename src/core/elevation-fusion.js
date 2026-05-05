import {
  ELEVATION_IMPLAUSIBLE_GRADE,
  ELEVATION_IMPLAUSIBLE_VERTICAL_SPEED_MPS,
  TIME_GAP_ELEVATION_DISCONTINUITY_METERS
} from "./elevation-calibration-constants.js";
import {
  hasTimeGapElevationDiscontinuity,
  normalizeFiniteElevationSegmentIndex
} from "./elevation-continuity.js";
import { hasElevationSourceSwitch } from "./elevation-source.js";
import { groupContiguousIndexes, isUnsupportedSparseTailGroup } from "./elevation-tail-support.js";
import { haversineMeters } from "./haversine.js";
import { interpolatedPercentile, lowerRankMedian } from "./statistics.js";

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 * @typedef {{ point: TrackPoint, sourceIndex: number, routeDistanceMeters: number, displayDistanceMeters: number }} ElevationObservation
 * @typedef {{ start: number, end: number, continuousRunId: number }} SampleRange
 * @typedef {{
 *   distanceMeters: number,
 *   displayDistanceMeters?: number,
 *   latitude: number,
 *   longitude: number,
 *   elevation: number,
 *   elevationSource: string,
 *   sourceIndex: number,
 *   continuousRunId: number
 * }} ElevationSample
 */

// Robust cleanup constants. Full calibration notes:
// docs/elevation-calibration.md#fusion-and-cleanup.
const HAMPEL_ABSOLUTE_THRESHOLD_METERS = 12;
const HAMPEL_LOW_RELIEF_SPIKE_FLOOR_METERS = 4;
const HAMPEL_LOW_RELIEF_RANGE_FACTOR = 0.15;
const OBSERVATION_ENDPOINT_SPIKE_MIN_DEVIATION_METERS = 50;

// Sparse-tail cleanup removes tiny unsupported low/high basins before distance
// resampling can turn them into visible extrema.
const SPARSE_LOW_TAIL_MIN_RUN_OBSERVATIONS = 80;

// Lower-tail seeds must be actual below-sea-level lows; nearby low shoulders are
// expanded only on low-altitude runs so valid short positive regimes around 2 m
// stay visible.
const SPARSE_LOW_TAIL_MIN_SEPARATION_METERS = 20;
const SPARSE_LOW_TAIL_MAX_SEED_ELEVATION_METERS = 0;
const SPARSE_LOW_TAIL_RIM_PERCENTILE = 0.12;
const SPARSE_LOW_TAIL_BASIN_EXPANSION_MAX_LOWER_DECILE_METERS = 25;

// Upper-tail cleanup is boundary-only later in the pipeline: it targets short
// high settling caps after run splits while preserving plausible high starts.
const SPARSE_HIGH_TAIL_REFERENCE_PERCENTILE = 0.85;
const SPARSE_HIGH_TAIL_RIM_PERCENTILE = 0.9;
const SPARSE_HIGH_TAIL_MIN_SEPARATION_METERS = 20;

// Sparse-tail replacement anchors can themselves be unstable immediately after
// a long recording gap. Skip such anchors only when a compact lookahead settles
// by an implausible grade or vertical speed, so real sparse terrain boundaries
// remain available as anchors.
const SPARSE_TAIL_SETTLING_MIN_TIME_GAP_SECONDS = 30 * 60;
const SPARSE_TAIL_SETTLING_LOOKAHEAD_SAMPLES = 6;
const SPARSE_TAIL_SETTLING_STABLE_WINDOW_SAMPLES = 3;
const SPARSE_TAIL_SETTLING_MIN_VERTICAL_CHANGE_METERS = 6;
const SPARSE_TAIL_SETTLING_MIN_FIRST_STEP_METERS = 2;
const SPARSE_TAIL_SETTLING_STABLE_TOLERANCE_METERS = 2.5;
export const MAD_TO_SIGMA_SCALE = 1.4826;

/**
 * @param {TrackPoint[]} points
 * @param {{ stepMeters: number, distanceFromStartMeters?: number[], timeGapBreakIndexes?: Set<number> }} options
 */
export function resampleElevationRunToDistanceGrid(points, options) {
  return resampleContinuousElevationRuns(points, options).samples;
}

/**
 * @param {TrackPoint[]} points
 * @param {{
 *   activityDefaults: { resampleStepMeters: number },
 *   sourceAssessment: { primaryAbsoluteSource: string | null, primaryRelativeSource: string | null },
 *   distanceFromStartMeters?: number[],
 *   timeGapBreakIndexes?: Set<number>
 * }} options
 */
export function buildFusedElevationProfile(points, options) {
  const rawElevations = points
    .filter((point) => Number.isFinite(point.elevation))
    .map((point) => Number(point.elevation));
  const rawExtrema = getExtrema(rawElevations);
  const {
    samples,
    runRanges,
    preResampleEndpointReplacements,
    preResampleInteriorReplacements,
    preResampleSparseTailReplacements
  } = resampleContinuousElevationRuns(points, {
    stepMeters: options.activityDefaults.resampleStepMeters,
    distanceFromStartMeters: options.distanceFromStartMeters,
    timeGapBreakIndexes: options.timeGapBreakIndexes
  });
  const hampelCleanedElevations = replaceHampelOutliers(
    samples.map((sample) => sample.elevation),
    runRanges
  );
  const cleanedElevations = replaceEndpointSpikes(
    hampelCleanedElevations.values,
    runRanges,
    samples
  );
  // Terrain is a slow absolute anchor here, not a high-frequency relative signal.
  const smoothingRadius =
    options.sourceAssessment.primaryAbsoluteSource === "terrain" ||
    options.sourceAssessment.primaryRelativeSource === "terrain"
      ? 2
      : 1;
  const sigmaAfterCleanupMeters = estimateRunSigmas(cleanedElevations.values, runRanges);
  const fusedElevations = smoothRuns(cleanedElevations.values, smoothingRadius, runRanges);
  const sigmaRelMeters = estimateRunSigmas(fusedElevations, runRanges);
  const noise = summarizeFusionNoise(sigmaAfterCleanupMeters, sigmaRelMeters);
  const fusedSamples = samples.map((sample, index) => ({
    ...sample,
    elevation: fusedElevations[index],
    sigmaRelMeters: sigmaRelMeters[index] ?? 0
  }));
  const filteredExtrema = getExtrema(fusedElevations);
  const sourceSwitchCount = countSourceSwitches(samples);
  const flags = ["filtered_extrema_used"];

  if (hampelCleanedElevations.outlierCount > 0) {
    flags.push("hampel_outliers_replaced");
  }
  const endpointSpikeReplacementCount =
    preResampleEndpointReplacements.length + cleanedElevations.replacements.length;
  if (endpointSpikeReplacementCount > 0) {
    flags.push("endpoint_spikes_replaced");
  }
  if (preResampleInteriorReplacements.length > 0) {
    flags.push("pre_resample_interior_outliers_replaced");
  }
  if (preResampleSparseTailReplacements.length > 0) {
    flags.push("pre_resample_sparse_tail_replaced");
  }
  const rawPreResampleReplacementCount =
    preResampleEndpointReplacements.length +
    preResampleInteriorReplacements.length +
    preResampleSparseTailReplacements.length;
  const resampledReplacementCount =
    hampelCleanedElevations.outlierCount + cleanedElevations.outlierCount;
  const cleanupOpportunityCount = rawElevations.length + samples.length;

  return {
    method: "distance_domain_filtered_profile",
    samples: fusedSamples,
    runRanges,
    rawExtrema,
    filteredExtrema,
    sourceSwitchCount,
    noise,
    outliersRemovedPct:
      cleanupOpportunityCount > 0
        ? ((rawPreResampleReplacementCount + resampledReplacementCount) / cleanupOpportunityCount) *
          100
        : 0,
    endpointSpikeReplacementCount,
    preResampleEndpointSpikeReplacementCount: preResampleEndpointReplacements.length,
    postResampleEndpointSpikeReplacementCount: cleanedElevations.replacements.length,
    endpointSpikeReplacementSourceIndexes: [
      ...preResampleEndpointReplacements.map((replacement) => replacement.sourceIndex),
      ...cleanedElevations.replacements.map((replacement) => replacement.sourceIndex)
    ],
    preResampleInteriorOutlierReplacementCount: preResampleInteriorReplacements.length,
    preResampleInteriorOutlierReplacementSourceIndexes: preResampleInteriorReplacements.map(
      (replacement) => replacement.sourceIndex
    ),
    preResampleSparseTailReplacementCount: preResampleSparseTailReplacements.length,
    preResampleSparseTailReplacementSourceIndexes: preResampleSparseTailReplacements.map(
      (replacement) => replacement.sourceIndex
    ),
    flags
  };
}

/**
 * @param {number[]} sigmaAfterCleanupMeters
 * @param {number[]} sigmaAfterSmoothingMeters
 */
function summarizeFusionNoise(sigmaAfterCleanupMeters, sigmaAfterSmoothingMeters) {
  return {
    medianSigmaAfterCleanupMeters: interpolatedPercentile(sigmaAfterCleanupMeters, 0.5) ?? 0,
    p95SigmaAfterCleanupMeters: interpolatedPercentile(sigmaAfterCleanupMeters, 0.95) ?? 0,
    medianSigmaAfterSmoothingMeters: interpolatedPercentile(sigmaAfterSmoothingMeters, 0.5) ?? 0,
    p95SigmaAfterSmoothingMeters: interpolatedPercentile(sigmaAfterSmoothingMeters, 0.95) ?? 0
  };
}

/**
 * @param {ElevationSample[]} samples
 */
function countSourceSwitches(samples) {
  let switchCount = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (hasElevationSourceSwitch(samples[index - 1], samples[index])) {
      switchCount += 1;
    }
  }
  return switchCount;
}

/**
 * @param {TrackPoint[]} points
 * @param {{ stepMeters: number, distanceFromStartMeters?: number[], timeGapBreakIndexes?: Set<number> }} options
 * @returns {{ samples: ElevationSample[], runRanges: SampleRange[], preResampleEndpointReplacements: ElevationReplacement[], preResampleInteriorReplacements: ElevationReplacement[], preResampleSparseTailReplacements: ElevationReplacement[] }}
 */
function resampleContinuousElevationRuns(points, options) {
  const runs = collectContinuousElevationRuns(
    points,
    options.distanceFromStartMeters,
    options.timeGapBreakIndexes
  );
  if (!runs.length) {
    return {
      samples: [],
      runRanges: [],
      preResampleEndpointReplacements: [],
      preResampleInteriorReplacements: [],
      preResampleSparseTailReplacements: []
    };
  }

  const stepMeters = Math.max(1, options.stepMeters);
  const samples = [];
  const runRanges = [];
  /** @type {ElevationReplacement[]} */
  const preResampleEndpointReplacements = [];
  /** @type {ElevationReplacement[]} */
  const preResampleInteriorReplacements = [];
  /** @type {ElevationReplacement[]} */
  const preResampleSparseTailReplacements = [];

  for (const run of runs) {
    const start = samples.length;
    const continuousRunId = runRanges.length;
    const cleanedRun = replacePreResampleObservationOutliers(run);
    preResampleEndpointReplacements.push(
      ...cleanedRun.replacements.filter(
        (replacement) => replacement.endpoint === "first" || replacement.endpoint === "last"
      )
    );
    preResampleInteriorReplacements.push(
      ...cleanedRun.replacements.filter((replacement) => replacement.endpoint === "interior")
    );
    preResampleSparseTailReplacements.push(
      ...cleanedRun.replacements.filter((replacement) => replacement.endpoint === "sparse_tail")
    );
    const runSamples = resampleObservationRunToDistanceGrid(
      cleanedRun.observations,
      stepMeters
    ).map((sample) => ({
      ...sample,
      continuousRunId
    }));
    samples.push(...runSamples);
    const end = samples.length;

    if (end > start) {
      runRanges.push({ start, end, continuousRunId });
    }
  }

  return {
    samples,
    runRanges,
    preResampleEndpointReplacements,
    preResampleInteriorReplacements,
    preResampleSparseTailReplacements
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {number[] | undefined} distanceFromStartMeters
 * @param {Set<number> | undefined} timeGapBreakIndexes
 * @returns {ElevationObservation[][]}
 */
function collectContinuousElevationRuns(points, distanceFromStartMeters, timeGapBreakIndexes) {
  const runs = [];
  let run = [];
  let routeDistanceMeters = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];

    if (index > 0 && hasRouteContinuity(points[index - 1], point)) {
      routeDistanceMeters += haversineMeters(points[index - 1], point);
    }

    if (!Number.isFinite(point.elevation)) {
      if (run.length) {
        runs.push(run);
        run = [];
      }
      continue;
    }

    const observation = {
      point,
      sourceIndex: index,
      routeDistanceMeters,
      displayDistanceMeters:
        getProvidedDistanceMeters(distanceFromStartMeters, index) ?? routeDistanceMeters
    };
    const previous = run[run.length - 1];
    if (
      previous &&
      (hasContinuityBreak(previous.point, point) ||
        hasTimeGapElevationDiscontinuity(index, timeGapBreakIndexes, previous.point, point))
    ) {
      runs.push(run);
      run = [];
    }

    run.push(observation);
  }

  if (run.length) {
    runs.push(run);
  }

  return runs;
}

/**
 * @param {number[] | undefined} distanceFromStartMeters
 * @param {number} index
 */
function getProvidedDistanceMeters(distanceFromStartMeters, index) {
  const value = distanceFromStartMeters?.[index];
  return Number.isFinite(value) ? Number(value) : null;
}

/**
 * @typedef {{ phase: "pre_resample" | "post_resample", endpoint: "first" | "last" | "interior" | "sparse_tail", sourceIndex: number, sampleIndex?: number }} ElevationReplacement
 */

/**
 * @param {ElevationObservation[]} observations
 * @returns {{ observations: ElevationObservation[], outlierCount: number, replacements: ElevationReplacement[] }}
 */
function replacePreResampleObservationOutliers(observations) {
  if (observations.length < 3) {
    return { observations, outlierCount: 0, replacements: [] };
  }

  const elevations = observations.map((observation) => Number(observation.point.elevation));
  const spikeFloor = getHampelSpikeFloor(elevations, {
    start: 0,
    end: elevations.length,
    continuousRunId: 0
  });
  const firstReplacement = getObservationEndpointReplacement(observations, 0, spikeFloor);
  const lastIndex = elevations.length - 1;
  const lastReplacement = getObservationEndpointReplacement(observations, lastIndex, spikeFloor);
  const interiorReplacements = getObservationInteriorReplacements(observations, spikeFloor);

  const output = [...observations];
  let outlierCount = 0;
  /** @type {ElevationReplacement[]} */
  const replacements = [];

  if (firstReplacement !== null) {
    output[0] = replaceObservationElevation(output[0], firstReplacement);
    outlierCount += 1;
    replacements.push({
      phase: "pre_resample",
      endpoint: "first",
      sourceIndex: observations[0].sourceIndex
    });
  }

  if (lastReplacement !== null) {
    output[lastIndex] = replaceObservationElevation(output[lastIndex], lastReplacement);
    outlierCount += 1;
    replacements.push({
      phase: "pre_resample",
      endpoint: "last",
      sourceIndex: observations[lastIndex].sourceIndex
    });
  }

  for (const replacement of interiorReplacements) {
    output[replacement.index] = replaceObservationElevation(
      output[replacement.index],
      replacement.elevation
    );
    outlierCount += 1;
    replacements.push({
      phase: "pre_resample",
      endpoint: "interior",
      sourceIndex: observations[replacement.index].sourceIndex
    });
  }

  const sparseTailReplacements = [
    ...getObservationSparseLowerTailReplacements(output),
    ...getObservationSparseUpperTailReplacements(output)
  ].sort((left, right) => left.index - right.index);
  const uniqueSparseTailReplacements = uniqueReplacementsByIndex(sparseTailReplacements);

  for (const replacement of uniqueSparseTailReplacements) {
    output[replacement.index] = replaceObservationElevation(
      output[replacement.index],
      replacement.elevation
    );
    outlierCount += 1;
    replacements.push({
      phase: "pre_resample",
      endpoint: "sparse_tail",
      sourceIndex: observations[replacement.index].sourceIndex
    });
  }

  if (outlierCount === 0) {
    return { observations, outlierCount: 0, replacements: [] };
  }

  return { observations: output, outlierCount, replacements };
}

/**
 * @param {{ index: number, elevation: number }[]} replacements
 */
function uniqueReplacementsByIndex(replacements) {
  const replacementByIndex = new Map();
  for (const replacement of replacements) {
    replacementByIndex.set(replacement.index, replacement);
  }

  return [...replacementByIndex.values()].sort((left, right) => left.index - right.index);
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} spikeFloor
 * @returns {{ index: number, elevation: number }[]}
 */
function getObservationInteriorReplacements(observations, spikeFloor) {
  const replacements = [];
  if (observations.length < 5) {
    return replacements;
  }

  const threshold = Math.max(
    TIME_GAP_ELEVATION_DISCONTINUITY_METERS,
    getConservativeObservationEndpointThreshold(spikeFloor)
  );

  for (let index = 2; index < observations.length - 2; index += 1) {
    const leftWindow = observations
      .slice(index - 2, index)
      .map((observation) => Number(observation.point.elevation));
    const rightWindow = observations
      .slice(index + 1, index + 3)
      .map((observation) => Number(observation.point.elevation));
    const stableElevations = [...leftWindow, ...rightWindow];
    const neighborVariation = Math.abs(
      Number(observations[index - 1].point.elevation) -
        Number(observations[index + 1].point.elevation)
    );

    if (getRange(stableElevations) > Math.max(1, neighborVariation)) {
      continue;
    }

    const stableEstimate = lowerRankMedian(stableElevations) ?? 0;
    const elevation = Number(observations[index].point.elevation);
    const deviation = Math.abs(elevation - stableEstimate);
    const leftJump = Math.abs(elevation - Number(observations[index - 1].point.elevation));
    const rightJump = Math.abs(elevation - Number(observations[index + 1].point.elevation));

    if (
      deviation > threshold &&
      leftJump > threshold &&
      rightJump > threshold &&
      deviation > neighborVariation * 4
    ) {
      replacements.push({ index, elevation: stableEstimate });
    }
  }

  return replacements;
}

/**
 * @param {ElevationObservation[]} observations
 * @returns {{ index: number, elevation: number }[]}
 */
function getObservationSparseLowerTailReplacements(observations) {
  if (observations.length < SPARSE_LOW_TAIL_MIN_RUN_OBSERVATIONS) {
    return [];
  }
  const elevations = observations.map((observation) => Number(observation.point.elevation));
  const lowerDecile = interpolatedPercentile(elevations, 0.1);
  const sparseTailReference = interpolatedPercentile(elevations, 0.15);
  const supportedLowerRim = interpolatedPercentile(elevations, SPARSE_LOW_TAIL_RIM_PERCENTILE);
  if (lowerDecile === null || sparseTailReference === null || supportedLowerRim === null) {
    return [];
  }

  const tailThreshold = sparseTailReference - SPARSE_LOW_TAIL_MIN_SEPARATION_METERS;
  const seedCandidateIndexes = elevations
    .map((elevation, index) =>
      elevation < tailThreshold && elevation < SPARSE_LOW_TAIL_MAX_SEED_ELEVATION_METERS
        ? index
        : -1
    )
    .filter((index) => index >= 0);

  if (seedCandidateIndexes.length === 0) {
    return [];
  }

  const replacementCandidateIndexes = getSparseLowerTailReplacementCandidateIndexes(
    observations,
    elevations,
    seedCandidateIndexes,
    supportedLowerRim,
    lowerDecile <= SPARSE_LOW_TAIL_BASIN_EXPANSION_MAX_LOWER_DECILE_METERS
  );

  if (replacementCandidateIndexes.length === 0) {
    return [];
  }

  const candidateSet = new Set(replacementCandidateIndexes);
  const replacements = [
    ...replacementCandidateIndexes
      .map((index) => getSparseTailReplacement(observations, index, candidateSet))
      .filter((replacement) => replacement !== null),
    ...getSparseTailSettlingAnchorReplacements(observations, replacementCandidateIndexes)
  ];

  return replacements;
}

/**
 * @param {ElevationObservation[]} observations
 * @returns {{ index: number, elevation: number }[]}
 */
function getObservationSparseUpperTailReplacements(observations) {
  if (observations.length < SPARSE_LOW_TAIL_MIN_RUN_OBSERVATIONS) {
    return [];
  }
  const elevations = observations.map((observation) => Number(observation.point.elevation));
  const sparseTailReference = interpolatedPercentile(
    elevations,
    SPARSE_HIGH_TAIL_REFERENCE_PERCENTILE
  );
  const supportedUpperRim = interpolatedPercentile(elevations, SPARSE_HIGH_TAIL_RIM_PERCENTILE);
  if (sparseTailReference === null || supportedUpperRim === null) {
    return [];
  }

  const tailThreshold = sparseTailReference + SPARSE_HIGH_TAIL_MIN_SEPARATION_METERS;
  const seedCandidateIndexes = elevations
    .map((elevation, index) => (elevation > tailThreshold ? index : -1))
    .filter((index) => index >= 0);

  if (seedCandidateIndexes.length === 0) {
    return [];
  }

  const replacementCandidateIndexes = getSparseUpperTailReplacementCandidateIndexes(
    observations,
    elevations,
    seedCandidateIndexes,
    supportedUpperRim
  );

  if (replacementCandidateIndexes.length === 0) {
    return [];
  }

  const candidateSet = new Set(replacementCandidateIndexes);
  const replacements = [
    ...replacementCandidateIndexes
      .map((index) => getSparseTailReplacement(observations, index, candidateSet))
      .filter((replacement) => replacement !== null),
    ...getSparseTailSettlingAnchorReplacements(observations, replacementCandidateIndexes)
  ];

  return replacements;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number[]} elevations
 * @param {number[]} seedCandidateIndexes
 * @param {number} supportedLowerRim
 * @param {boolean} shouldExpandBasins
 */
function getSparseLowerTailReplacementCandidateIndexes(
  observations,
  elevations,
  seedCandidateIndexes,
  supportedLowerRim,
  shouldExpandBasins
) {
  const replacementCandidateIndexes = new Set();
  const seedGroups = groupContiguousIndexes(seedCandidateIndexes);

  for (const group of seedGroups) {
    const expandedCandidateIndexes = shouldExpandBasins
      ? expandSparseLowerTailCandidateIndexes(elevations, group, supportedLowerRim)
      : group;
    const supportedCandidateIndexes = removePlausibleBoundarySparseTailCandidateIndexes(
      observations,
      expandedCandidateIndexes
    );

    if (isUnsupportedSparseTailGroup(observations, supportedCandidateIndexes)) {
      supportedCandidateIndexes.forEach((index) => replacementCandidateIndexes.add(index));
      continue;
    }

    if (shouldExpandBasins) {
      // A broad positive low shoulder can be real; the below-sea seed core can still be noise.
      const seedOnlyCandidateIndexes = removePlausibleBoundarySparseTailCandidateIndexes(
        observations,
        group
      );
      if (isUnsupportedSparseTailGroup(observations, seedOnlyCandidateIndexes)) {
        seedOnlyCandidateIndexes.forEach((index) => replacementCandidateIndexes.add(index));
      }
    }
  }

  return [...replacementCandidateIndexes].sort((left, right) => left - right);
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number[]} elevations
 * @param {number[]} seedCandidateIndexes
 * @param {number} supportedUpperRim
 */
function getSparseUpperTailReplacementCandidateIndexes(
  observations,
  elevations,
  seedCandidateIndexes,
  supportedUpperRim
) {
  const replacementCandidateIndexes = new Set();
  const expandedCandidateIndexes = new Set();

  for (const group of groupContiguousIndexes(seedCandidateIndexes)) {
    expandSparseUpperTailCandidateIndexes(elevations, group, supportedUpperRim).forEach((index) =>
      expandedCandidateIndexes.add(index)
    );
  }

  const expandedGroups = groupContiguousIndexes(
    [...expandedCandidateIndexes].sort((left, right) => left - right)
  );

  for (const group of expandedGroups) {
    if (group[0] !== 0 && group[group.length - 1] !== observations.length - 1) {
      continue;
    }

    const supportedCandidateIndexes = removePlausibleBoundarySparseTailCandidateIndexes(
      observations,
      group
    );

    if (isUnsupportedSparseTailGroup(observations, supportedCandidateIndexes)) {
      supportedCandidateIndexes.forEach((index) => replacementCandidateIndexes.add(index));
    }
  }

  return [...replacementCandidateIndexes].sort((left, right) => left - right);
}

/**
 * @param {number[]} elevations
 * @param {number[]} seedCandidateIndexes
 * @param {number} supportedLowerRim
 */
function expandSparseLowerTailCandidateIndexes(
  elevations,
  seedCandidateIndexes,
  supportedLowerRim
) {
  const candidateIndexes = new Set(seedCandidateIndexes);

  for (const group of groupContiguousIndexes(seedCandidateIndexes)) {
    for (
      let index = group[0] - 1;
      index >= 0 && elevations[index] < supportedLowerRim;
      index -= 1
    ) {
      candidateIndexes.add(index);
    }

    for (
      let index = group[group.length - 1] + 1;
      index < elevations.length && elevations[index] < supportedLowerRim;
      index += 1
    ) {
      candidateIndexes.add(index);
    }
  }

  return [...candidateIndexes].sort((left, right) => left - right);
}

/**
 * @param {number[]} elevations
 * @param {number[]} seedCandidateIndexes
 * @param {number} supportedUpperRim
 */
function expandSparseUpperTailCandidateIndexes(
  elevations,
  seedCandidateIndexes,
  supportedUpperRim
) {
  const candidateIndexes = new Set(seedCandidateIndexes);

  for (const group of groupContiguousIndexes(seedCandidateIndexes)) {
    for (
      let index = group[0] - 1;
      index >= 0 && elevations[index] > supportedUpperRim;
      index -= 1
    ) {
      candidateIndexes.add(index);
    }

    for (
      let index = group[group.length - 1] + 1;
      index < elevations.length && elevations[index] > supportedUpperRim;
      index += 1
    ) {
      candidateIndexes.add(index);
    }
  }

  return [...candidateIndexes].sort((left, right) => left - right);
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number[]} candidateIndexes
 */
function removePlausibleBoundarySparseTailCandidateIndexes(observations, candidateIndexes) {
  const plausibleBoundaryIndexes = new Set();
  const groups = groupContiguousIndexes(candidateIndexes);

  for (const group of groups) {
    if (group[0] === 0) {
      const anchorIndex = group[group.length - 1] + 1;
      if (
        anchorIndex < observations.length &&
        isPlausibleBoundarySparseTailTransition(observations, 0, anchorIndex)
      ) {
        group.forEach((index) => plausibleBoundaryIndexes.add(index));
      }
    }

    if (group[group.length - 1] === observations.length - 1) {
      const anchorIndex = group[0] - 1;
      if (
        anchorIndex >= 0 &&
        isPlausibleBoundarySparseTailTransition(observations, observations.length - 1, anchorIndex)
      ) {
        group.forEach((index) => plausibleBoundaryIndexes.add(index));
      }
    }
  }

  return candidateIndexes.filter((index) => !plausibleBoundaryIndexes.has(index));
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} boundaryIndex
 * @param {number} anchorIndex
 */
function isPlausibleBoundarySparseTailTransition(observations, boundaryIndex, anchorIndex) {
  const transition = assessObservationEndpointTransition(
    observations,
    boundaryIndex,
    Number(observations[anchorIndex].point.elevation),
    anchorIndex
  );

  return transition.hasContext && !transition.implausible;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} index
 * @param {Set<number>} candidateSet
 * @returns {{ index: number, elevation: number } | null}
 */
function getSparseTailReplacement(observations, index, candidateSet) {
  const previousIndex = findSparseTailAnchorIndex(observations, index, candidateSet, -1);
  const nextIndex = findSparseTailAnchorIndex(observations, index, candidateSet, 1);

  if (previousIndex === null || nextIndex === null) {
    const anchorIndex = previousIndex ?? nextIndex;
    return anchorIndex === null
      ? null
      : {
          index,
          elevation: Number(observations[anchorIndex].point.elevation)
        };
  }

  const previous = observations[previousIndex];
  const next = observations[nextIndex];
  const distanceDelta = next.routeDistanceMeters - previous.routeDistanceMeters;
  const ratio =
    distanceDelta > 0
      ? (observations[index].routeDistanceMeters - previous.routeDistanceMeters) / distanceDelta
      : (index - previousIndex) / (nextIndex - previousIndex);

  return {
    index,
    elevation: interpolate(
      Number(previous.point.elevation),
      Number(next.point.elevation),
      Math.min(1, Math.max(0, ratio))
    )
  };
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number[]} candidateIndexes
 * @returns {{ index: number, elevation: number }[]}
 */
function getSparseTailSettlingAnchorReplacements(observations, candidateIndexes) {
  const candidateSet = new Set(candidateIndexes);
  const replacements = [];
  /** @type {(-1 | 1)[]} */
  const directions = [-1, 1];

  for (const group of groupContiguousIndexes(candidateIndexes)) {
    for (const direction of directions) {
      const anchorIndex = direction === -1 ? group[0] - 1 : group[group.length - 1] + 1;
      if (anchorIndex < 0 || anchorIndex >= observations.length) {
        continue;
      }

      const settledIndex = getSettledSparseTailAnchorIndex(
        observations,
        anchorIndex,
        candidateSet,
        direction
      );
      if (settledIndex === null) {
        continue;
      }

      replacements.push({
        index: anchorIndex,
        elevation: Number(observations[settledIndex].point.elevation)
      });
    }
  }

  return replacements;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} startIndex
 * @param {Set<number>} candidateSet
 * @param {-1 | 1} direction
 */
function findNearestNonCandidateIndex(observations, startIndex, candidateSet, direction) {
  for (
    let index = startIndex + direction;
    index >= 0 && index < observations.length;
    index += direction
  ) {
    if (!candidateSet.has(index)) {
      return index;
    }
  }

  return null;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} startIndex
 * @param {Set<number>} candidateSet
 * @param {-1 | 1} direction
 */
function findSparseTailAnchorIndex(observations, startIndex, candidateSet, direction) {
  const anchorIndex = findNearestNonCandidateIndex(
    observations,
    startIndex,
    candidateSet,
    direction
  );
  if (anchorIndex === null) {
    return null;
  }

  return (
    getSettledSparseTailAnchorIndex(observations, anchorIndex, candidateSet, direction) ??
    anchorIndex
  );
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} anchorIndex
 * @param {Set<number>} candidateSet
 * @param {-1 | 1} direction
 */
function getSettledSparseTailAnchorIndex(observations, anchorIndex, candidateSet, direction) {
  const boundaryCandidateIndex = anchorIndex - direction;
  if (
    !candidateSet.has(boundaryCandidateIndex) ||
    !hasSparseTailSettlingBoundaryGap(observations, boundaryCandidateIndex, anchorIndex)
  ) {
    return null;
  }

  const lookaheadIndexes = collectSparseTailSettlingLookaheadIndexes(
    observations,
    anchorIndex,
    candidateSet,
    direction
  );
  if (lookaheadIndexes.length < SPARSE_TAIL_SETTLING_STABLE_WINDOW_SAMPLES) {
    return null;
  }

  const stableWindowIndexes = lookaheadIndexes.slice(-SPARSE_TAIL_SETTLING_STABLE_WINDOW_SAMPLES);
  const stableWindowElevations = stableWindowIndexes.map((index) =>
    Number(observations[index].point.elevation)
  );
  if (getRange(stableWindowElevations) > SPARSE_TAIL_SETTLING_STABLE_TOLERANCE_METERS) {
    return null;
  }

  const stableElevation = lowerRankMedian(stableWindowElevations) ?? 0;
  const anchorElevation = Number(observations[anchorIndex].point.elevation);
  const firstLookaheadElevation = Number(observations[lookaheadIndexes[0]].point.elevation);
  const anchorToStable = stableElevation - anchorElevation;
  const firstStep = firstLookaheadElevation - anchorElevation;
  const isMovingTowardStable =
    Math.sign(anchorToStable) === Math.sign(firstStep) &&
    Math.abs(firstStep) >= SPARSE_TAIL_SETTLING_MIN_FIRST_STEP_METERS;

  if (
    !isMovingTowardStable ||
    Math.abs(anchorToStable) < SPARSE_TAIL_SETTLING_MIN_VERTICAL_CHANGE_METERS
  ) {
    return null;
  }

  const stableIndex =
    lookaheadIndexes.find(
      (index) =>
        Math.abs(Number(observations[index].point.elevation) - stableElevation) <=
        SPARSE_TAIL_SETTLING_STABLE_TOLERANCE_METERS
    ) ?? lookaheadIndexes[lookaheadIndexes.length - 1];

  return isImplausibleSparseTailSettling(observations, anchorIndex, stableIndex, stableElevation)
    ? stableIndex
    : null;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} anchorIndex
 * @param {Set<number>} candidateSet
 * @param {-1 | 1} direction
 */
function collectSparseTailSettlingLookaheadIndexes(
  observations,
  anchorIndex,
  candidateSet,
  direction
) {
  const indexes = [];

  for (
    let index = anchorIndex + direction;
    index >= 0 &&
    index < observations.length &&
    indexes.length < SPARSE_TAIL_SETTLING_LOOKAHEAD_SAMPLES;
    index += direction
  ) {
    if (candidateSet.has(index)) {
      break;
    }
    indexes.push(index);
  }

  return indexes;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} boundaryCandidateIndex
 * @param {number} anchorIndex
 */
function hasSparseTailSettlingBoundaryGap(observations, boundaryCandidateIndex, anchorIndex) {
  const gapSeconds = getAbsoluteObservationDurationSeconds(
    observations[boundaryCandidateIndex],
    observations[anchorIndex]
  );
  return gapSeconds !== null && gapSeconds >= SPARSE_TAIL_SETTLING_MIN_TIME_GAP_SECONDS;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} anchorIndex
 * @param {number} stableIndex
 * @param {number} stableElevation
 */
function isImplausibleSparseTailSettling(observations, anchorIndex, stableIndex, stableElevation) {
  const anchor = observations[anchorIndex];
  const stable = observations[stableIndex];
  const elevationDelta = Math.abs(Number(anchor.point.elevation) - stableElevation);
  const distanceMeters = Math.abs(stable.routeDistanceMeters - anchor.routeDistanceMeters);
  const durationSeconds = getAbsoluteObservationDurationSeconds(anchor, stable);
  const grade = distanceMeters > 0 ? elevationDelta / distanceMeters : Infinity;
  const verticalSpeed =
    durationSeconds !== null && durationSeconds > 0 ? elevationDelta / durationSeconds : null;

  return (
    grade > ELEVATION_IMPLAUSIBLE_GRADE ||
    (verticalSpeed !== null && verticalSpeed > ELEVATION_IMPLAUSIBLE_VERTICAL_SPEED_MPS)
  );
}

/**
 * @param {ElevationObservation} first
 * @param {ElevationObservation} last
 */
function getAbsoluteObservationDurationSeconds(first, last) {
  if (!(first.point.timestamp instanceof Date) || !(last.point.timestamp instanceof Date)) {
    return null;
  }

  return Math.abs(last.point.timestamp.valueOf() - first.point.timestamp.valueOf()) / 1000;
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} endpointIndex
 * @param {number} spikeFloor
 */
function getObservationEndpointReplacement(observations, endpointIndex, spikeFloor) {
  const isFirst = endpointIndex === 0;
  const stableWindow = isFirst
    ? observations.slice(1, 4)
    : observations.slice(Math.max(0, observations.length - 4), observations.length - 1);
  const stableElevations = stableWindow.map((observation) => Number(observation.point.elevation));

  if (stableElevations.length < 2 || getRange(stableElevations) > spikeFloor / 2) {
    return null;
  }

  const stableEstimate = lowerRankMedian(stableElevations) ?? 0;
  const endpointElevation = Number(observations[endpointIndex].point.elevation);
  const deviation = Math.abs(endpointElevation - stableEstimate);
  const transition = assessObservationEndpointTransition(
    observations,
    endpointIndex,
    stableEstimate
  );
  if (!transition.implausible && transition.hasContext) {
    return null;
  }

  const endpointThreshold = getConservativeObservationEndpointThreshold(spikeFloor);
  return deviation > endpointThreshold ? stableEstimate : null;
}

/**
 * @param {number} spikeFloor
 */
function getConservativeObservationEndpointThreshold(spikeFloor) {
  return Math.max(spikeFloor * 4, OBSERVATION_ENDPOINT_SPIKE_MIN_DEVIATION_METERS);
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} endpointIndex
 * @param {number} stableEstimate
 * @param {number} [contextIndex]
 */
function assessObservationEndpointTransition(
  observations,
  endpointIndex,
  stableEstimate,
  contextIndex
) {
  const isFirst = endpointIndex === 0;
  const neighborIndex = contextIndex ?? (isFirst ? 1 : endpointIndex - 1);
  const endpoint = observations[endpointIndex];
  const neighbor = observations[neighborIndex];
  if (!neighbor) {
    return { hasContext: false, implausible: false };
  }

  const distanceMeters = haversineMeters(endpoint.point, neighbor.point);
  const endpointElevation = Number(endpoint.point.elevation);
  const elevationDelta = Math.abs(endpointElevation - Number(neighbor.point.elevation));
  const robustDelta = Math.abs(endpointElevation - stableEstimate);
  const grade = distanceMeters > 0 ? Math.max(elevationDelta, robustDelta) / distanceMeters : null;
  const durationSeconds =
    endpoint.point.timestamp instanceof Date && neighbor.point.timestamp instanceof Date
      ? Math.abs(endpoint.point.timestamp.valueOf() - neighbor.point.timestamp.valueOf()) / 1000
      : null;
  const verticalSpeedMps =
    durationSeconds !== null && durationSeconds > 0
      ? Math.max(elevationDelta, robustDelta) / durationSeconds
      : null;

  return {
    hasContext: grade !== null || verticalSpeedMps !== null,
    implausible:
      (grade !== null && grade >= ELEVATION_IMPLAUSIBLE_GRADE) ||
      (verticalSpeedMps !== null && verticalSpeedMps >= ELEVATION_IMPLAUSIBLE_VERTICAL_SPEED_MPS)
  };
}

/**
 * @param {ElevationObservation} observation
 * @param {number} elevation
 * @returns {ElevationObservation}
 */
function replaceObservationElevation(observation, elevation) {
  return {
    ...observation,
    point: {
      ...observation.point,
      elevation
    }
  };
}

/**
 * @param {TrackPoint} previous
 * @param {TrackPoint} point
 */
function hasContinuityBreak(previous, point) {
  return !hasRouteContinuity(previous, point) || hasElevationSourceSwitch(previous, point);
}

/**
 * @param {TrackPoint} previous
 * @param {TrackPoint} point
 */
function hasRouteContinuity(previous, point) {
  return (
    normalizeFiniteElevationSegmentIndex(previous.segmentIndex) ===
    normalizeFiniteElevationSegmentIndex(point.segmentIndex)
  );
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number} stepMeters
 */
function resampleObservationRunToDistanceGrid(observations, stepMeters) {
  const cumulative = buildCumulativeDistance(observations);
  const totalDistance = cumulative[cumulative.length - 1] ?? 0;
  const startDistanceMeters = observations[0].routeDistanceMeters;

  if (totalDistance <= 0) {
    return [createSample(observations[observations.length - 1])];
  }

  const samples = [];
  const cursor = { index: 1 };

  for (let distanceMeters = 0; distanceMeters < totalDistance; distanceMeters += stepMeters) {
    samples.push(
      interpolateAtDistance(observations, cumulative, distanceMeters, cursor, startDistanceMeters)
    );
  }

  const finalSample = interpolateAtDistance(
    observations,
    cumulative,
    totalDistance,
    cursor,
    startDistanceMeters
  );
  const previousSample = samples[samples.length - 1];
  if (!previousSample || !sameDistance(previousSample.distanceMeters, finalSample.distanceMeters)) {
    samples.push(finalSample);
  }

  return samples;
}

/**
 * @param {number} left
 * @param {number} right
 */
function sameDistance(left, right) {
  return Math.abs(left - right) < 1e-9;
}

/**
 * @param {ElevationObservation[]} observations
 */
function buildCumulativeDistance(observations) {
  const startDistanceMeters = observations[0].routeDistanceMeters;
  return observations.map((observation) => observation.routeDistanceMeters - startDistanceMeters);
}

/**
 * @param {ElevationObservation[]} observations
 * @param {number[]} cumulative
 * @param {number} distanceMeters
 * @param {{ index: number }} cursor
 * @param {number} startDistanceMeters
 */
function interpolateAtDistance(
  observations,
  cumulative,
  distanceMeters,
  cursor,
  startDistanceMeters
) {
  if (distanceMeters <= 0 || observations.length === 1) {
    return createSample(observations[0]);
  }

  while (cursor.index < cumulative.length - 1 && cumulative[cursor.index] < distanceMeters) {
    cursor.index += 1;
  }

  const index = cursor.index;
  const startDistance = cumulative[index - 1];
  const endDistance = cumulative[index];
  const ratio =
    endDistance > startDistance
      ? (distanceMeters - startDistance) / (endDistance - startDistance)
      : 0;
  const previous = observations[index - 1];
  const next = observations[index];

  return {
    distanceMeters: startDistanceMeters + distanceMeters,
    displayDistanceMeters: interpolate(
      previous.displayDistanceMeters,
      next.displayDistanceMeters,
      ratio
    ),
    latitude: interpolate(previous.point.latitude, next.point.latitude, ratio),
    longitude: interpolate(previous.point.longitude, next.point.longitude, ratio),
    elevation: interpolate(Number(previous.point.elevation), Number(next.point.elevation), ratio),
    elevationSource: next.point.elevationSource ?? previous.point.elevationSource ?? "unknown",
    sourceIndex: next.sourceIndex
  };
}

/**
 * @param {ElevationObservation} observation
 */
function createSample(observation) {
  const { point, sourceIndex } = observation;
  return {
    distanceMeters: observation.routeDistanceMeters,
    displayDistanceMeters: observation.displayDistanceMeters,
    latitude: point.latitude,
    longitude: point.longitude,
    elevation: Number(point.elevation),
    elevationSource: point.elevationSource ?? "unknown",
    sourceIndex
  };
}

/**
 * @param {number[]} values
 * @param {SampleRange[]} runRanges
 */
function replaceHampelOutliers(values, runRanges) {
  const output = [...values];
  let outlierCount = 0;

  for (const range of runRanges) {
    const spikeFloor = getHampelSpikeFloor(values, range);
    for (let index = range.start + 1; index < range.end - 1; index += 1) {
      const window = values.slice(Math.max(range.start, index - 3), Math.min(range.end, index + 4));
      const median = lowerRankMedian(window) ?? 0;
      const mad = lowerRankMedian(window.map((value) => Math.abs(value - median))) ?? 0;
      const sigma = MAD_TO_SIGMA_SCALE * mad;
      const threshold = sigma > 0 ? Math.max(spikeFloor, sigma * 3) : spikeFloor;
      const valueDeviation = Math.abs(values[index] - median);
      const neighborEstimate = (values[index - 1] + values[index + 1]) / 2;
      const neighborDeviation = Math.abs(values[index] - neighborEstimate);
      const isOutlier =
        (sigma > 0 && valueDeviation > threshold) ||
        (sigma === 0 && valueDeviation > threshold && neighborDeviation > threshold);

      if (isOutlier) {
        output[index] = neighborEstimate;
        outlierCount += 1;
      }
    }
  }

  return { values: output, outlierCount };
}

/**
 * @param {number[]} values
 * @param {SampleRange[]} runRanges
 * @param {ElevationSample[]} samples
 */
function replaceEndpointSpikes(values, runRanges, samples) {
  const output = [...values];
  let outlierCount = 0;
  /** @type {ElevationReplacement[]} */
  const replacements = [];

  for (const range of runRanges) {
    if (range.end - range.start < 3) {
      continue;
    }

    const spikeFloor = getHampelSpikeFloor(values, range);
    const firstReplacement = getResampledEndpointReplacement(
      values,
      range,
      range.start,
      spikeFloor
    );
    if (firstReplacement !== null) {
      output[range.start] = firstReplacement;
      outlierCount += 1;
      replacements.push({
        phase: "post_resample",
        endpoint: "first",
        sourceIndex: samples[range.start]?.sourceIndex ?? range.start,
        sampleIndex: range.start
      });
    }

    const lastIndex = range.end - 1;
    const lastReplacement = getResampledEndpointReplacement(values, range, lastIndex, spikeFloor);
    if (lastReplacement !== null) {
      output[lastIndex] = lastReplacement;
      outlierCount += 1;
      replacements.push({
        phase: "post_resample",
        endpoint: "last",
        sourceIndex: samples[lastIndex]?.sourceIndex ?? lastIndex,
        sampleIndex: lastIndex
      });
    }
  }

  return { values: output, outlierCount, replacements };
}

/**
 * @param {number[]} values
 * @param {SampleRange} range
 * @param {number} endpointIndex
 * @param {number} spikeFloor
 */
function getResampledEndpointReplacement(values, range, endpointIndex, spikeFloor) {
  const isFirst = endpointIndex === range.start;
  const stableWindow = isFirst
    ? values.slice(range.start + 1, Math.min(range.end, range.start + 4))
    : values.slice(Math.max(range.start, endpointIndex - 3), endpointIndex);
  const stableEstimate = getStableInteriorEndpointEstimate(stableWindow);
  if (
    stableEstimate !== null &&
    Math.abs(values[endpointIndex] - stableEstimate) >
      getConservativeObservationEndpointThreshold(spikeFloor) &&
    getRange(stableWindow) <= spikeFloor / 2
  ) {
    return stableEstimate;
  }

  return null;
}

/**
 * @param {number[]} window
 */
function getStableInteriorEndpointEstimate(window) {
  if (window.length < 3) {
    return null;
  }
  return lowerRankMedian(window);
}

/**
 * @param {number[]} values
 */
function getRange(values) {
  const extrema = getExtrema(values);
  return extrema.min === null || extrema.max === null ? 0 : extrema.max - extrema.min;
}

/**
 * @param {number[]} values
 * @param {SampleRange} range
 */
function getHampelSpikeFloor(values, range) {
  const extrema = getExtrema(values.slice(range.start, range.end));
  if (extrema.min === null || extrema.max === null) {
    return HAMPEL_ABSOLUTE_THRESHOLD_METERS;
  }

  const reliefRange = extrema.max - extrema.min;
  return Math.min(
    HAMPEL_ABSOLUTE_THRESHOLD_METERS,
    Math.max(HAMPEL_LOW_RELIEF_SPIKE_FLOOR_METERS, reliefRange * HAMPEL_LOW_RELIEF_RANGE_FACTOR)
  );
}

/**
 * @param {number[]} values
 * @param {number} radius
 * @param {SampleRange[]} runRanges
 */
function smoothRuns(values, radius, runRanges) {
  if (radius <= 0 || values.length <= 2) {
    return values;
  }

  const output = [...values];
  for (const range of runRanges) {
    if (range.end - range.start <= 2) {
      continue;
    }

    for (let index = range.start + 1; index < range.end - 1; index += 1) {
      const start = Math.max(range.start, index - radius);
      const end = Math.min(range.end - 1, index + radius);
      let total = 0;
      let count = 0;
      for (let sampleIndex = start; sampleIndex <= end; sampleIndex += 1) {
        total += values[sampleIndex];
        count += 1;
      }
      output[index] = total / count;
    }
  }

  return output;
}

/**
 * @param {number[]} values
 * @param {SampleRange[]} runRanges
 */
function estimateRunSigmas(values, runRanges) {
  const sigmas = Array.from({ length: values.length }, () => 0);
  for (const range of runRanges) {
    for (let index = range.start; index < range.end; index += 1) {
      sigmas[index] = estimateLocalSigma(values, index, range);
    }
  }
  return sigmas;
}

/**
 * @param {number[]} values
 * @param {number} index
 * @param {SampleRange} range
 */
function estimateLocalSigma(values, index, range) {
  const start = Math.max(range.start + 1, index - 5);
  const end = Math.min(range.end - 1, index + 5);
  const deltas = [];
  for (let sampleIndex = start; sampleIndex <= end; sampleIndex += 1) {
    deltas.push(Math.abs(values[sampleIndex] - values[sampleIndex - 1]));
  }
  if (!deltas.length) {
    return 0;
  }
  const median = lowerRankMedian(deltas) ?? 0;
  const mad = lowerRankMedian(deltas.map((value) => Math.abs(value - median))) ?? 0;
  return MAD_TO_SIGMA_SCALE * mad;
}

/**
 * @param {number[]} values
 */
function getExtrema(values) {
  if (!values.length) {
    return { min: null, max: null };
  }

  let min = values[0];
  let max = values[0];
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  return {
    min,
    max
  };
}

/**
 * @param {number} start
 * @param {number} end
 * @param {number} ratio
 */
function interpolate(start, end, ratio) {
  return start + (end - start) * ratio;
}
