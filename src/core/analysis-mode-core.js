export const ANALYSIS_MODES = Object.freeze({
  imported: "imported_summary",
  raw: "recomputed_raw",
  filtered: "recomputed_filtered",
  terrain: "recomputed_terrain"
});

const LEGACY_FILTERED_ANALYSIS_MODE = "recomputed_basecamp";

/**
 * @typedef {import("./route-types.js").RouteSource} RouteSource
 */

/**
 * @param {RouteSource} parsed
 */
export function getDefaultAnalysisMode(parsed) {
  if (hasTerrainElevation(parsed) && !isExplicitTerrainReplacement(parsed)) {
    return ANALYSIS_MODES.terrain;
  }

  return ANALYSIS_MODES.filtered;
}

/**
 * @param {RouteSource} parsed
 * @returns {string[]}
 */
export function getAvailableAnalysisModes(parsed) {
  /** @type {string[]} */
  const modes = [ANALYSIS_MODES.filtered, ANALYSIS_MODES.raw];

  if (hasTerrainElevation(parsed)) {
    modes.push(ANALYSIS_MODES.terrain);
  }

  if (hasImportedSummary(parsed.importedSummary)) {
    modes.push(ANALYSIS_MODES.imported);
  }

  return modes;
}

/**
 * @param {RouteSource} parsed
 * @param {unknown} mode
 * @returns {boolean}
 */
export function isAnalysisModeAvailable(parsed, mode) {
  const normalizedMode = normalizeAnalysisMode(mode);
  return (
    typeof normalizedMode === "string" && getAvailableAnalysisModes(parsed).includes(normalizedMode)
  );
}

/**
 * @param {unknown} mode
 */
export function normalizeAnalysisMode(mode) {
  return mode === LEGACY_FILTERED_ANALYSIS_MODE ? ANALYSIS_MODES.filtered : mode;
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
 * @param {RouteSource} parsed
 */
function isExplicitTerrainReplacement(parsed) {
  return parsed.provenance?.terrainElevation?.mode === "replacement";
}

/**
 * @param {unknown} summary
 */
function hasImportedSummary(summary) {
  return Boolean(summary && typeof summary === "object");
}
