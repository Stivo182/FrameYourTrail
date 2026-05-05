import {
  ANALYSIS_MODES,
  getAvailableAnalysisModes,
  getDefaultAnalysisMode,
  isAnalysisModeAvailable,
  normalizeAnalysisMode
} from "./analysis-mode-core.js";

export {
  ANALYSIS_MODES,
  getAvailableAnalysisModes,
  getDefaultAnalysisMode,
  isAnalysisModeAvailable,
  normalizeAnalysisMode
};

/**
 * @typedef {import("./route-types.js").RouteSource} RouteSource
 */

/**
 * @typedef {{ allowTerrainReplacement?: boolean }} AnalysisModeOptions
 */

/**
 * @param {RouteSource} parsed
 * @param {AnalysisModeOptions} [options]
 * @returns {string[]}
 */
export function getSelectableAnalysisModes(parsed, options = {}) {
  const modes = getAvailableAnalysisModes(parsed);

  if (
    options.allowTerrainReplacement === true &&
    !modes.includes(ANALYSIS_MODES.terrain) &&
    canRequestTerrainReplacement(parsed)
  ) {
    modes.push(ANALYSIS_MODES.terrain);
  }

  return modes;
}

/**
 * @param {RouteSource} parsed
 * @param {unknown} mode
 * @param {AnalysisModeOptions} [options]
 * @returns {boolean}
 */
export function isAnalysisModeSelectable(parsed, mode, options = {}) {
  const normalizedMode = normalizeAnalysisMode(mode);
  return (
    typeof normalizedMode === "string" &&
    getSelectableAnalysisModes(parsed, options).includes(normalizedMode)
  );
}

/**
 * @param {RouteSource} parsed
 */
function canRequestTerrainReplacement(parsed) {
  return (
    parsed.points.length > 0 &&
    !isAnalysisModeAvailable(parsed, ANALYSIS_MODES.terrain) &&
    (parsed.elevationSource === "gpx" ||
      parsed.elevationSource === "barometric" ||
      parsed.points.some(
        (point) =>
          point.elevationSource === "gpx" ||
          point.elevationSource === "barometric" ||
          Number.isFinite(point.elevation)
      ))
  );
}
