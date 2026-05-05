import { describe, expect, it, vi } from "vitest";

import { createTrackAnalysisAdapter } from "../../src/services/track-analysis-adapter.js";

const payload = {
  source: "<gpx />",
  fileName: "route.gpx",
  mediaType: "application/gpx+xml",
  fileSizeBytes: 123,
  previousAnalysisMode: "recomputed_raw",
  previousDefaultMode: "recomputed_filtered",
  terrainElevationProviderEnabled: false
};

/** @type {import("../../src/core/route-types.js").RouteSource} */
const parsed = {
  points: [],
  elevationSource: /** @type {const} */ ("gpx"),
  hasElevation: true,
  hasTime: false
};

/** @type {import("../../src/core/route-types.js").TrackAnalysis} */
const analysis = {
  mode: "recomputed_filtered",
  distanceSeries: []
};

describe("track analysis adapter", () => {
  it("forwards track source analysis to the worker client and caches the client", async () => {
    const result = {
      parsed,
      validation: { warnings: [], errors: [] },
      analysisMode: "mode",
      analysis
    };
    const workerClient = {
      analyzeTrackSource: vi.fn(async () => result),
      analyzeParsedTrack: vi.fn(async () => analysis),
      enrichParsedTrackFromTerrain: vi.fn()
    };
    const loadWorkerClient = vi.fn(async () => workerClient);
    const adapter = createTrackAnalysisAdapter({
      loadWorkerClient,
      loadFallbackPipeline: vi.fn()
    });

    await expect(adapter.analyzeTrackSource(payload)).resolves.toBe(result);
    await expect(adapter.analyzeParsedTrack(parsed, "recomputed_raw")).resolves.toBe(analysis);

    expect(loadWorkerClient).toHaveBeenCalledOnce();
    expect(workerClient.analyzeTrackSource).toHaveBeenCalledWith(payload);
    expect(workerClient.analyzeParsedTrack).toHaveBeenCalledWith(parsed, "recomputed_raw");
  });

  it("falls back to the UI pipeline when worker source analysis fails", async () => {
    const fallbackResult = {
      parsed,
      validation: { warnings: [], errors: [] },
      analysisMode: "fallback",
      analysis
    };
    const workerClient = {
      analyzeTrackSource: vi.fn(async () => {
        throw new Error("worker failed");
      }),
      analyzeParsedTrack: vi.fn(),
      enrichParsedTrackFromTerrain: vi.fn()
    };
    const fallbackPipeline = {
      analyzeTrackSourceForUi: vi.fn(async () => fallbackResult)
    };
    const loadFallbackPipeline = vi.fn(async () => fallbackPipeline);
    const adapter = createTrackAnalysisAdapter({
      loadWorkerClient: vi.fn(async () => workerClient),
      loadFallbackPipeline
    });

    await expect(adapter.analyzeTrackSource(payload)).resolves.toBe(fallbackResult);
    await expect(adapter.analyzeTrackSource(payload)).resolves.toBe(fallbackResult);

    expect(fallbackPipeline.analyzeTrackSourceForUi).toHaveBeenCalledTimes(2);
    expect(loadFallbackPipeline).toHaveBeenCalledOnce();
  });

  it("falls back when loading the worker client fails", async () => {
    const fallbackResult = { ...analysis, mode: "fallback" };
    const fallbackPipeline = {
      analyzeParsedTrackForUi: vi.fn(async () => fallbackResult)
    };
    const adapter = createTrackAnalysisAdapter({
      loadWorkerClient: vi.fn(async () => {
        throw new Error("worker unavailable");
      }),
      loadFallbackPipeline: vi.fn(async () => fallbackPipeline)
    });

    await expect(adapter.analyzeParsedTrack(parsed, "recomputed_raw")).resolves.toBe(
      fallbackResult
    );
    expect(fallbackPipeline.analyzeParsedTrackForUi).toHaveBeenCalledWith(parsed, "recomputed_raw");
  });

  it("uses terrain enrichment fallback when worker enrichment fails", async () => {
    const enriched = { ...parsed, elevationSource: /** @type {const} */ ("terrain") };
    const workerClient = {
      analyzeTrackSource: vi.fn(),
      analyzeParsedTrack: vi.fn(),
      enrichParsedTrackFromTerrain: vi.fn(async () => {
        throw new Error("terrain worker failed");
      })
    };
    const fallbackPipeline = {
      enrichParsedTrackFromTerrainForUi: vi.fn(async () => enriched)
    };
    const adapter = createTrackAnalysisAdapter({
      loadWorkerClient: vi.fn(async () => workerClient),
      loadFallbackPipeline: vi.fn(async () => fallbackPipeline)
    });

    await expect(adapter.enrichParsedTrackFromTerrain(parsed, { mode: "replace" })).resolves.toBe(
      enriched
    );
    expect(fallbackPipeline.enrichParsedTrackFromTerrainForUi).toHaveBeenCalledWith(parsed, {
      mode: "replace"
    });
  });
});
