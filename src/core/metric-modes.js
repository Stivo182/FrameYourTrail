import { analyzeTrack, createAuditItem } from "./track-analyzer.js";
import {
  ANALYSIS_MODES,
  getAvailableAnalysisModes,
  getDefaultAnalysisMode,
  normalizeAnalysisMode
} from "./analysis-mode-core.js";
import {
  formatRoundedCount,
  formatRoundedMeters,
  getElevationRangeMeters
} from "./analysis-summary-formatters.js";

export {
  ANALYSIS_MODES,
  getAvailableAnalysisModes,
  getDefaultAnalysisMode,
  isAnalysisModeAvailable,
  normalizeAnalysisMode
} from "./analysis-mode-core.js";

const MOVING_TIME_FILTERS = new Set(["moving_time_hysteresis", "moving_time_timer_events"]);
const MOVING_TIME_CONFIDENCE_FLAGS = new Set(["moving_time_heuristic", "moving_time_timer_events"]);

/**
 * @typedef {import("./route-types.js").RouteSource} RouteSource
 */

/**
 * @param {RouteSource} parsed
 * @param {{ mode?: string, includeAvailableSummaries?: boolean }} [options]
 * @returns {Record<string, any>}
 */
export function analyzeParsedTrack(parsed, options = {}) {
  const sourcePoints = parsed.rawPoints ?? parsed.points;
  const terrainAvailable = hasTerrainElevation(parsed);
  const imported = normalizeImportedSummary(parsed.importedSummary);
  const includeAvailableSummaries = options.includeAvailableSummaries !== false;
  const requestedMode = normalizeAnalysisMode(options.mode);
  const timerEvents = getTimerEvents(parsed.provenance);
  const selectedMode =
    typeof requestedMode === "string" && getAvailableAnalysisModes(parsed).includes(requestedMode)
      ? requestedMode
      : getDefaultAnalysisMode(parsed);
  /** @type {Map<string, ReturnType<typeof analyzeTrack>>} */
  const computedAnalyses = new Map();
  const getComputedAnalysis = (mode) => {
    if (!isComputedAnalysisMode(mode) || (mode === ANALYSIS_MODES.terrain && !terrainAvailable)) {
      return null;
    }

    if (!computedAnalyses.has(mode)) {
      const points = mode === ANALYSIS_MODES.terrain ? parsed.points : sourcePoints;
      const analysisOptions = {
        mode,
        timerEvents,
        explicitActivity: parsed.activity ?? null
      };
      computedAnalyses.set(mode, analyzeTrack(points, analysisOptions));
    }

    return computedAnalyses.get(mode) ?? null;
  };

  const availableSummaries = includeAvailableSummaries
    ? createAvailableSummaries(imported, terrainAvailable, getComputedAnalysis)
    : null;

  if (selectedMode === ANALYSIS_MODES.imported && imported) {
    const filtered = getRequiredComputedAnalysis(getComputedAnalysis, ANALYSIS_MODES.filtered);
    return withImportedSummary(filtered, imported, availableSummaries);
  }

  const selected =
    getComputedAnalysis(selectedMode) ??
    getRequiredComputedAnalysis(getComputedAnalysis, ANALYSIS_MODES.filtered);

  return includeAvailableSummaries ? { ...selected, availableSummaries } : selected;
}

/**
 * @param {ReturnType<typeof analyzeTrack>} computed
 * @param {Record<string, unknown>} imported
 * @param {Record<string, unknown> | null} availableSummaries
 */
function withImportedSummary(computed, imported, availableSummaries) {
  const confidenceFlags = [
    ...computed.confidenceFlags.filter((flag) => !MOVING_TIME_CONFIDENCE_FLAGS.has(flag)),
    "summary_imported"
  ];
  const provenance = {
    ...computed.provenance,
    mode: ANALYSIS_MODES.imported,
    filtersApplied: [
      ...computed.provenance.filtersApplied.filter((filter) => !MOVING_TIME_FILTERS.has(filter)),
      "imported_summary"
    ],
    confidenceFlags
  };

  return {
    ...computed,
    ...compactImportedSummary(imported),
    mode: ANALYSIS_MODES.imported,
    summary: imported,
    provenance,
    confidenceFlags,
    auditTrail: createImportedAuditTrail(computed.auditTrail, imported, confidenceFlags),
    ...(availableSummaries ? { availableSummaries } : {})
  };
}

/**
 * @param {ReturnType<typeof analyzeTrack>["auditTrail"]} auditTrail
 * @param {Record<string, unknown>} imported
 * @param {string[]} confidenceFlags
 */
function createImportedAuditTrail(auditTrail, imported, confidenceFlags) {
  return auditTrail.map((stage) => {
    if (stage.id === "input") {
      return {
        ...stage,
        items: stage.items.map((item) =>
          item.id === "mode"
            ? createAuditItem(
                "mode",
                "Mode",
                "analysisMode",
                ANALYSIS_MODES.imported,
                ANALYSIS_MODES.imported
              )
            : item
        )
      };
    }

    if (stage.id === "summary") {
      return {
        ...stage,
        status: "warning",
        items: [
          createAuditItem(
            "distance",
            "Distance",
            "meters",
            imported.totalDistanceMeters,
            formatRoundedMeters(imported.totalDistanceMeters)
          ),
          createAuditItem(
            "elevationGain",
            "Elevation gain",
            "meters",
            imported.elevationGainMeters,
            formatRoundedMeters(imported.elevationGainMeters)
          ),
          createAuditItem(
            "source",
            "Source",
            "sourceTag",
            imported.sourceTag ?? "unknown",
            String(imported.sourceTag ?? "unknown")
          ),
          createAuditItem(
            "flags",
            "Flags",
            "count",
            confidenceFlags.length,
            formatRoundedCount(confidenceFlags.length)
          )
        ]
      };
    }

    return stage;
  });
}

/**
 * @param {Record<string, unknown>} imported
 */
function compactImportedSummary(imported) {
  return Object.fromEntries(Object.entries(imported).filter(([_key, value]) => value !== null));
}

/**
 * @param {Record<string, unknown> | null} imported
 * @param {boolean} terrainAvailable
 * @param {(mode: string) => ReturnType<typeof analyzeTrack> | null} getComputedAnalysis
 * @returns {Record<string, unknown>}
 */
function createAvailableSummaries(imported, terrainAvailable, getComputedAnalysis) {
  /** @type {Record<string, unknown>} */
  const availableSummaries = {};

  Object.defineProperties(availableSummaries, {
    [ANALYSIS_MODES.imported]: {
      enumerable: true,
      configurable: true,
      get: () => imported
    },
    [ANALYSIS_MODES.raw]: {
      enumerable: true,
      configurable: true,
      get: () => getComputedAnalysis(ANALYSIS_MODES.raw)?.summary ?? null
    },
    [ANALYSIS_MODES.filtered]: {
      enumerable: true,
      configurable: true,
      get: () => getComputedAnalysis(ANALYSIS_MODES.filtered)?.summary ?? null
    },
    [ANALYSIS_MODES.terrain]: {
      enumerable: true,
      configurable: true,
      get: () =>
        terrainAvailable ? (getComputedAnalysis(ANALYSIS_MODES.terrain)?.summary ?? null) : null
    }
  });

  return availableSummaries;
}

/**
 * @param {(mode: string) => ReturnType<typeof analyzeTrack> | null} getComputedAnalysis
 * @param {string} mode
 * @returns {ReturnType<typeof analyzeTrack>}
 */
function getRequiredComputedAnalysis(getComputedAnalysis, mode) {
  const analysis = getComputedAnalysis(mode);

  if (!analysis) {
    throw new Error(`Analysis mode is not available: ${mode}`);
  }

  return analysis;
}

/**
 * @param {unknown} mode
 */
function isComputedAnalysisMode(mode) {
  return (
    mode === ANALYSIS_MODES.raw ||
    mode === ANALYSIS_MODES.filtered ||
    mode === ANALYSIS_MODES.terrain
  );
}

/**
 * @param {RouteSource} parsed
 */
function hasTerrainElevation(parsed) {
  return (
    parsed.elevationSource === "terrain" ||
    parsed.points.some((point) => point.elevationSource === "terrain")
  );
}

/**
 * @param {Record<string, unknown> | undefined} provenance
 */
function getTimerEvents(provenance) {
  const timerEvents = provenance?.timerEvents;

  if (!timerEvents || typeof timerEvents !== "object") {
    return undefined;
  }

  const events = /** @type {Record<string, unknown>} */ (timerEvents).events;
  return Array.isArray(events) ? events : undefined;
}

/**
 * @param {unknown} summary
 */
function normalizeImportedSummary(summary) {
  if (!summary || typeof summary !== "object") {
    return null;
  }
  const record = /** @type {Record<string, unknown>} */ (summary);
  const totalDurationSeconds = finiteOrNull(record.totalDurationSeconds);
  const movingDurationSeconds = finiteOrNull(record.movingDurationSeconds);
  const totalDistanceMeters = finiteOrNull(record.totalDistanceMeters);
  const minElevationMeters = finiteOrNull(record.minElevationMeters);
  const maxElevationMeters = finiteOrNull(record.maxElevationMeters);
  const averageSpeedKmh =
    finiteOrNull(record.averageSpeedKmh) ??
    finiteOrNull(record.overallAverageSpeedKmh) ??
    getAverageSpeedKmh(totalDistanceMeters, totalDurationSeconds);
  const movingAverageSpeedKmh =
    finiteOrNull(record.movingAverageSpeedKmh) ??
    getAverageSpeedKmh(totalDistanceMeters, movingDurationSeconds);

  return {
    mode: ANALYSIS_MODES.imported,
    totalDistanceMeters,
    totalDistance3dMeters: finiteOrNull(record.totalDistance3dMeters),
    totalDurationSeconds,
    movingDurationSeconds,
    stoppedDurationSeconds:
      nonNegativeFiniteOrNull(record.stoppedDurationSeconds) ??
      getStoppedDurationSeconds(totalDurationSeconds, movingDurationSeconds),
    averageSpeedKmh,
    movingAverageSpeedKmh,
    overallAverageSpeedKmh: finiteOrNull(record.overallAverageSpeedKmh) ?? averageSpeedKmh,
    maxSpeedKmh: finiteOrNull(record.maxSpeedKmh),
    elevationGainMeters: finiteOrNull(record.elevationGainMeters),
    elevationLossMeters: finiteOrNull(record.elevationLossMeters),
    minElevationMeters,
    maxElevationMeters,
    elevationRangeMeters:
      nonNegativeFiniteOrNull(record.elevationRangeMeters) ??
      getElevationRangeMeters(minElevationMeters, maxElevationMeters),
    elevationSource:
      typeof record.elevationSource === "string" ? record.elevationSource : "imported",
    sourceTag: typeof record.sourceTag === "string" ? record.sourceTag : "unknown"
  };
}

/**
 * @param {unknown} value
 */
function finiteOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {unknown} value
 */
function nonNegativeFiniteOrNull(value) {
  const number = finiteOrNull(value);
  return number === null ? null : Math.max(0, number);
}

/**
 * @param {number | null} totalSeconds
 * @param {number | null} movingSeconds
 */
function getStoppedDurationSeconds(totalSeconds, movingSeconds) {
  if (!Number.isFinite(totalSeconds) || !Number.isFinite(movingSeconds)) {
    return null;
  }

  return Math.max(0, Number(totalSeconds) - Number(movingSeconds));
}

/**
 * @param {number | null} distanceMeters
 * @param {number | null} durationSeconds
 */
function getAverageSpeedKmh(distanceMeters, durationSeconds) {
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    Number(distanceMeters) <= 0 ||
    Number(durationSeconds) <= 0
  ) {
    return null;
  }

  return (Number(distanceMeters) / Number(durationSeconds)) * 3.6;
}
