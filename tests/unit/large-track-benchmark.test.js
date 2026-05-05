import { describe, expect, it } from "vitest";
import {
  createSyntheticLargeGpx,
  formatLargeTrackBenchmarkReport,
  parseLargeTrackBenchmarkArgs,
  runLargeTrackBenchmark
} from "../../scripts/large-track-benchmark.mjs";

describe("large track benchmark", () => {
  it("creates a deterministic synthetic GPX track with the requested point count", () => {
    const source = createSyntheticLargeGpx({ pointCount: 3 });

    expect(source.match(/<trkpt /g)).toHaveLength(3);
    expect(source).toContain('creator="FrameYourTrailLargeTrackBenchmark"');
    expect(source).toContain("<name>Synthetic Large Track</name>");
    expect(source).toContain("2024-05-25T08:00:00.000Z");
  });

  it("measures one large-track run and summarizes stage timings", async () => {
    const result = await runLargeTrackBenchmark({
      pointCount: 128,
      iterations: 1,
      warmupIterations: 0
    });

    expect(result.pointCount).toBe(128);
    expect(result.fileSizeBytes).toBeGreaterThan(1024);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({ pointCount: 128, renderedMetricTableCells: 12 });
    expect(result.runs[0].uploadReadMs).toBeGreaterThanOrEqual(0);
    expect(result.runs[0].parseAnalyzeMs).toBeGreaterThanOrEqual(0);
    expect(result.runs[0].posterRenderMs).toBeGreaterThanOrEqual(0);
    expect(result.summary.totalMs.max).toBeGreaterThanOrEqual(result.summary.totalMs.min);
  });

  it("restores existing DOM globals after running programmatically", async () => {
    const previousGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      DOMParser: globalThis.DOMParser,
      XMLSerializer: globalThis.XMLSerializer,
      HTMLElement: globalThis.HTMLElement,
      Node: globalThis.Node
    };

    await runLargeTrackBenchmark({ pointCount: 8, iterations: 1, warmupIterations: 0 });

    expect(Object.is(globalThis.window, previousGlobals.window)).toBe(true);
    expect(Object.is(globalThis.document, previousGlobals.document)).toBe(true);
    expect(Object.is(globalThis.DOMParser, previousGlobals.DOMParser)).toBe(true);
    expect(Object.is(globalThis.XMLSerializer, previousGlobals.XMLSerializer)).toBe(true);
    expect(Object.is(globalThis.HTMLElement, previousGlobals.HTMLElement)).toBe(true);
    expect(Object.is(globalThis.Node, previousGlobals.Node)).toBe(true);
  });

  it("formats a readable benchmark report", () => {
    const report = formatLargeTrackBenchmarkReport({
      pointCount: 10,
      fileSizeBytes: 2048,
      runs: [],
      summary: {
        uploadReadMs: { min: 1, median: 1, max: 1 },
        parseAnalyzeMs: { min: 2, median: 2, max: 2 },
        posterRenderMs: { min: 3, median: 3, max: 3 },
        totalMs: { min: 6, median: 6, max: 6 }
      }
    });

    expect(report).toContain("Large track benchmark: 10 points");
    expect(report).toContain("upload/read");
    expect(report).toContain("parse+analyze");
    expect(report).toContain("poster shell render");
  });

  it("parses benchmark CLI arguments", () => {
    expect(
      parseLargeTrackBenchmarkArgs([
        "--points",
        "250",
        "--iterations",
        "2",
        "--warmup",
        "1",
        "--json"
      ])
    ).toEqual({
      pointCount: 250,
      iterations: 2,
      warmupIterations: 1,
      json: true
    });
  });
});
