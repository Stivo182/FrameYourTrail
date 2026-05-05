import { inferElevationActivity } from "./activity-inference.js";
import { TIME_GAP_ELEVATION_DISCONTINUITY_METERS } from "./elevation-calibration-constants.js";
import {
  hasTimeGapElevationDiscontinuity,
  normalizeFiniteElevationSegmentIndex
} from "./elevation-continuity.js";
import { buildFusedElevationProfile } from "./elevation-fusion.js";
import { integrateConfirmedElevationGainLoss } from "./elevation-gain-integrator.js";
import { hasElevationSourceSwitch } from "./elevation-source.js";
import { assessElevationSources } from "./elevation-source-assessor.js";

// Noisy-GPX ramp: raise confirmation gradually when raw vertical chatter is far
// larger than the actual elevation envelope. See docs/elevation-calibration.md.
const GPS_NOISY_CHANGE_RATIO_START = 12;
const GPS_NOISY_THRESHOLD_BASE_METERS = 3;
const GPS_NOISY_THRESHOLD_RATIO_MULTIPLIER = 0.33;
const GPS_NOISY_THRESHOLD_MAX_METERS = 18;
const ELEVATION_MODEL_VERSION = 1;

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 * @typedef {{ distanceFromStartMeters: number, elevation: number, continuousRunId?: number }} ElevationSeriesSample
 */

/**
 * @typedef {object} BarometricSanity
 * @property {boolean} evaluated
 * @property {boolean} trusted
 * @property {string | null} reason
 * @property {number} sampleCount
 * @property {number | null} elevationRangeMeters
 * @property {number | null} rawChangeMeters
 * @property {number | null} rawChangeToRangeRatio
 * @property {number | null} p75DeltaMeters
 * @property {number | null} maxDeltaMeters
 */

/**
 * @typedef {object} ElevationDiagnostics
 * @property {1} modelVersion
 * @property {object[]} decisionTrace
 * @property {ReturnType<typeof inferElevationActivity> | null} activityAssessment
 * @property {ReturnType<typeof assessElevationSources> | null} sourceAssessment
 * @property {object[]} segmentation
 * @property {{ method: string, resampleStepMeters: number | null, outliersRemovedPct: number, cleanup?: { method: string, outliersRemovedPct: number, flags?: string[], endpointSpikeReplacementCount?: number }, noise?: object, continuousRunCount: number, sampleCount: number, sourceSwitchCount?: number, runRanges?: object[], rawExtrema?: object, filteredExtrema?: object, endpointSpikeReplacementCount?: number, preResampleEndpointSpikeReplacementCount?: number, postResampleEndpointSpikeReplacementCount?: number, endpointSpikeReplacementSourceIndexes?: number[], preResampleInteriorOutlierReplacementCount?: number, preResampleInteriorOutlierReplacementSourceIndexes?: number[], preResampleSparseTailReplacementCount?: number, preResampleSparseTailReplacementSourceIndexes?: number[], flags?: string[] }} fusion
 * @property {{ baseThresholdMeters: number | null, medianThresholdMeters: number | null, p95ThresholdMeters: number | null, minSustainedDistanceMeters: number | null, alpha?: number | null, profileSampleCount?: number }} gainModel
 * @property {{ overall: number, gain: number, loss: number, extrema: number, level?: "high" | "medium" | "low", base?: object, penalties?: { code: string, value: number }[] }} confidence
 * @property {string[]} flags
 * @property {string[]} filtersApplied
 * @property {string[]} profileNames
 * @property {{ turnThresholdMeters: number | null }} thresholds
 * @property {{ kind: string, thresholdMeters: number, elevationGainMeters: number, elevationLossMeters: number }[]} thresholdSweep
 * @property {string[]} confidenceFlags
 * @property {BarometricSanity} barometricSanity
 */

/**
 * @param {TrackPoint[]} points
 * @param {{ mode?: string, distanceFromStartMeters?: number[], timeGapBreakIndexes?: Set<number>, explicitActivity?: import("./route-types.js").RouteActivityProvenance | null }} [options]
 * @returns {{
 *   elevationGainMeters: number | null,
 *   elevationLossMeters: number | null,
 *   minElevationMeters: number | null,
 *   maxElevationMeters: number | null,
 *   minElevationMetersRaw: number | null,
 *   maxElevationMetersRaw: number | null,
 *   elevationSeries: ElevationSeriesSample[],
 *   netElevationChangeMeters: number | null,
 *   diagnostics: ElevationDiagnostics
 * }}
 */
export function getElevationStats(points, options = {}) {
  const rawElevationRuns = collectFiniteElevationRuns(points, options.timeGapBreakIndexes);
  const rawElevations = rawElevationRuns.flat();
  const rawExtrema = getElevationExtrema(rawElevations);

  if (!rawElevations.length) {
    return {
      elevationGainMeters: null,
      elevationLossMeters: null,
      minElevationMeters: null,
      maxElevationMeters: null,
      minElevationMetersRaw: null,
      maxElevationMetersRaw: null,
      elevationSeries: [],
      netElevationChangeMeters: null,
      diagnostics: createEmptyElevationDiagnostics({ rawMode: options.mode === "recomputed_raw" })
    };
  }

  const activityAssessment = inferElevationActivity(points, options);
  const sourceAssessment = assessElevationSources(points, {
    timeGapBreakIndexes: options.timeGapBreakIndexes
  });
  const fusion = buildFusedElevationProfile(points, {
    activityDefaults: activityAssessment.defaults,
    sourceAssessment,
    distanceFromStartMeters: options.distanceFromStartMeters,
    timeGapBreakIndexes: options.timeGapBreakIndexes
  });
  const alpha = getAlphaForPrimaryRelativeSource(sourceAssessment.primaryRelativeSource);
  const baseThresholdMeters = getBaseThresholdMeters(activityAssessment, sourceAssessment);
  const gainLoss = integrateConfirmedElevationGainLoss(fusion.samples, {
    baseThresholdMeters,
    minSustainedDistanceMeters: activityAssessment.defaults.minSustainedDistanceMeters,
    alpha
  });
  const filteredExtrema = limitExtremaToRobustRawEnvelope(
    fusion.filteredExtrema,
    rawElevationRuns,
    getSupportedConfirmedProfileExtrema(
      gainLoss.profile,
      gainLoss.thresholds.minSustainedDistanceMeters,
      rawElevationRuns
    )
  );
  const gainModel = {
    ...gainLoss.thresholds,
    alpha,
    profileSampleCount: gainLoss.profile.length
  };
  const confidence = buildConfidence(activityAssessment, sourceAssessment, fusion);
  const flags = [...fusion.flags];
  const filtersApplied = ["distance_domain_fusion", "confirmed_elevation_turns", ...fusion.flags];
  /** @type {ElevationDiagnostics} */
  const diagnostics = {
    modelVersion: ELEVATION_MODEL_VERSION,
    decisionTrace: [
      {
        stage: "activity",
        inferred: activityAssessment.inferred,
        confidence: activityAssessment.confidence,
        reasonCodes: activityAssessment.reasonCodes,
        activityCandidates: activityAssessment.activityCandidates
      },
      {
        stage: "source",
        primaryAbsoluteSource: sourceAssessment.primaryAbsoluteSource,
        primaryRelativeSource: sourceAssessment.primaryRelativeSource,
        trusts: {
          gpsRelTrust: sourceAssessment.gpsRelTrust,
          gpsAbsTrust: sourceAssessment.gpsAbsTrust,
          baroRelTrust: sourceAssessment.baroRelTrust,
          baroAbsTrust: sourceAssessment.baroAbsTrust,
          terrainRelTrust: sourceAssessment.terrainRelTrust,
          terrainAbsTrust: sourceAssessment.terrainAbsTrust,
          unknownRelTrust: sourceAssessment.unknownRelTrust,
          unknownAbsTrust: sourceAssessment.unknownAbsTrust
        }
      },
      {
        stage: "fusion",
        method: fusion.method,
        resampleStepMeters: activityAssessment.defaults.resampleStepMeters,
        sampleCount: fusion.samples.length,
        continuousRunCount: fusion.runRanges.length,
        sourceSwitchCount: fusion.sourceSwitchCount,
        outliersRemovedPct: fusion.outliersRemovedPct,
        cleanup: {
          method: "hampel_mad",
          outliersRemovedPct: fusion.outliersRemovedPct,
          flags: fusion.flags,
          endpointSpikeReplacementCount: fusion.endpointSpikeReplacementCount
        },
        noise: fusion.noise,
        flags: fusion.flags
      },
      {
        stage: "gain_loss",
        alpha,
        baseThresholdMeters: gainModel.baseThresholdMeters,
        medianThresholdMeters: gainModel.medianThresholdMeters,
        p95ThresholdMeters: gainModel.p95ThresholdMeters,
        minSustainedDistanceMeters: gainModel.minSustainedDistanceMeters
      }
    ],
    activityAssessment,
    sourceAssessment,
    segmentation: fusion.runRanges,
    fusion: {
      method: fusion.method,
      resampleStepMeters: activityAssessment.defaults.resampleStepMeters,
      outliersRemovedPct: fusion.outliersRemovedPct,
      cleanup: {
        method: "hampel_mad",
        outliersRemovedPct: fusion.outliersRemovedPct,
        flags: fusion.flags,
        endpointSpikeReplacementCount: fusion.endpointSpikeReplacementCount
      },
      noise: fusion.noise,
      continuousRunCount: fusion.runRanges.length,
      sampleCount: fusion.samples.length,
      sourceSwitchCount: fusion.sourceSwitchCount,
      runRanges: fusion.runRanges,
      rawExtrema: fusion.rawExtrema,
      filteredExtrema: fusion.filteredExtrema,
      endpointSpikeReplacementCount: fusion.endpointSpikeReplacementCount,
      preResampleEndpointSpikeReplacementCount: fusion.preResampleEndpointSpikeReplacementCount,
      postResampleEndpointSpikeReplacementCount: fusion.postResampleEndpointSpikeReplacementCount,
      endpointSpikeReplacementSourceIndexes: fusion.endpointSpikeReplacementSourceIndexes,
      preResampleInteriorOutlierReplacementCount: fusion.preResampleInteriorOutlierReplacementCount,
      preResampleInteriorOutlierReplacementSourceIndexes:
        fusion.preResampleInteriorOutlierReplacementSourceIndexes,
      preResampleSparseTailReplacementCount: fusion.preResampleSparseTailReplacementCount,
      preResampleSparseTailReplacementSourceIndexes:
        fusion.preResampleSparseTailReplacementSourceIndexes,
      flags: fusion.flags
    },
    gainModel,
    confidence,
    flags,
    filtersApplied,
    profileNames: ["distance_domain_fused_profile"],
    thresholds: {
      turnThresholdMeters: gainModel.medianThresholdMeters
    },
    thresholdSweep: buildElevationThresholdSweep(gainLoss, gainModel),
    confidenceFlags: buildConfidenceFlags(activityAssessment, sourceAssessment, fusion, confidence),
    barometricSanity: createDefaultBarometricSanity()
  };

  return {
    elevationGainMeters: gainLoss.gain,
    elevationLossMeters: gainLoss.loss,
    minElevationMeters: filteredExtrema.min,
    maxElevationMeters: filteredExtrema.max,
    minElevationMetersRaw: rawExtrema.min,
    maxElevationMetersRaw: rawExtrema.max,
    elevationSeries: buildElevationSeries(fusion.samples, filteredExtrema),
    netElevationChangeMeters: getNetElevationChangeMeters(fusion.samples),
    diagnostics
  };
}

/**
 * @param {{ distanceMeters: number, displayDistanceMeters?: number, elevation: number, continuousRunId?: number }[]} samples
 * @param {{ min: number | null, max: number | null }} extrema
 * @returns {ElevationSeriesSample[]}
 */
function buildElevationSeries(samples, extrema) {
  return samples.map((sample) => ({
    distanceFromStartMeters: sample.displayDistanceMeters ?? sample.distanceMeters,
    elevation: clampElevationToExtrema(sample.elevation, extrema),
    continuousRunId: sample.continuousRunId
  }));
}

/**
 * @param {number} elevation
 * @param {{ min: number | null, max: number | null }} extrema
 */
function clampElevationToExtrema(elevation, extrema) {
  let value = elevation;

  if (Number.isFinite(extrema.min)) {
    value = Math.max(value, Number(extrema.min));
  }

  if (Number.isFinite(extrema.max)) {
    value = Math.min(value, Number(extrema.max));
  }

  return value;
}

/**
 * @param {{ rawMode?: boolean }} [options]
 * @returns {ElevationDiagnostics}
 */
export function createEmptyElevationDiagnostics(options = {}) {
  const filtersApplied = options.rawMode === true ? ["raw_elevation"] : [];

  return {
    modelVersion: ELEVATION_MODEL_VERSION,
    decisionTrace: [],
    activityAssessment: null,
    sourceAssessment: null,
    segmentation: [],
    fusion: {
      method: "distance_domain_filtered_profile",
      resampleStepMeters: null,
      outliersRemovedPct: 0,
      cleanup: {
        method: "hampel_mad",
        outliersRemovedPct: 0,
        flags: [],
        endpointSpikeReplacementCount: 0
      },
      noise: {
        medianSigmaAfterCleanupMeters: 0,
        p95SigmaAfterCleanupMeters: 0,
        medianSigmaAfterSmoothingMeters: 0,
        p95SigmaAfterSmoothingMeters: 0
      },
      continuousRunCount: 0,
      sampleCount: 0,
      sourceSwitchCount: 0,
      endpointSpikeReplacementCount: 0,
      preResampleEndpointSpikeReplacementCount: 0,
      postResampleEndpointSpikeReplacementCount: 0,
      endpointSpikeReplacementSourceIndexes: [],
      preResampleInteriorOutlierReplacementCount: 0,
      preResampleInteriorOutlierReplacementSourceIndexes: [],
      preResampleSparseTailReplacementCount: 0,
      preResampleSparseTailReplacementSourceIndexes: []
    },
    gainModel: {
      baseThresholdMeters: null,
      medianThresholdMeters: null,
      p95ThresholdMeters: null,
      minSustainedDistanceMeters: null,
      alpha: null,
      profileSampleCount: 0
    },
    confidence: {
      overall: 0,
      gain: 0,
      loss: 0,
      extrema: 0,
      level: "low",
      base: {},
      penalties: []
    },
    flags: [],
    filtersApplied,
    profileNames: [],
    thresholds: {
      turnThresholdMeters: null
    },
    thresholdSweep: [],
    confidenceFlags: [],
    barometricSanity: createDefaultBarometricSanity()
  };
}

/**
 * @returns {BarometricSanity}
 */
function createDefaultBarometricSanity() {
  return {
    evaluated: false,
    trusted: false,
    reason: null,
    sampleCount: 0,
    elevationRangeMeters: null,
    rawChangeMeters: null,
    rawChangeToRangeRatio: null,
    p75DeltaMeters: null,
    maxDeltaMeters: null
  };
}

/**
 * @param {string | null} primaryRelativeSource
 */
function getAlphaForPrimaryRelativeSource(primaryRelativeSource) {
  // Lower alpha trusts clean barometric relative shape; higher alpha discounts
  // terrain wiggle that may not match the traveled surface.
  if (primaryRelativeSource === "barometric") {
    return 2;
  }

  if (primaryRelativeSource === "terrain") {
    return 4;
  }

  return 3;
}

/**
 * @param {ReturnType<typeof inferElevationActivity>} activityAssessment
 * @param {ReturnType<typeof assessElevationSources>} sourceAssessment
 */
function getBaseThresholdMeters(activityAssessment, sourceAssessment) {
  const defaultThreshold = activityAssessment.defaults.baseThresholdMeters;
  const gpsAssessment = sourceAssessment.assessments.gpx;

  if (
    activityAssessment.inferred === "water" ||
    sourceAssessment.primaryRelativeSource !== "gpx" ||
    !gpsAssessment.reasonCodes.includes("gps_vertical_noise") ||
    !Number.isFinite(gpsAssessment.rawChangeToRangeRatio)
  ) {
    return defaultThreshold;
  }

  const rawChangeToRangeRatio = gpsAssessment.rawChangeToRangeRatio ?? 0;
  const noisyThreshold =
    GPS_NOISY_THRESHOLD_BASE_METERS +
    Math.max(0, rawChangeToRangeRatio - GPS_NOISY_CHANGE_RATIO_START) *
      GPS_NOISY_THRESHOLD_RATIO_MULTIPLIER;

  return Math.max(defaultThreshold, Math.min(GPS_NOISY_THRESHOLD_MAX_METERS, noisyThreshold));
}

/**
 * @param {ReturnType<typeof inferElevationActivity>} activityAssessment
 * @param {ReturnType<typeof assessElevationSources>} sourceAssessment
 */
function buildConfidence(activityAssessment, sourceAssessment, fusion) {
  const relativeTrust = getPrimaryTrust(sourceAssessment, "relTrust");
  const absoluteTrust = getPrimaryTrust(sourceAssessment, "absTrust");
  const baseGainLossConfidence = clamp((activityAssessment.confidence + relativeTrust) / 2);
  const baseExtremaConfidence = clamp((activityAssessment.confidence + absoluteTrust) / 2);
  const penalties = buildConfidencePenalties(activityAssessment, fusion);
  const processingPenalty = penalties.reduce((total, penalty) => total + penalty.value, 0);
  const gainLossConfidence = clamp(baseGainLossConfidence - processingPenalty);
  const extremaConfidence = clamp(baseExtremaConfidence - processingPenalty * 0.5);
  const overall = clamp((gainLossConfidence * 2 + extremaConfidence) / 3);

  return {
    overall,
    gain: gainLossConfidence,
    loss: gainLossConfidence,
    extrema: extremaConfidence,
    level: getConfidenceLevel(overall),
    base: {
      activity: activityAssessment.confidence,
      relativeSourceTrust: relativeTrust,
      absoluteSourceTrust: absoluteTrust,
      gainLoss: baseGainLossConfidence,
      extrema: baseExtremaConfidence
    },
    penalties
  };
}

/**
 * @param {ReturnType<typeof inferElevationActivity>} activityAssessment
 * @param {{ outliersRemovedPct: number, runRanges: { start: number, end: number }[], sourceSwitchCount?: number, endpointSpikeReplacementCount?: number }} fusion
 */
function buildConfidencePenalties(activityAssessment, fusion) {
  const penalties = [];
  const runCount = fusion.runRanges.length;
  const shortRunCount = fusion.runRanges.filter((range) => range.end - range.start <= 2).length;
  const shortRunRatio = runCount > 0 ? shortRunCount / runCount : 0;
  const sourceSwitchCount = fusion.sourceSwitchCount ?? 0;
  const topCandidate = activityAssessment.activityCandidates[0];
  const nextCandidate = activityAssessment.activityCandidates[1];

  if (sourceSwitchCount >= 4) {
    penalties.push({ code: "source_switch_fragmentation", value: 0.1 });
  }

  if (runCount >= 4 && shortRunRatio >= 0.5) {
    penalties.push({ code: "many_short_elevation_runs", value: 0.1 });
  }

  if (fusion.outliersRemovedPct >= 5) {
    penalties.push({ code: "outliers_removed_high", value: 0.15 });
  } else if (fusion.outliersRemovedPct >= 1) {
    penalties.push({ code: "outliers_removed", value: 0.05 });
  }

  if ((fusion.endpointSpikeReplacementCount ?? 0) >= 3) {
    penalties.push({ code: "many_endpoint_spikes_replaced", value: 0.12 });
  } else if ((fusion.endpointSpikeReplacementCount ?? 0) >= 1) {
    penalties.push({ code: "endpoint_spike_replaced", value: 0.05 });
  }

  if (topCandidate && nextCandidate && topCandidate.score - nextCandidate.score < 0.15) {
    penalties.push({ code: "activity_ambiguous", value: 0.08 });
  }

  return penalties;
}

/**
 * @param {number} value
 * @returns {"high" | "medium" | "low"}
 */
function getConfidenceLevel(value) {
  if (value >= 0.75) {
    return "high";
  }

  if (value >= 0.5) {
    return "medium";
  }

  return "low";
}

/**
 * @param {ReturnType<typeof assessElevationSources>} sourceAssessment
 * @param {"absTrust" | "relTrust"} key
 */
function getPrimaryTrust(sourceAssessment, key) {
  const source =
    key === "relTrust"
      ? sourceAssessment.primaryRelativeSource
      : sourceAssessment.primaryAbsoluteSource;

  if (!source || !sourceAssessment.assessments[source]) {
    return 0;
  }

  return sourceAssessment.assessments[source][key];
}

/**
 * @param {ReturnType<typeof inferElevationActivity>} activityAssessment
 * @param {ReturnType<typeof assessElevationSources>} sourceAssessment
 * @param {{ flags: string[] }} fusion
 */
function buildConfidenceFlags(activityAssessment, sourceAssessment, fusion, confidence) {
  const flags = [...fusion.flags, ...(confidence.penalties ?? []).map((penalty) => penalty.code)];

  if (activityAssessment.confidence < 0.5) {
    flags.push("activity_inference_low_confidence");
  }

  if ((sourceAssessment.primaryRelativeSource ?? "unknown") === "terrain") {
    flags.push("terrain_relative_elevation_low_confidence");
  }

  if ((sourceAssessment.primaryAbsoluteSource ?? "unknown") === "terrain") {
    flags.push("elevation_dem_corrected");
  }

  return [...new Set(flags)];
}

/**
 * @param {ReturnType<typeof integrateConfirmedElevationGainLoss>} gainLoss
 * @param {{ medianThresholdMeters: number | null, p95ThresholdMeters: number | null }} gainModel
 */
function buildElevationThresholdSweep(gainLoss, gainModel) {
  const rows = [];
  if (isFiniteNumber(gainModel.medianThresholdMeters)) {
    rows.push({
      kind: "selected_median_local_threshold",
      thresholdMeters: gainModel.medianThresholdMeters,
      elevationGainMeters: roundMetric(gainLoss.gain),
      elevationLossMeters: roundMetric(gainLoss.loss)
    });
  }

  if (isFiniteNumber(gainModel.p95ThresholdMeters)) {
    rows.push({
      kind: "selected_p95_local_threshold",
      thresholdMeters: gainModel.p95ThresholdMeters,
      elevationGainMeters: roundMetric(gainLoss.gain),
      elevationLossMeters: roundMetric(gainLoss.loss)
    });
  }

  return rows;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return Number.isFinite(value);
}

/**
 * @param {{ elevation: number, continuousRunId?: number }[]} samples
 */
function getNetElevationChangeMeters(samples) {
  let net = 0;
  let runStart = null;

  for (let index = 0; index <= samples.length; index += 1) {
    const sample = samples[index];
    const previous = samples[index - 1];

    if (index === samples.length || isSampleRunBoundary(previous, sample)) {
      if (runStart !== null && previous) {
        net += previous.elevation - runStart.elevation;
      }

      runStart = sample ?? null;
    } else if (runStart === null && sample) {
      runStart = sample;
    }
  }

  return samples.length ? net : null;
}

/**
 * @param {{ continuousRunId?: number } | undefined} previous
 * @param {{ continuousRunId?: number } | undefined} sample
 */
function isSampleRunBoundary(previous, sample) {
  return (
    previous !== undefined &&
    sample !== undefined &&
    previous.continuousRunId !== undefined &&
    sample.continuousRunId !== undefined &&
    previous.continuousRunId !== sample.continuousRunId
  );
}

/**
 * @param {{ min: number | null, max: number | null }} filteredExtrema
 * @param {number[][]} rawElevationRuns
 * @param {{ min: number | null, max: number | null }} confirmedExtrema
 */
function limitExtremaToRobustRawEnvelope(filteredExtrema, rawElevationRuns, confirmedExtrema) {
  const robustRawElevations = rawElevationRuns.flatMap((run) => replaceIsolatedRawOutliers(run));
  const robustExtrema = getElevationExtrema(robustRawElevations);
  const limitedExtrema = {
    min:
      filteredExtrema.min === null || robustExtrema.min === null
        ? filteredExtrema.min
        : Math.max(filteredExtrema.min, robustExtrema.min),
    max:
      filteredExtrema.max === null || robustExtrema.max === null
        ? filteredExtrema.max
        : Math.min(filteredExtrema.max, robustExtrema.max)
  };

  return {
    min:
      limitedExtrema.min === null || confirmedExtrema.min === null
        ? limitedExtrema.min
        : Math.min(limitedExtrema.min, confirmedExtrema.min),
    max:
      limitedExtrema.max === null || confirmedExtrema.max === null
        ? limitedExtrema.max
        : Math.max(limitedExtrema.max, confirmedExtrema.max)
  };
}

/**
 * @param {{ distanceMeters: number, elevation: number, continuousRunId?: number }[]} profile
 * @param {number | null} minSustainedDistanceMeters
 * @param {number[][]} rawElevationRuns
 * @returns {{ min: number | null, max: number | null }}
 */
function getSupportedConfirmedProfileExtrema(
  profile,
  minSustainedDistanceMeters,
  rawElevationRuns
) {
  const runEnvelopes = rawElevationRuns.map((run) => ({
    robustExtrema: getElevationExtrema(replaceIsolatedRawOutliers(run)),
    elevations: run
  }));
  const guardElevations = profile
    .filter(
      (sample, index) =>
        isSupportedConfirmedProfileSample(profile, index, minSustainedDistanceMeters) &&
        !isOutsideOwnRobustRunEnvelope(sample, runEnvelopes)
    )
    .map((sample) => sample.elevation);

  return getElevationExtrema(guardElevations);
}

/**
 * @param {{ distanceMeters: number, continuousRunId?: number }[]} profile
 * @param {number} index
 * @param {number | null} minSustainedDistanceMeters
 */
function isSupportedConfirmedProfileSample(profile, index, minSustainedDistanceMeters) {
  if (
    index === 0 ||
    index === profile.length - 1 ||
    typeof minSustainedDistanceMeters !== "number" ||
    !Number.isFinite(minSustainedDistanceMeters)
  ) {
    return true;
  }

  const previous = profile[index - 1];
  const sample = profile[index];
  const next = profile[index + 1];

  if (isSampleRunBoundary(previous, sample) || isSampleRunBoundary(sample, next)) {
    return true;
  }

  return (
    sample.distanceMeters - previous.distanceMeters >= minSustainedDistanceMeters &&
    next.distanceMeters - sample.distanceMeters >= minSustainedDistanceMeters
  );
}

/**
 * @param {{ elevation: number, continuousRunId?: number }} sample
 * @param {{ robustExtrema: { min: number | null, max: number | null }, elevations: number[] }[]} runEnvelopes
 */
function isOutsideOwnRobustRunEnvelope(sample, runEnvelopes) {
  const runIndex = Number.isInteger(sample.continuousRunId) ? Number(sample.continuousRunId) : 0;
  const envelope = runEnvelopes[runIndex];

  if (!envelope) {
    return false;
  }

  if (envelope.robustExtrema.min !== null && sample.elevation < envelope.robustExtrema.min) {
    return !hasSupportedRawElevationAtOrBelow(envelope.elevations, sample.elevation);
  }

  if (envelope.robustExtrema.max !== null && sample.elevation > envelope.robustExtrema.max) {
    return !hasSupportedRawElevationAtOrAbove(envelope.elevations, sample.elevation);
  }

  return false;
}

/**
 * @param {number[]} elevations
 * @param {number} value
 */
function hasSupportedRawElevationAtOrAbove(elevations, value) {
  return elevations.some(
    (elevation, index) =>
      elevation >= value && isRawElevationSupportedForConfirmedExtremum(elevations, index)
  );
}

/**
 * @param {number[]} elevations
 * @param {number} value
 */
function hasSupportedRawElevationAtOrBelow(elevations, value) {
  return elevations.some(
    (elevation, index) =>
      elevation <= value && isRawElevationSupportedForConfirmedExtremum(elevations, index)
  );
}

/**
 * @param {number[]} elevations
 * @param {number} index
 */
function isRawElevationSupportedForConfirmedExtremum(elevations, index) {
  if (index === 0 || index === elevations.length - 1 || elevations.length < 3) {
    return true;
  }

  return !isSevereIsolatedRawOutlier(elevations, index);
}

/**
 * @param {number[]} elevations
 * @param {number} index
 */
function isSevereIsolatedRawOutlier(elevations, index) {
  const elevation = elevations[index];
  const previous = elevations[index - 1];
  const next = elevations[index + 1];
  const neighborEstimate = (previous + next) / 2;
  const neighborDelta = Math.abs(next - previous);
  const deviation = Math.abs(elevation - neighborEstimate);

  return deviation > Math.max(TIME_GAP_ELEVATION_DISCONTINUITY_METERS, neighborDelta * 3);
}

/**
 * @param {number[]} elevations
 */
function replaceIsolatedRawOutliers(elevations) {
  if (elevations.length < 3) {
    return elevations;
  }

  return elevations.map((elevation, index) => {
    if (index === 0 || index === elevations.length - 1) {
      return elevation;
    }

    return replaceIsolatedRawOutlier(elevations, index);
  });
}

/**
 * @param {number[]} elevations
 * @param {number} index
 */
function replaceIsolatedRawOutlier(elevations, index) {
  const elevation = elevations[index];
  const previous = elevations[index - 1];
  const next = elevations[index + 1];
  const neighborEstimate = (previous + next) / 2;
  const neighborDelta = Math.abs(next - previous);
  const deviation = Math.abs(elevation - neighborEstimate);

  return deviation > Math.max(12, neighborDelta * 3) ? neighborEstimate : elevation;
}

/**
 * @param {number} value
 */
function roundMetric(value) {
  return Number(value.toFixed(2));
}

/**
 * @param {number} value
 */
function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * @param {TrackPoint[]} points
 * @param {Set<number> | undefined} timeGapBreakIndexes
 * @returns {number[][]}
 */
function collectFiniteElevationRuns(points, timeGapBreakIndexes) {
  const runs = [];
  let run = [];
  /** @type {TrackPoint | null} */
  let previousFinitePoint = null;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];

    if (!Number.isFinite(point.elevation)) {
      if (run.length) {
        runs.push(run);
        run = [];
      }
      previousFinitePoint = null;
      continue;
    }

    if (
      previousFinitePoint &&
      hasRawElevationBoundary(previousFinitePoint, point, index, timeGapBreakIndexes)
    ) {
      runs.push(run);
      run = [];
    }

    run.push(Number(point.elevation));
    previousFinitePoint = point;
  }

  if (run.length) {
    runs.push(run);
  }

  return runs;
}

/**
 * @param {TrackPoint} previous
 * @param {TrackPoint} point
 * @param {number} sourceIndex
 * @param {Set<number> | undefined} timeGapBreakIndexes
 */
function hasRawElevationBoundary(previous, point, sourceIndex, timeGapBreakIndexes) {
  return (
    normalizeFiniteElevationSegmentIndex(previous.segmentIndex) !==
      normalizeFiniteElevationSegmentIndex(point.segmentIndex) ||
    hasElevationSourceSwitch(previous, point) ||
    hasTimeGapElevationDiscontinuity(sourceIndex, timeGapBreakIndexes, previous, point)
  );
}

/**
 * @param {number[]} elevations
 * @returns {{ min: number | null, max: number | null }}
 */
function getElevationExtrema(elevations) {
  if (!elevations.length) {
    return { min: null, max: null };
  }

  let min = elevations[0];
  let max = elevations[0];

  for (let index = 1; index < elevations.length; index += 1) {
    const elevation = elevations[index];

    if (elevation < min) {
      min = elevation;
    }

    if (elevation > max) {
      max = elevation;
    }
  }

  return { min, max };
}
