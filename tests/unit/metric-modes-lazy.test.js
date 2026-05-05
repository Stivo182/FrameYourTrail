import { beforeEach, describe, expect, it, vi } from "vitest";

const { analyzeTrackMock } = vi.hoisted(() => ({
  analyzeTrackMock: vi.fn((points, options = {}) => {
    const mode = String(options.mode ?? "unknown");

    return {
      mode,
      summary: { mode },
      confidenceFlags: [],
      provenance: {
        filtersApplied: [],
        confidenceFlags: []
      },
      auditTrail: [],
      routePoints: points,
      distanceSeries: [],
      speedSeries: [],
      slopeSeries: []
    };
  })
}));

vi.mock("../../src/core/track-analyzer.js", () => ({
  analyzeTrack: analyzeTrackMock
}));

const { ANALYSIS_MODES, analyzeParsedTrack } = await import("../../src/core/metric-modes.js");
const { getSelectableAnalysisModes } = await import("../../src/core/analysis-modes.js");

const point = (longitude, secondsFromStart) => ({
  latitude: 43.1,
  longitude,
  elevation: 100,
  elevationSource: /** @type {"gpx"} */ ("gpx"),
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, secondsFromStart)),
  segmentIndex: 0
});

const parsedTrack = () => ({
  fileName: "lazy.gpx",
  name: "Lazy",
  hasElevation: true,
  hasTime: true,
  elevationSource: /** @type {"gpx"} */ ("gpx"),
  importedSummary: null,
  points: [point(42.1, 0), point(42.101, 60), point(42.102, 120)]
});

const createParsedTrack = (overrides = {}) => ({
  ...parsedTrack(),
  ...overrides
});

const importedParsedTrack = () => ({
  ...parsedTrack(),
  elevationSource: /** @type {"terrain"} */ ("terrain"),
  importedSummary: {
    mode: ANALYSIS_MODES.imported,
    totalDistanceMeters: 1000,
    sourceTag: "gpx_extensions"
  },
  points: parsedTrack().points.map((item) => ({
    ...item,
    elevationSource: /** @type {"terrain"} */ ("terrain")
  }))
});

describe("analyzeParsedTrack lazy summaries", () => {
  beforeEach(() => {
    analyzeTrackMock.mockClear();
  });

  it("computes only the selected mode until another available summary is read", () => {
    const result = analyzeParsedTrack(parsedTrack(), { mode: ANALYSIS_MODES.filtered });

    expect(result.mode).toBe(ANALYSIS_MODES.filtered);
    expect(analyzeTrackMock).toHaveBeenCalledTimes(1);
    expect(analyzeTrackMock).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ mode: ANALYSIS_MODES.filtered })
    );

    expect(result.availableSummaries.recomputed_raw).toMatchObject({
      mode: ANALYSIS_MODES.raw
    });
    expect(analyzeTrackMock).toHaveBeenCalledTimes(2);

    expect(result.availableSummaries.recomputed_raw).toMatchObject({
      mode: ANALYSIS_MODES.raw
    });
    expect(analyzeTrackMock).toHaveBeenCalledTimes(2);
  });

  it("computes imported mode backing metrics without eager raw or terrain summaries", () => {
    const result = analyzeParsedTrack(importedParsedTrack(), { mode: ANALYSIS_MODES.imported });

    expect(result.mode).toBe(ANALYSIS_MODES.imported);
    expect(analyzeTrackMock).toHaveBeenCalledTimes(1);
    expect(analyzeTrackMock).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ mode: ANALYSIS_MODES.filtered })
    );

    expect(result.availableSummaries.recomputed_terrain).toMatchObject({
      mode: ANALYSIS_MODES.terrain
    });
    expect(analyzeTrackMock).toHaveBeenCalledTimes(2);

    expect(result.availableSummaries.recomputed_raw).toMatchObject({
      mode: ANALYSIS_MODES.raw
    });
    expect(analyzeTrackMock).toHaveBeenCalledTimes(3);
  });

  it("documents that enumerating available summaries resolves enumerable lazy getters", () => {
    const result = analyzeParsedTrack(parsedTrack(), { mode: ANALYSIS_MODES.filtered });

    expect(analyzeTrackMock).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(Object.entries(result.availableSummaries))).toMatchObject({
      imported_summary: null,
      recomputed_raw: { mode: ANALYSIS_MODES.raw },
      recomputed_filtered: { mode: ANALYSIS_MODES.filtered },
      recomputed_terrain: null
    });
    expect(analyzeTrackMock).toHaveBeenCalledTimes(2);
  });

  it("checks selectable terrain replacement without computing summaries when explicitly allowed", () => {
    expect(getSelectableAnalysisModes(parsedTrack(), { allowTerrainReplacement: true })).toContain(
      ANALYSIS_MODES.terrain
    );
    expect(analyzeTrackMock).not.toHaveBeenCalled();
  });

  it("can omit available summaries without computing non-selected modes", async () => {
    const { ANALYSIS_MODES, analyzeParsedTrack } = await import("../../src/core/metric-modes.js");
    const parsed = createParsedTrack({ elevationSource: "gpx" });

    const result = analyzeParsedTrack(parsed, {
      mode: ANALYSIS_MODES.filtered,
      includeAvailableSummaries: false
    });

    expect(result.mode).toBe(ANALYSIS_MODES.filtered);
    expect(result).not.toHaveProperty("availableSummaries");
    expect(analyzeTrackMock).toHaveBeenCalledTimes(1);
  });
});
