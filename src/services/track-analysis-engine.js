import {
  ANALYSIS_MODES,
  getDefaultAnalysisMode,
  isAnalysisModeAvailable
} from "../core/analysis-mode-core.js";
import { analyzeParsedTrack } from "../core/metric-modes.js";
import { parseTrackSource } from "../core/track-source-parser.js";
import { validateParsedTrack } from "../core/validation.js";
import { enrichElevationFromTerrain } from "./elevation-service.js";

/**
 * @typedef {import("../core/route-types.js").RouteSource} RouteSource
 * @typedef {import("./elevation-service.js").ElevationFetcher} ElevationFetcher
 */

/**
 * @param {{
 *   source: string | ArrayBuffer,
 *   fileName: string,
 *   mediaType?: string,
 *   fileSizeBytes: number,
 *   previousAnalysisMode?: string,
 *   previousDefaultMode?: string,
 *   terrainElevationProviderEnabled?: boolean,
 *   fetcher?: ElevationFetcher
 * }} input
 */
export async function analyzeTrackSourceForUi(input) {
  const parsedSource = await parseTrackSource(input.source, input.fileName, {
    mediaType: input.mediaType
  });
  const parsed =
    input.terrainElevationProviderEnabled === true
      ? await enrichElevationFromTerrain(parsedSource, input.fetcher)
      : parsedSource;
  const validation = validateParsedTrack(parsed, input.fileSizeBytes);
  const analysisMode = getNextAnalysisMode(
    parsed,
    input.previousAnalysisMode,
    input.previousDefaultMode
  );
  const analysis =
    validation.errors.length > 0 ? null : analyzeParsedTrackForUi(parsed, analysisMode);

  return {
    parsed,
    validation,
    analysisMode,
    analysis
  };
}

/**
 * @param {RouteSource} parsed
 * @param {string} analysisMode
 */
export function analyzeParsedTrackForUi(parsed, analysisMode) {
  return analyzeParsedTrack(parsed, {
    mode: analysisMode,
    includeAvailableSummaries: false
  });
}

/**
 * @param {RouteSource} parsed
 * @param {{ mode?: "replace", fetcher?: ElevationFetcher }} [options]
 */
export async function enrichParsedTrackFromTerrainForUi(parsed, options = {}) {
  return enrichElevationFromTerrain(parsed, options.fetcher, {
    mode: options.mode
  });
}

/**
 * @param {RouteSource} parsed
 * @param {string | undefined} previousAnalysisMode
 * @param {string | undefined} previousDefaultMode
 */
function getNextAnalysisMode(parsed, previousAnalysisMode, previousDefaultMode) {
  const defaultMode = getDefaultAnalysisMode(parsed);
  const lastMode = previousAnalysisMode ?? ANALYSIS_MODES.filtered;
  const lastDefaultMode = previousDefaultMode ?? ANALYSIS_MODES.filtered;

  if (lastMode !== lastDefaultMode && isAnalysisModeAvailable(parsed, lastMode)) {
    return lastMode;
  }

  return defaultMode;
}
