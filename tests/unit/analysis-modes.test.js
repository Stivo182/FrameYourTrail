import { describe, expect, it } from "vitest";
import {
  ANALYSIS_MODES,
  getAvailableAnalysisModes,
  getDefaultAnalysisMode,
  getSelectableAnalysisModes,
  isAnalysisModeAvailable,
  isAnalysisModeSelectable,
  normalizeAnalysisMode
} from "../../src/core/analysis-modes.js";

/**
 * @typedef {import("../../src/core/route-types.js").RoutePoint} RoutePoint
 * @typedef {import("../../src/core/route-types.js").RouteSource} RouteSource
 */

/**
 * @param {"barometric" | "gpx" | "terrain" | "none"} [elevationSource]
 * @param {number | null} [elevation]
 * @returns {RoutePoint}
 */
const point = (elevationSource = "gpx", elevation = 100) => ({
  latitude: 43.1,
  longitude: 42.1,
  elevation,
  elevationSource,
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, 0)),
  segmentIndex: 0
});

/**
 * @param {Partial<RouteSource>} [overrides]
 * @returns {RouteSource}
 */
const parsedTrack = (overrides = {}) => ({
  fileName: "track.gpx",
  name: "Track",
  hasElevation: true,
  hasTime: true,
  elevationSource: "gpx",
  importedSummary: null,
  points: [point()],
  ...overrides
});

describe("analysis mode selectors", () => {
  it("defaults to filtered for ordinary GPX elevation", () => {
    const parsed = parsedTrack();

    expect(getDefaultAnalysisMode(parsed)).toBe(ANALYSIS_MODES.filtered);
    expect(getAvailableAnalysisModes(parsed)).toEqual([
      ANALYSIS_MODES.filtered,
      ANALYSIS_MODES.raw
    ]);
    expect(getSelectableAnalysisModes(parsed)).toEqual([
      ANALYSIS_MODES.filtered,
      ANALYSIS_MODES.raw
    ]);
  });

  it("defaults to terrain when terrain elevation is already available", () => {
    const parsed = parsedTrack({
      elevationSource: "terrain",
      points: [point("terrain")]
    });

    expect(getDefaultAnalysisMode(parsed)).toBe(ANALYSIS_MODES.terrain);
    expect(getAvailableAnalysisModes(parsed)).toContain(ANALYSIS_MODES.terrain);
    expect(isAnalysisModeAvailable(parsed, ANALYSIS_MODES.terrain)).toBe(true);
  });

  it("defaults to filtered after explicit terrain replacement", () => {
    const parsed = parsedTrack({
      elevationSource: "terrain",
      provenance: {
        terrainElevation: {
          mode: "replacement",
          status: "applied",
          pointCount: 1
        }
      },
      points: [point("terrain")]
    });

    expect(getDefaultAnalysisMode(parsed)).toBe(ANALYSIS_MODES.filtered);
    expect(getAvailableAnalysisModes(parsed)).toContain(ANALYSIS_MODES.terrain);
  });

  it("makes imported mode selectable and available for any imported summary object", () => {
    const parsed = parsedTrack({
      importedSummary: {}
    });

    expect(getAvailableAnalysisModes(parsed)).toContain(ANALYSIS_MODES.imported);
    expect(getSelectableAnalysisModes(parsed)).toContain(ANALYSIS_MODES.imported);
    expect(isAnalysisModeAvailable(parsed, ANALYSIS_MODES.imported)).toBe(true);
    expect(isAnalysisModeSelectable(parsed, ANALYSIS_MODES.imported)).toBe(true);
  });

  it("keeps filtered as the default when the file provides a distance total", () => {
    const parsed = parsedTrack({
      importedSummary: {
        totalDistanceMeters: 62500
      }
    });

    expect(getDefaultAnalysisMode(parsed)).toBe(ANALYSIS_MODES.filtered);
  });

  it("can make terrain replacement selectable without making it available", () => {
    const parsed = parsedTrack();
    const options = { allowTerrainReplacement: true };

    expect(getSelectableAnalysisModes(parsed, options)).toContain(ANALYSIS_MODES.terrain);
    expect(isAnalysisModeSelectable(parsed, ANALYSIS_MODES.terrain, options)).toBe(true);
    expect(getAvailableAnalysisModes(parsed)).not.toContain(ANALYSIS_MODES.terrain);
    expect(isAnalysisModeAvailable(parsed, ANALYSIS_MODES.terrain)).toBe(false);
  });

  it("normalizes legacy recomputed_basecamp to filtered", () => {
    const parsed = parsedTrack();

    expect(normalizeAnalysisMode("recomputed_basecamp")).toBe(ANALYSIS_MODES.filtered);
    expect(isAnalysisModeSelectable(parsed, "recomputed_basecamp")).toBe(true);
  });
});
