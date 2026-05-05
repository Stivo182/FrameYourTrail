/**
 * @typedef {object} AppMessage
 * @property {string} code
 * @property {string} [message]
 * @property {string} [messageKey]
 */

/**
 * @typedef {object} AppState
 * @property {string} templateId
 * @property {string} theme
 * @property {string} mapStyleId
 * @property {string} language
 * @property {string} analysisMode
 * @property {import("../core/route-types.js").RouteSource | null} parsed
 * @property {import("../core/route-types.js").TrackAnalysis | null} analysis
 * @property {AppMessage[]} warnings
 * @property {AppMessage[]} errors
 * @property {string} title
 * @property {{ region?: string | null, country?: string | null, label: string } | null} trackLocation
 * @property {string} dateLabel
 * @property {string} fileName
 * @property {number} fileSizeBytes
 */

/** @type {AppState} */
export const DEFAULT_STATE = {
  templateId: "route-report",
  theme: "terrain",
  mapStyleId: "openfreemap_poster",
  language: "en",
  analysisMode: "recomputed_filtered",
  parsed: null,
  analysis: null,
  warnings: [],
  errors: [],
  title: "",
  trackLocation: null,
  dateLabel: "",
  fileName: "",
  fileSizeBytes: 0
};

/**
 * @param {Partial<AppState>} overrides
 * @returns {AppState}
 */
export function createState(overrides = {}) {
  const fixedOverrides = { ...overrides };

  delete fixedOverrides.templateId;
  delete fixedOverrides.theme;

  return { ...DEFAULT_STATE, ...fixedOverrides };
}
