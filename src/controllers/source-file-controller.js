import { createState as defaultCreateState } from "../state/app-state.js";

const UNSUPPORTED_FILE_ERROR = {
  code: "unsupported_file",
  messageKey: "messages.unsupportedFile"
};

/**
 * @typedef {import("../state/app-state.js").AppMessage} AppMessage
 * @typedef {import("../state/app-state.js").AppState} AppState
 * @typedef {import("../core/route-types.js").RouteSource} RouteSource
 * @typedef {import("../core/route-types.js").TrackAnalysis} TrackAnalysis
 * @typedef {{ warnings: AppMessage[], errors: AppMessage[] }} ValidationResult
 * @typedef {{ parsed: RouteSource, validation: ValidationResult, analysisMode: string, analysis: TrackAnalysis }} TrackSourceAnalysisResult
 * @typedef {{
 *   source: string | ArrayBuffer,
 *   fileName: string,
 *   mediaType: string,
 *   fileSizeBytes: number,
 *   previousAnalysisMode: string,
 *   previousDefaultMode: string,
 *   terrainElevationProviderEnabled: boolean
 * }} TrackSourceAnalysisPayload
 * @typedef {{ parsed: RouteSource, language: string, sourceRequestToken: number }} TrackLocationRequest
 * @typedef {{ shouldRender: false, state: null, locationRequest: null } | { shouldRender: true, state: AppState, locationRequest: TrackLocationRequest | null }} TrackFileSelectionResult
 */

/**
 * @param {object} options
 * @param {File | null | undefined} options.file
 * @param {() => AppState} options.getState
 * @param {() => number} options.getNextSourceRequestToken
 * @param {(token: number) => boolean} options.isCurrentSourceRequest
 * @param {() => void} options.invalidateModeAnalysisRequests
 * @param {() => void} options.invalidateTrackLocationRequests
 * @param {() => string} options.getPreviousDefaultAnalysisMode
 * @param {boolean} options.terrainElevationProviderEnabled
 * @param {(file: File | null | undefined) => boolean} options.isSupportedTrackFile
 * @param {(file: File) => Promise<string | ArrayBuffer>} options.readTrackSourceFile
 * @param {(payload: TrackSourceAnalysisPayload) => Promise<TrackSourceAnalysisResult>} options.analyzeTrackSource
 * @param {(parsed: { points: { timestamp: Date | null }[] }, language: string) => string} options.getDateLabel
 * @param {(overrides?: Partial<AppState>) => AppState} [options.createState]
 * @returns {Promise<TrackFileSelectionResult>}
 */
export async function resolveTrackFileSelection({
  file,
  getState,
  getNextSourceRequestToken,
  isCurrentSourceRequest,
  invalidateModeAnalysisRequests,
  invalidateTrackLocationRequests,
  getPreviousDefaultAnalysisMode,
  terrainElevationProviderEnabled,
  isSupportedTrackFile,
  readTrackSourceFile,
  analyzeTrackSource,
  getDateLabel,
  createState = defaultCreateState
}) {
  const requestToken = getNextSourceRequestToken();
  invalidateModeAnalysisRequests();
  invalidateTrackLocationRequests();
  const initialState = getState();
  const previousAnalysisMode = initialState.analysisMode;
  const previousDefaultMode = getPreviousDefaultAnalysisMode();

  if (!isSupportedTrackFile(file)) {
    return requestRender({
      state: createState({
        ...initialState,
        parsed: null,
        analysis: null,
        trackLocation: null,
        warnings: [],
        errors: [UNSUPPORTED_FILE_ERROR],
        title: "",
        dateLabel: "",
        fileName: "",
        fileSizeBytes: 0
      })
    });
  }

  const supportedFile = /** @type {File} */ (file);

  try {
    const source = await readTrackSourceFile(supportedFile);

    if (!isCurrentSourceRequest(requestToken)) {
      return skipRender();
    }

    const result = await analyzeTrackSource({
      source,
      fileName: supportedFile.name,
      mediaType: supportedFile.type,
      fileSizeBytes: supportedFile.size,
      previousAnalysisMode,
      previousDefaultMode,
      terrainElevationProviderEnabled
    });

    if (!isCurrentSourceRequest(requestToken)) {
      return skipRender();
    }

    return resolveAnalysisResult({
      result,
      fileSizeBytes: supportedFile.size,
      language: getState().language,
      state: getState(),
      requestToken,
      getDateLabel,
      createState
    });
  } catch (error) {
    if (!isCurrentSourceRequest(requestToken)) {
      return skipRender();
    }

    return requestRender({
      state: createState({
        ...getState(),
        parsed: null,
        analysis: null,
        trackLocation: null,
        warnings: [],
        errors: [
          { code: getTrackFileErrorCode(error), messageKey: getTrackFileErrorMessageKey(error) }
        ],
        fileSizeBytes: 0
      })
    });
  }
}

/**
 * @param {object} options
 * @param {TrackSourceAnalysisResult} options.result
 * @param {number} options.fileSizeBytes
 * @param {string} options.language
 * @param {AppState} options.state
 * @param {number} options.requestToken
 * @param {(parsed: { points: { timestamp: Date | null }[] }, language: string) => string} options.getDateLabel
 * @param {(overrides?: Partial<AppState>) => AppState} options.createState
 * @returns {TrackFileSelectionResult}
 */
function resolveAnalysisResult({
  result,
  fileSizeBytes,
  language,
  state,
  requestToken,
  getDateLabel,
  createState
}) {
  const { parsed, validation, analysisMode, analysis } = result;
  const baseState = {
    ...state,
    warnings: validation.warnings,
    errors: validation.errors,
    title: parsed.name ?? "",
    dateLabel: getDateLabel(parsed, language),
    fileName: parsed.fileName ?? "",
    fileSizeBytes
  };

  if (validation.errors.length > 0) {
    return requestRender({
      state: createState({
        ...baseState,
        parsed: null,
        analysis: null,
        trackLocation: null
      })
    });
  }

  return requestRender({
    state: createState({
      ...baseState,
      analysisMode,
      parsed,
      analysis,
      errors: [],
      trackLocation: null
    }),
    locationRequest: {
      parsed,
      language,
      sourceRequestToken: requestToken
    }
  });
}

/**
 * @param {unknown} error
 */
export function getTrackFileErrorCode(error) {
  return isGpxParseError(error) ? /** @type {{ code: string }} */ (error).code : "parse_error";
}

/**
 * @param {unknown} error
 */
export function getTrackFileErrorMessageKey(error) {
  if (!isGpxParseError(error)) {
    return "messages.parseError";
  }

  const code = /** @type {{ code: string }} */ (error).code;
  /** @type {Record<string, string>} */
  const messageKeys = {
    not_xml: "messages.notXml",
    invalid_xml: "messages.invalidXml",
    empty_track: "messages.emptyTrack",
    missing_coordinates: "messages.missingCoordinates",
    coordinates_out_of_bounds: "messages.coordinatesOutOfBounds"
  };

  return messageKeys[code] ?? "messages.parseError";
}

/**
 * @param {unknown} error
 */
function isGpxParseError(error) {
  return (
    error instanceof Error &&
    error.name === "GpxParseError" &&
    typeof (/** @type {{ code?: unknown }} */ (error).code) === "string"
  );
}

/**
 * @param {{ state: AppState, locationRequest?: TrackLocationRequest | null }} result
 * @returns {TrackFileSelectionResult}
 */
function requestRender({ state, locationRequest = null }) {
  return { shouldRender: true, state, locationRequest };
}

/**
 * @returns {TrackFileSelectionResult}
 */
function skipRender() {
  return { shouldRender: false, state: null, locationRequest: null };
}
