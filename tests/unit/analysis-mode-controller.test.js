import { describe, expect, it, vi } from "vitest";

import { ANALYSIS_MODES } from "../../src/core/analysis-modes.js";
import {
  appendWarningOnce,
  hasWarning,
  resolveAnalysisModeChange
} from "../../src/controllers/analysis-mode-controller.js";
import { createState } from "../../src/state/app-state.js";

/** @type {import("../../src/core/route-types.js").RoutePoint} */
const rawPoint = {
  latitude: 55.75,
  longitude: 37.62,
  elevation: 120,
  timestamp: new Date("2026-05-15T08:00:00Z"),
  segmentIndex: 0,
  distanceMeters: 0,
  elevationSource: "gpx"
};

/** @type {import("../../src/core/route-types.js").RoutePoint} */
const terrainPoint = {
  ...rawPoint,
  elevation: 140,
  elevationSource: "terrain"
};

/**
 * @param {Partial<import("../../src/core/route-types.js").RouteSource> & Record<string, unknown>} [overrides]
 * @returns {import("../../src/core/route-types.js").RouteSource}
 */
function createParsedTrack(overrides = {}) {
  const points = overrides.points ?? [rawPoint, { ...rawPoint, distanceMeters: 1000 }];

  return /** @type {import("../../src/core/route-types.js").RouteSource} */ ({
    fileName: "route.gpx",
    name: "Morning route",
    points,
    hasElevation: true,
    hasTime: true,
    totalDistance: 1000,
    elevationGain: 20,
    elevationLoss: 10,
    elevationSource: /** @type {const} */ ("gpx"),
    elevationSourceCounts: { gpx: points.length, terrain: 0, missing: 0 },
    ...overrides
  });
}

/**
 * @param {string} [mode]
 * @returns {import("../../src/core/route-types.js").TrackAnalysis}
 */
function createAnalysis(mode = ANALYSIS_MODES.raw) {
  return {
    mode,
    distanceSeries: [
      { distanceFromStartMeters: 0, elevation: 120 },
      { distanceFromStartMeters: 1000, elevation: 130 }
    ],
    elevationSeries: [120, 130],
    smoothedElevationSeries: [120, 130],
    gainSeries: [0, 20],
    lossSeries: [0, 10],
    totalAscent: 20,
    totalDescent: 10
  };
}

function createHarness(initialState) {
  let currentState = createState(initialState);
  let currentToken = 0;
  const getNextRequestToken = vi.fn(() => {
    currentToken += 1;
    return currentToken;
  });

  return {
    getState: () => currentState,
    setState: (nextState) => {
      currentState = createState(nextState);
    },
    getNextRequestToken,
    isCurrentRequest: (token) => token === currentToken
  };
}

describe("analysis mode controller", () => {
  it("does not start a request when no parsed track is available", async () => {
    const harness = createHarness({ parsed: null });

    const result = await resolveAnalysisModeChange({
      selected: ANALYSIS_MODES.raw,
      getState: harness.getState,
      getNextRequestToken: harness.getNextRequestToken,
      isCurrentRequest: harness.isCurrentRequest,
      terrainElevationProviderEnabled: false,
      analyzeParsedTrack: vi.fn()
    });

    expect(result.shouldRender).toBe(false);
    expect(harness.getNextRequestToken).not.toHaveBeenCalled();
  });

  it("updates state after regular analysis mode changes", async () => {
    const parsed = createParsedTrack();
    const analysis = createAnalysis(ANALYSIS_MODES.raw);
    const harness = createHarness({
      parsed,
      analysisMode: ANALYSIS_MODES.raw,
      analysis: createAnalysis(ANALYSIS_MODES.raw)
    });

    const result = await resolveAnalysisModeChange({
      selected: ANALYSIS_MODES.raw,
      getState: harness.getState,
      getNextRequestToken: harness.getNextRequestToken,
      isCurrentRequest: harness.isCurrentRequest,
      terrainElevationProviderEnabled: false,
      analyzeParsedTrack: vi.fn(async () => analysis)
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state?.analysisMode).toBe(ANALYSIS_MODES.raw);
    expect(result.state?.analysis).toBe(analysis);
  });

  it("ignores stale regular analysis results", async () => {
    const parsed = createParsedTrack();
    const newerParsed = createParsedTrack({ fileName: "newer.gpx" });
    const harness = createHarness({
      parsed,
      analysisMode: ANALYSIS_MODES.raw,
      analysis: createAnalysis(ANALYSIS_MODES.raw)
    });

    const result = await resolveAnalysisModeChange({
      selected: ANALYSIS_MODES.raw,
      getState: harness.getState,
      getNextRequestToken: harness.getNextRequestToken,
      isCurrentRequest: harness.isCurrentRequest,
      terrainElevationProviderEnabled: false,
      analyzeParsedTrack: vi.fn(async () => {
        harness.setState({ ...harness.getState(), parsed: newerParsed });
        return createAnalysis(ANALYSIS_MODES.raw);
      })
    });

    expect(result.shouldRender).toBe(false);
  });

  it("keeps terrain warning single and skips terrain enrichment when warning already exists", async () => {
    const parsed = createParsedTrack();
    const warning = {
      code: "terrain_elevation_unavailable",
      messageKey: "messages.terrainElevationUnavailable"
    };
    const state = createState({
      parsed,
      analysisMode: ANALYSIS_MODES.raw,
      warnings: [warning]
    });
    const harness = createHarness(state);
    const enrichParsedTrackFromTerrain = vi.fn();

    const result = await resolveAnalysisModeChange({
      selected: ANALYSIS_MODES.terrain,
      getState: harness.getState,
      getNextRequestToken: harness.getNextRequestToken,
      isCurrentRequest: harness.isCurrentRequest,
      terrainElevationProviderEnabled: true,
      analyzeParsedTrack: vi.fn(),
      enrichParsedTrackFromTerrain
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state).toEqual(state);
    expect(enrichParsedTrackFromTerrain).not.toHaveBeenCalled();
  });

  it("replaces GPX elevations with terrain data before terrain analysis", async () => {
    const parsed = createParsedTrack();
    const enriched = createParsedTrack({
      points: [terrainPoint, { ...terrainPoint, distanceMeters: 1000 }],
      elevationSource: "terrain",
      elevationSourceCounts: { gpx: 0, terrain: 2, missing: 0 }
    });
    const validation = {
      warnings: [{ code: "small_distance", messageKey: "messages.smallDistance" }],
      errors: []
    };
    const analysis = createAnalysis(ANALYSIS_MODES.terrain);
    const harness = createHarness({
      parsed,
      analysisMode: ANALYSIS_MODES.raw,
      fileName: "route.gpx",
      fileSizeBytes: 1234
    });

    const result = await resolveAnalysisModeChange({
      selected: ANALYSIS_MODES.terrain,
      getState: harness.getState,
      getNextRequestToken: harness.getNextRequestToken,
      isCurrentRequest: harness.isCurrentRequest,
      terrainElevationProviderEnabled: true,
      analyzeParsedTrack: vi.fn(async () => analysis),
      enrichParsedTrackFromTerrain: vi.fn(async () => enriched),
      validateParsedTrack: vi.fn(() => validation)
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state?.parsed).toBe(enriched);
    expect(result.state?.analysisMode).toBe(ANALYSIS_MODES.terrain);
    expect(result.state?.analysis).toBe(analysis);
    expect(result.state?.warnings).toEqual(validation.warnings);
    expect(result.state?.errors).toEqual(validation.errors);
  });

  it("adds terrain unavailable warning when enrichment still cannot enable terrain mode", async () => {
    const parsed = createParsedTrack();
    const harness = createHarness({
      parsed,
      analysisMode: ANALYSIS_MODES.raw,
      fileName: "route.gpx",
      fileSizeBytes: 1234
    });

    const result = await resolveAnalysisModeChange({
      selected: ANALYSIS_MODES.terrain,
      getState: harness.getState,
      getNextRequestToken: harness.getNextRequestToken,
      isCurrentRequest: harness.isCurrentRequest,
      terrainElevationProviderEnabled: true,
      analyzeParsedTrack: vi.fn(),
      enrichParsedTrackFromTerrain: vi.fn(async () => createParsedTrack())
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state?.warnings).toEqual([
      {
        code: "terrain_elevation_unavailable",
        messageKey: "messages.terrainElevationUnavailable"
      }
    ]);
  });

  it("returns parse error state when mode analysis fails", async () => {
    const parsed = createParsedTrack();
    const harness = createHarness({
      parsed,
      analysisMode: ANALYSIS_MODES.raw,
      errors: []
    });

    const result = await resolveAnalysisModeChange({
      selected: ANALYSIS_MODES.raw,
      getState: harness.getState,
      getNextRequestToken: harness.getNextRequestToken,
      isCurrentRequest: harness.isCurrentRequest,
      terrainElevationProviderEnabled: false,
      analyzeParsedTrack: vi.fn(async () => {
        throw new Error("analysis failed");
      })
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state?.errors).toEqual([
      { code: "parse_error", messageKey: "messages.parseError" }
    ]);
  });

  it("provides warning helpers used by controller state updates", () => {
    const warning = { code: "duplicate", messageKey: "messages.first" };

    expect(
      appendWarningOnce([warning], { code: "duplicate", messageKey: "messages.second" })
    ).toEqual([warning]);
    expect(hasWarning([warning], "duplicate")).toBe(true);
    expect(hasWarning([warning], "missing")).toBe(false);
  });
});
