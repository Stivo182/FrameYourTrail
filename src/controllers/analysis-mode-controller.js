import {
  ANALYSIS_MODES,
  isAnalysisModeAvailable,
  isAnalysisModeSelectable
} from "../core/analysis-modes.js";
import { validateParsedTrack as defaultValidateParsedTrack } from "../core/validation.js";
import { createState as defaultCreateState } from "../state/app-state.js";

const TERRAIN_ELEVATION_UNAVAILABLE_WARNING = {
  code: "terrain_elevation_unavailable",
  messageKey: "messages.terrainElevationUnavailable"
};

const PARSE_ERROR = {
  code: "parse_error",
  messageKey: "messages.parseError"
};

/**
 * @typedef {import("../state/app-state.js").AppMessage} AppMessage
 * @typedef {import("../state/app-state.js").AppState} AppState
 * @typedef {import("../core/route-types.js").RouteSource} RouteSource
 * @typedef {import("../core/route-types.js").TrackAnalysis} TrackAnalysis
 * @typedef {{ warnings: AppMessage[], errors: AppMessage[] }} ValidationResult
 * @typedef {{ shouldRender: false, state: null } | { shouldRender: true, state: AppState }} AnalysisModeChangeResult
 */

/**
 * @param {object} options
 * @param {string} options.selected
 * @param {() => AppState} options.getState
 * @param {() => number} options.getNextRequestToken
 * @param {(token: number) => boolean} options.isCurrentRequest
 * @param {boolean} options.terrainElevationProviderEnabled
 * @param {(parsed: RouteSource, mode: string) => Promise<TrackAnalysis>} options.analyzeParsedTrack
 * @param {((parsed: RouteSource, options: { mode: "replace" }) => Promise<RouteSource>) | undefined} [options.enrichParsedTrackFromTerrain]
 * @param {(parsed: RouteSource, fileSizeBytes: number) => ValidationResult} [options.validateParsedTrack]
 * @param {(overrides?: Partial<AppState>) => AppState} [options.createState]
 * @returns {Promise<AnalysisModeChangeResult>}
 */
export async function resolveAnalysisModeChange({
  selected,
  getState,
  getNextRequestToken,
  isCurrentRequest,
  terrainElevationProviderEnabled,
  analyzeParsedTrack,
  enrichParsedTrackFromTerrain,
  validateParsedTrack = defaultValidateParsedTrack,
  createState = defaultCreateState
}) {
  const state = getState();

  if (
    !state.parsed ||
    !isAnalysisModeSelectable(state.parsed, selected, {
      allowTerrainReplacement: terrainElevationProviderEnabled
    })
  ) {
    return skipRender();
  }

  const parsed = state.parsed;
  const requestToken = getNextRequestToken();

  if (
    terrainElevationProviderEnabled &&
    selected === ANALYSIS_MODES.terrain &&
    !isAnalysisModeAvailable(parsed, selected)
  ) {
    return resolveTerrainReplacementModeChange({
      selected,
      parsed,
      requestToken,
      getState,
      isCurrentRequest,
      analyzeParsedTrack,
      enrichParsedTrackFromTerrain,
      validateParsedTrack,
      createState
    });
  }

  return resolveRegularModeChange({
    selected,
    parsed,
    requestToken,
    getState,
    isCurrentRequest,
    analyzeParsedTrack,
    createState
  });
}

/**
 * @param {object} options
 * @param {string} options.selected
 * @param {RouteSource} options.parsed
 * @param {number} options.requestToken
 * @param {() => AppState} options.getState
 * @param {(token: number) => boolean} options.isCurrentRequest
 * @param {(parsed: RouteSource, mode: string) => Promise<TrackAnalysis>} options.analyzeParsedTrack
 * @param {(overrides?: Partial<AppState>) => AppState} options.createState
 * @returns {Promise<AnalysisModeChangeResult>}
 */
async function resolveRegularModeChange({
  selected,
  parsed,
  requestToken,
  getState,
  isCurrentRequest,
  analyzeParsedTrack,
  createState
}) {
  try {
    const analysis = await analyzeParsedTrack(parsed, selected);
    const currentState = getState();

    if (!isCurrentRequest(requestToken) || currentState.parsed !== parsed) {
      return skipRender();
    }

    return requestRender(
      createState({
        ...currentState,
        analysisMode: selected,
        analysis
      })
    );
  } catch {
    const currentState = getState();

    if (!isCurrentRequest(requestToken) || currentState.parsed !== parsed) {
      return skipRender();
    }

    return requestRender(
      createState({
        ...currentState,
        errors: [PARSE_ERROR]
      })
    );
  }
}

/**
 * @param {object} options
 * @param {string} options.selected
 * @param {RouteSource} options.parsed
 * @param {number} options.requestToken
 * @param {() => AppState} options.getState
 * @param {(token: number) => boolean} options.isCurrentRequest
 * @param {(parsed: RouteSource, mode: string) => Promise<TrackAnalysis>} options.analyzeParsedTrack
 * @param {((parsed: RouteSource, options: { mode: "replace" }) => Promise<RouteSource>) | undefined} options.enrichParsedTrackFromTerrain
 * @param {(parsed: RouteSource, fileSizeBytes: number) => ValidationResult} options.validateParsedTrack
 * @param {(overrides?: Partial<AppState>) => AppState} options.createState
 * @returns {Promise<AnalysisModeChangeResult>}
 */
async function resolveTerrainReplacementModeChange({
  selected,
  parsed,
  requestToken,
  getState,
  isCurrentRequest,
  analyzeParsedTrack,
  enrichParsedTrackFromTerrain,
  validateParsedTrack,
  createState
}) {
  const state = getState();

  if (hasWarning(state.warnings, TERRAIN_ELEVATION_UNAVAILABLE_WARNING.code)) {
    return requestRender(state);
  }

  if (!enrichParsedTrackFromTerrain) {
    return requestRender(
      createState({
        ...state,
        warnings: appendWarningOnce(state.warnings, TERRAIN_ELEVATION_UNAVAILABLE_WARNING)
      })
    );
  }

  const requestFileName = state.fileName;
  const requestFileSizeBytes = state.fileSizeBytes;
  const requestAnalysisMode = state.analysisMode;

  try {
    const enriched = await enrichParsedTrackFromTerrain(parsed, {
      mode: "replace"
    });
    const currentState = getState();

    if (
      !isCurrentRequest(requestToken) ||
      currentState.parsed !== parsed ||
      currentState.fileName !== requestFileName ||
      currentState.fileSizeBytes !== requestFileSizeBytes ||
      currentState.analysisMode !== requestAnalysisMode
    ) {
      return skipRender();
    }

    if (!isAnalysisModeAvailable(enriched, selected)) {
      return requestRender(
        createState({
          ...currentState,
          warnings: appendWarningOnce(currentState.warnings, TERRAIN_ELEVATION_UNAVAILABLE_WARNING)
        })
      );
    }

    const validation = validateParsedTrack(enriched, currentState.fileSizeBytes);
    const analysis = await analyzeParsedTrack(enriched, selected);
    const finalState = getState();

    if (!isCurrentRequest(requestToken) || finalState.parsed !== parsed) {
      return skipRender();
    }

    return requestRender(
      createState({
        ...finalState,
        parsed: enriched,
        analysisMode: selected,
        analysis,
        warnings: validation.warnings,
        errors: validation.errors
      })
    );
  } catch {
    const currentState = getState();

    if (!isCurrentRequest(requestToken) || currentState.parsed !== parsed) {
      return skipRender();
    }

    return requestRender(
      createState({
        ...currentState,
        errors: [PARSE_ERROR]
      })
    );
  }
}

/**
 * @param {AppMessage[]} warnings
 * @param {AppMessage} warning
 */
export function appendWarningOnce(warnings, warning) {
  return hasWarning(warnings, warning.code) ? warnings : [...warnings, warning];
}

/**
 * @param {AppMessage[]} warnings
 * @param {string} code
 */
export function hasWarning(warnings, code) {
  return warnings.some((item) => item.code === code);
}

/**
 * @param {AppState} state
 * @returns {AnalysisModeChangeResult}
 */
function requestRender(state) {
  return { shouldRender: true, state };
}

/**
 * @returns {AnalysisModeChangeResult}
 */
function skipRender() {
  return { shouldRender: false, state: null };
}
