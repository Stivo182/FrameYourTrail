import { describe, expect, it, vi } from "vitest";

import { ANALYSIS_MODES } from "../../src/core/analysis-modes.js";
import {
  getTrackFileErrorCode,
  getTrackFileErrorMessageKey,
  resolveTrackFileSelection
} from "../../src/controllers/source-file-controller.js";
import { createState } from "../../src/state/app-state.js";

/** @type {import("../../src/core/route-types.js").RoutePoint} */
const routePoint = {
  latitude: 55.75,
  longitude: 37.62,
  elevation: 120,
  timestamp: new Date("2026-05-15T08:00:00Z"),
  segmentIndex: 0,
  distanceMeters: 0,
  elevationSource: "gpx"
};

function createFile() {
  return new File(["<gpx />"], "route.gpx", { type: "application/gpx+xml" });
}

/**
 * @returns {import("../../src/core/route-types.js").RouteSource}
 */
function createParsedTrack() {
  return {
    fileName: "route.gpx",
    name: "Morning route",
    points: [routePoint, { ...routePoint, distanceMeters: 1000 }],
    hasElevation: true,
    hasTime: true,
    elevationSource: "gpx"
  };
}

/**
 * @returns {import("../../src/core/route-types.js").TrackAnalysis}
 */
function createAnalysis() {
  return {
    mode: ANALYSIS_MODES.filtered,
    distanceSeries: [
      { distanceFromStartMeters: 0, elevation: 120 },
      { distanceFromStartMeters: 1000, elevation: 130 }
    ]
  };
}

function createHarness(initialState = {}) {
  let currentToken = 0;
  const getNextSourceRequestToken = vi.fn(() => {
    currentToken += 1;
    return currentToken;
  });

  return {
    getState: () => createState(initialState),
    expireSourceRequest: () => {
      currentToken += 1;
    },
    getNextSourceRequestToken,
    isCurrentSourceRequest: (token) => token === currentToken,
    invalidateModeAnalysisRequests: vi.fn(),
    invalidateTrackLocationRequests: vi.fn()
  };
}

describe("source file controller", () => {
  it("resets poster state for unsupported files", async () => {
    const harness = createHarness({
      parsed: createParsedTrack(),
      analysis: createAnalysis(),
      trackLocation: { label: "Moscow" },
      title: "Old title",
      fileName: "old.gpx",
      fileSizeBytes: 200
    });

    const result = await resolveTrackFileSelection({
      file: null,
      getState: harness.getState,
      getNextSourceRequestToken: harness.getNextSourceRequestToken,
      isCurrentSourceRequest: harness.isCurrentSourceRequest,
      invalidateModeAnalysisRequests: harness.invalidateModeAnalysisRequests,
      invalidateTrackLocationRequests: harness.invalidateTrackLocationRequests,
      getPreviousDefaultAnalysisMode: () => ANALYSIS_MODES.filtered,
      terrainElevationProviderEnabled: false,
      isSupportedTrackFile: vi.fn(() => false),
      readTrackSourceFile: vi.fn(),
      analyzeTrackSource: vi.fn(),
      getDateLabel: vi.fn()
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state?.parsed).toBeNull();
    expect(result.state?.analysis).toBeNull();
    expect(result.state?.trackLocation).toBeNull();
    expect(result.state?.errors).toEqual([
      { code: "unsupported_file", messageKey: "messages.unsupportedFile" }
    ]);
    expect(result.state?.title).toBe("");
    expect(result.state?.fileName).toBe("");
    expect(result.locationRequest).toBeNull();
    expect(harness.invalidateModeAnalysisRequests).toHaveBeenCalledOnce();
    expect(harness.invalidateTrackLocationRequests).toHaveBeenCalledOnce();
  });

  it("reads, analyzes, and returns a location request for valid files", async () => {
    const file = createFile();
    const parsed = createParsedTrack();
    const analysis = createAnalysis();
    const harness = createHarness({
      language: "ru",
      analysisMode: ANALYSIS_MODES.raw
    });
    const analyzeTrackSource = vi.fn(async () => ({
      parsed,
      validation: { warnings: [], errors: [] },
      analysisMode: ANALYSIS_MODES.filtered,
      analysis
    }));

    const result = await resolveTrackFileSelection({
      file,
      getState: harness.getState,
      getNextSourceRequestToken: harness.getNextSourceRequestToken,
      isCurrentSourceRequest: harness.isCurrentSourceRequest,
      invalidateModeAnalysisRequests: harness.invalidateModeAnalysisRequests,
      invalidateTrackLocationRequests: harness.invalidateTrackLocationRequests,
      getPreviousDefaultAnalysisMode: () => ANALYSIS_MODES.filtered,
      terrainElevationProviderEnabled: true,
      isSupportedTrackFile: vi.fn(() => true),
      readTrackSourceFile: vi.fn(async () => "<gpx />"),
      analyzeTrackSource,
      getDateLabel: vi.fn(() => "15.05.2026")
    });

    expect(analyzeTrackSource).toHaveBeenCalledWith({
      source: "<gpx />",
      fileName: "route.gpx",
      mediaType: "application/gpx+xml",
      fileSizeBytes: file.size,
      previousAnalysisMode: ANALYSIS_MODES.raw,
      previousDefaultMode: ANALYSIS_MODES.filtered,
      terrainElevationProviderEnabled: true
    });
    expect(result.shouldRender).toBe(true);
    expect(result.state?.parsed).toBe(parsed);
    expect(result.state?.analysis).toBe(analysis);
    expect(result.state?.analysisMode).toBe(ANALYSIS_MODES.filtered);
    expect(result.state?.title).toBe("Morning route");
    expect(result.state?.dateLabel).toBe("15.05.2026");
    expect(result.locationRequest).toEqual({
      parsed,
      language: "ru",
      sourceRequestToken: 1
    });
  });

  it("keeps invalid parsed results out of poster state", async () => {
    const parsed = createParsedTrack();
    const harness = createHarness({
      parsed: createParsedTrack(),
      analysis: createAnalysis(),
      trackLocation: { label: "Moscow" }
    });

    const result = await resolveTrackFileSelection({
      file: createFile(),
      getState: harness.getState,
      getNextSourceRequestToken: harness.getNextSourceRequestToken,
      isCurrentSourceRequest: harness.isCurrentSourceRequest,
      invalidateModeAnalysisRequests: harness.invalidateModeAnalysisRequests,
      invalidateTrackLocationRequests: harness.invalidateTrackLocationRequests,
      getPreviousDefaultAnalysisMode: () => ANALYSIS_MODES.filtered,
      terrainElevationProviderEnabled: false,
      isSupportedTrackFile: vi.fn(() => true),
      readTrackSourceFile: vi.fn(async () => "<gpx />"),
      analyzeTrackSource: vi.fn(async () => ({
        parsed,
        validation: {
          warnings: [],
          errors: [{ code: "empty_track", messageKey: "messages.emptyTrack" }]
        },
        analysisMode: ANALYSIS_MODES.filtered,
        analysis: createAnalysis()
      })),
      getDateLabel: vi.fn(() => "15.05.2026")
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state?.parsed).toBeNull();
    expect(result.state?.analysis).toBeNull();
    expect(result.state?.trackLocation).toBeNull();
    expect(result.state?.errors).toEqual([
      { code: "empty_track", messageKey: "messages.emptyTrack" }
    ]);
    expect(result.locationRequest).toBeNull();
  });

  it("ignores stale file reads", async () => {
    const harness = createHarness();
    const analyzeTrackSource = vi.fn();

    const result = await resolveTrackFileSelection({
      file: createFile(),
      getState: harness.getState,
      getNextSourceRequestToken: harness.getNextSourceRequestToken,
      isCurrentSourceRequest: harness.isCurrentSourceRequest,
      invalidateModeAnalysisRequests: harness.invalidateModeAnalysisRequests,
      invalidateTrackLocationRequests: harness.invalidateTrackLocationRequests,
      getPreviousDefaultAnalysisMode: () => ANALYSIS_MODES.filtered,
      terrainElevationProviderEnabled: false,
      isSupportedTrackFile: vi.fn(() => true),
      readTrackSourceFile: vi.fn(async () => {
        harness.expireSourceRequest();
        return "<gpx />";
      }),
      analyzeTrackSource,
      getDateLabel: vi.fn()
    });

    expect(result.shouldRender).toBe(false);
    expect(analyzeTrackSource).not.toHaveBeenCalled();
  });

  it("maps GPX parser errors to UI messages", async () => {
    const harness = createHarness();
    const error = new Error("Invalid XML");
    error.name = "GpxParseError";
    Object.assign(error, { code: "invalid_xml" });

    const result = await resolveTrackFileSelection({
      file: createFile(),
      getState: harness.getState,
      getNextSourceRequestToken: harness.getNextSourceRequestToken,
      isCurrentSourceRequest: harness.isCurrentSourceRequest,
      invalidateModeAnalysisRequests: harness.invalidateModeAnalysisRequests,
      invalidateTrackLocationRequests: harness.invalidateTrackLocationRequests,
      getPreviousDefaultAnalysisMode: () => ANALYSIS_MODES.filtered,
      terrainElevationProviderEnabled: false,
      isSupportedTrackFile: vi.fn(() => true),
      readTrackSourceFile: vi.fn(async () => {
        throw error;
      }),
      analyzeTrackSource: vi.fn(),
      getDateLabel: vi.fn()
    });

    expect(result.shouldRender).toBe(true);
    expect(result.state?.errors).toEqual([
      { code: "invalid_xml", messageKey: "messages.invalidXml" }
    ]);
    expect(result.state?.fileSizeBytes).toBe(0);
  });

  it("exposes parser error mapping helpers", () => {
    const error = new Error("Not XML");
    error.name = "GpxParseError";
    Object.assign(error, { code: "not_xml" });

    expect(getTrackFileErrorCode(error)).toBe("not_xml");
    expect(getTrackFileErrorMessageKey(error)).toBe("messages.notXml");
    expect(getTrackFileErrorCode(new Error("boom"))).toBe("parse_error");
    expect(getTrackFileErrorMessageKey(new Error("boom"))).toBe("messages.parseError");
  });
});
