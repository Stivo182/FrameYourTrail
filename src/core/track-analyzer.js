import { createAnalysisDiagnostics } from "./analysis-diagnostics.js";
import { getElevationRangeMeters } from "./analysis-summary-formatters.js";
import { createEmptyElevationDiagnostics, getElevationStats } from "./elevation-profile.js";
import { speedMpsToKmh } from "./speed-calibration.js";
import { createContinuityModel, hasSegmentBreaks } from "./track-continuity.js";
import { createAuditTrail } from "./track-audit-trail.js";
import { cleanTrackPoints } from "./track-cleaner.js";
import {
  createMovingDiagnostics,
  getMovingAverageSpeedForAnalysis,
  getMovingDurationResult,
  getMovingThresholds
} from "./track-moving-time.js";
import { buildSegments } from "./track-segments.js";
import {
  buildDistanceSeries,
  buildRawSpeedSeries,
  buildSlopeSeries,
  getMaxRawSpeedKmh,
  getReliableSpeedSeries,
  getSpeedAverageDistanceMeters,
  getTotalDistance3dMeters
} from "./track-series.js";
import {
  createSamplingDiagnostics,
  createTemporalDiagnostics,
  getTotalDurationSeconds
} from "./track-time.js";

export { createAuditItem } from "./track-audit-trail.js";

const DEFAULT_ANALYSIS_MODE = "recomputed_filtered";
const LEGACY_FILTERED_ANALYSIS_MODE = "recomputed_basecamp";

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
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
 * @typedef {object} ElevationSeriesSample
 * @property {number} distanceFromStartMeters
 * @property {number} elevation
 * @property {number} [continuousRunId]
 */

/**
 * @param {TrackPoint[]} points
 * @param {{ mode?: string, speedProfile?: string, speedReliabilityProfile?: string, timerEvents?: unknown[], explicitActivity?: import("./route-types.js").RouteActivityProvenance | null }} [options]
 */
export function analyzeTrack(points, options = {}) {
  if (points.length < 2) {
    throw new Error("At least two points are required for analysis");
  }

  const mode = normalizeAnalysisMode(options.mode ?? DEFAULT_ANALYSIS_MODE);
  const cleaning = cleanTrackPoints(points, { speedProfile: options.speedProfile });
  const analysisPoints = cleaning.points;

  if (analysisPoints.length < 2) {
    throw new Error("At least two usable points are required for analysis");
  }

  const movingThresholds = getMovingThresholds(cleaning.diagnostics.thresholds);
  const continuity = createContinuityModel(analysisPoints, { movingThresholds });
  const temporalDiagnostics = createTemporalDiagnostics(analysisPoints);
  const samplingDiagnostics = createSamplingDiagnostics(analysisPoints);
  const distanceSeries = buildDistanceSeries(analysisPoints, continuity);
  const totalDistanceMeters = distanceSeries.at(-1)?.distanceFromStartMeters ?? 0;
  const totalDistance3dMeters = getTotalDistance3dMeters(
    analysisPoints,
    distanceSeries,
    continuity
  );
  const elevated = analysisPoints.some((point) => Number.isFinite(point.elevation));
  const rawSpeedSeries = buildRawSpeedSeries(analysisPoints, distanceSeries, continuity);
  const speedReliabilityResult = getReliableSpeedSeries(rawSpeedSeries, {
    requestedProfile: options.speedReliabilityProfile,
    fallbackProfile: cleaning.diagnostics.thresholds.speedProfile
  });
  const speedSeries = speedReliabilityResult.speedSeries;
  const speedAverageDistanceMeters = getSpeedAverageDistanceMeters(
    totalDistanceMeters,
    speedReliabilityResult.diagnostics,
    speedSeries
  );
  const movingResult = getMovingDurationResult(analysisPoints, speedSeries, movingThresholds, {
    timerEvents: options.timerEvents,
    continuity
  });
  const movingDurationSeconds = movingResult.durationSeconds;
  const totalDurationSeconds = getTotalDurationSeconds(analysisPoints);
  const stoppedDurationSeconds = getStoppedDurationSeconds(
    totalDurationSeconds,
    movingDurationSeconds
  );
  const movingAverageSpeedKmh = getMovingAverageSpeedForAnalysis(
    speedAverageDistanceMeters,
    movingResult,
    speedReliabilityResult.diagnostics
  );
  const overallAverageSpeedKmh = getOverallAverageSpeed(
    speedAverageDistanceMeters,
    totalDurationSeconds
  );
  const averageSpeedKmh = overallAverageSpeedKmh;
  const maxSpeedKmh = getMaxRawSpeedKmh(speedSeries);
  const elevationResult = elevated
    ? getElevationStats(analysisPoints, {
        mode,
        distanceFromStartMeters: distanceSeries.map((sample) => sample.distanceFromStartMeters),
        timeGapBreakIndexes: continuity.timeGapBreakIndexes,
        explicitActivity: options.explicitActivity
      })
    : {
        ...emptyElevationStats(),
        diagnostics: createEmptyElevationDiagnostics({ rawMode: mode === "recomputed_raw" })
      };
  const elevationStats = {
    elevationGainMeters: elevationResult.elevationGainMeters,
    elevationLossMeters: elevationResult.elevationLossMeters,
    minElevationMeters: elevationResult.minElevationMeters,
    maxElevationMeters: elevationResult.maxElevationMeters,
    minElevationMetersRaw: elevationResult.minElevationMetersRaw ?? null,
    maxElevationMetersRaw: elevationResult.maxElevationMetersRaw ?? null,
    elevationRangeMeters: getElevationRangeMeters(
      elevationResult.minElevationMeters,
      elevationResult.maxElevationMeters
    )
  };
  const elevationSeries = elevationResult.elevationSeries ?? [];
  const summary = {
    mode,
    elevationSource: getElevationSource(analysisPoints),
    totalDistanceMeters,
    totalDistance3dMeters,
    totalDurationSeconds,
    movingDurationSeconds,
    stoppedDurationSeconds,
    averageSpeedKmh,
    movingAverageSpeedKmh,
    overallAverageSpeedKmh,
    maxSpeedKmh,
    ...elevationStats
  };
  const diagnosticResult = createAnalysisDiagnostics({
    mode,
    points,
    cleanedPoints: analysisPoints,
    cleaningDiagnostics: cleaning.diagnostics,
    speedDiagnostics: speedReliabilityResult.diagnostics,
    elevationDiagnostics: elevationResult.diagnostics,
    continuityDiagnostics: continuity.diagnostics,
    movingDiagnostics: createMovingDiagnostics(movingResult),
    temporalDiagnostics,
    samplingDiagnostics,
    elevationSource: summary.elevationSource,
    hasMovingTime: movingDurationSeconds !== null,
    hasSegmentBreaks: hasSegmentBreaks(points)
  });
  const diagnostics = {
    ...diagnosticResult.diagnostics,
    elevation: elevationResult.diagnostics
  };
  const auditTrail = createAuditTrail({
    summary,
    diagnostics,
    confidenceFlags: diagnosticResult.confidenceFlags
  });

  return {
    mode,
    summary,
    auditTrail,
    totalDistanceMeters,
    totalDistance3dMeters,
    totalDurationSeconds,
    movingDurationSeconds,
    stoppedDurationSeconds,
    averageSpeedKmh,
    movingAverageSpeedKmh,
    overallAverageSpeedKmh,
    maxSpeedKmh,
    routePoints: analysisPoints,
    distanceSeries,
    elevationSeries,
    speedSeries,
    slopeSeries: elevated ? buildSlopeSeries(analysisPoints, distanceSeries) : [],
    segments: buildSegments(distanceSeries, speedSeries),
    ...elevationStats,
    provenance: diagnosticResult.provenance,
    diagnostics,
    confidenceFlags: diagnosticResult.confidenceFlags
  };
}

function emptyElevationStats() {
  return {
    elevationGainMeters: null,
    elevationLossMeters: null,
    minElevationMeters: null,
    maxElevationMeters: null,
    minElevationMetersRaw: null,
    maxElevationMetersRaw: null,
    elevationSeries: []
  };
}

/**
 * @param {TrackPoint[]} points
 * @returns {string}
 */
function getElevationSource(points) {
  if (points.some((point) => point.elevationSource === "barometric")) {
    return "barometric";
  }

  if (points.some((point) => point.elevationSource === "terrain")) {
    return "terrain";
  }

  if (points.some((point) => point.elevationSource === "gpx" || Number.isFinite(point.elevation))) {
    return "gpx";
  }

  return "none";
}

/**
 * @param {number | null} totalSeconds
 * @param {number | null} movingSeconds
 * @returns {number | null}
 */
function getStoppedDurationSeconds(totalSeconds, movingSeconds) {
  if (!Number.isFinite(totalSeconds)) {
    return null;
  }

  const moving = Number.isFinite(movingSeconds) ? Number(movingSeconds) : 0;
  return Math.max(0, Number(totalSeconds) - moving);
}

/**
 * @param {number | null} totalDistanceMeters
 * @param {number | null} totalSeconds
 * @returns {number | null}
 */
function getOverallAverageSpeed(totalDistanceMeters, totalSeconds) {
  if (!totalSeconds || !Number.isFinite(totalDistanceMeters) || Number(totalDistanceMeters) <= 0) {
    return null;
  }

  return speedMpsToKmh(Number(totalDistanceMeters) / totalSeconds);
}

/**
 * @param {string} mode
 */
function normalizeAnalysisMode(mode) {
  return mode === LEGACY_FILTERED_ANALYSIS_MODE ? DEFAULT_ANALYSIS_MODE : mode;
}
