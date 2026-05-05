import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { ANALYSIS_MODES } from "../../src/core/metric-modes.js";
import {
  analyzeParsedTrackForUi,
  analyzeTrackSourceForUi,
  enrichParsedTrackFromTerrainForUi
} from "../../src/services/track-analysis-pipeline.js";

function readFixtureBytes(name) {
  const bytes = readFileSync(resolve("tests/fixtures", name));
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return { arrayBuffer, byteLength: bytes.byteLength };
}

const VALID_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FrameYourTrailTest" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Pipeline Route</name></metadata>
  <trk><name>Pipeline Route</name><trkseg>
    <trkpt lat="43.100000" lon="42.100000"><ele>620</ele><time>2024-05-25T08:00:00Z</time></trkpt>
    <trkpt lat="43.101000" lon="42.102000"><ele>640</ele><time>2024-05-25T08:05:00Z</time></trkpt>
    <trkpt lat="43.103000" lon="42.105000"><ele>700</ele><time>2024-05-25T08:12:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

const ONE_POINT_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FrameYourTrailTest" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="43.100000" lon="42.100000"><ele>620</ele><time>2024-05-25T08:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

const FLAT_TIMESTAMP_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Placeholder Time Route</name><trkseg>
    <trkpt lat="43.561094" lon="41.125541"><ele>1763</ele><time>1970-01-01T00:00:01Z</time></trkpt>
    <trkpt lat="43.560837" lon="41.124876"><ele>1766</ele><time>1970-01-01T00:00:01Z</time></trkpt>
    <trkpt lat="43.560364" lon="41.124103"><ele>1775</ele><time>1970-01-01T00:00:01Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

const DISCONNECTED_MULTI_TRACK_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FrameYourTrailTest" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>First Track</name><trkseg>
    <trkpt lat="43.000000" lon="42.000000"><ele>100</ele><time>2024-05-25T08:00:00Z</time></trkpt>
    <trkpt lat="43.000100" lon="42.000100"><ele>101</ele><time>2024-05-25T08:01:00Z</time></trkpt>
  </trkseg></trk>
  <trk><name>Second Track</name><trkseg>
    <trkpt lat="44.000000" lon="43.000000"><ele>200</ele><time>2024-05-25T09:00:00Z</time></trkpt>
    <trkpt lat="44.000100" lon="43.000100"><ele>201</ele><time>2024-05-25T09:01:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

const syntheticTimeRouteGpx = () => {
  const points = Array.from({ length: 26 }, (_item, index) => {
    const timestamp = new Date(Date.UTC(2026, 4, 16, 11, 12, 30) + index * 5000)
      .toISOString()
      .replace(".000Z", ".163733020Z");

    return `<trkpt lat="${(51.4 + index * 0.04495).toFixed(6)}" lon="86.020000"><time>${timestamp}</time></trkpt>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Synthetic Time Distance Route</name><trkseg>${points}</trkseg></trk>
</gpx>`;
};

describe("track analysis pipeline", () => {
  it("parses, validates, selects the default mode, and returns UI-safe analysis", async () => {
    const result = await analyzeTrackSourceForUi({
      source: VALID_GPX,
      fileName: "pipeline.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });

    expect(result.parsed.name).toBe("Pipeline Route");
    expect(result.validation.errors).toEqual([]);
    expect(result.analysisMode).toBe(ANALYSIS_MODES.filtered);
    expect(result.analysis).toMatchObject({ mode: ANALYSIS_MODES.filtered });
    expect(result.analysis).not.toHaveProperty("availableSummaries");
  });

  it("accepts binary FIT source at the pipeline boundary", async () => {
    const fixture = readFixtureBytes("minimal-activity.fit");
    const result = await analyzeTrackSourceForUi({
      source: fixture.arrayBuffer,
      fileName: "minimal-activity.fit",
      mediaType: "application/octet-stream",
      fileSizeBytes: fixture.byteLength
    });

    expect(result.validation.errors).toEqual([]);
    expect(result.analysisMode).toBe(ANALYSIS_MODES.filtered);
    expect(result.analysis).toMatchObject({ mode: ANALYSIS_MODES.filtered });
    expect(result.parsed.source).toMatchObject({ format: "fit" });
  });

  it("preserves a previous non-default mode when it is available", async () => {
    const result = await analyzeTrackSourceForUi({
      source: VALID_GPX,
      fileName: "pipeline.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.raw,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });

    expect(result.analysisMode).toBe(ANALYSIS_MODES.raw);
    expect(result.analysis).toMatchObject({ mode: ANALYSIS_MODES.raw });
  });

  it("does not analyze tracks with blocking validation errors", async () => {
    const result = await analyzeTrackSourceForUi({
      source: ONE_POINT_GPX,
      fileName: "one-point.gpx",
      fileSizeBytes: 512,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });

    expect(result.validation.errors).toEqual([
      { code: "insufficient_points", messageKey: "messages.insufficientPoints" }
    ]);
    expect(result.analysis).toBeNull();
  });

  it("treats flat GPX point timestamps as missing time without blocking analysis", async () => {
    const result = await analyzeTrackSourceForUi({
      source: FLAT_TIMESTAMP_GPX,
      fileName: "placeholder-time.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });

    expect(result.validation.errors).toEqual([]);
    expect(result.validation.warnings).toContainEqual({
      code: "missing_time",
      messageKey: "messages.missingTime"
    });
    expect(result.parsed.hasTime).toBe(false);
    expect(result.parsed.points.every((point) => point.timestamp === null)).toBe(true);
    expect(result.analysis?.routePoints).toHaveLength(3);
    expect(result.analysis?.totalDistanceMeters).toBeGreaterThan(120);
    expect(result.analysis?.movingDurationSeconds).toBeNull();
  });

  it("does not stitch distance or elapsed time across separate GPX tracks", async () => {
    const result = await analyzeTrackSourceForUi({
      source: DISCONNECTED_MULTI_TRACK_GPX,
      fileName: "disconnected.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });

    expect(result.validation.errors).toEqual([]);
    expect(result.parsed.points.map((point) => point.segmentIndex)).toEqual([0, 0, 1, 1]);
    expect(result.analysis?.totalDistanceMeters).toBeGreaterThan(20);
    expect(result.analysis?.totalDistanceMeters).toBeLessThan(40);
    expect(result.analysis?.totalDurationSeconds).toBe(120);
  });

  it("treats geometry-inconsistent GPX point timestamps as missing before filtered analysis", async () => {
    const result = await analyzeTrackSourceForUi({
      source: syntheticTimeRouteGpx(),
      fileName: "synthetic-time-distance-route.gpx",
      fileSizeBytes: 4096,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });

    expect(result.validation.errors).toEqual([]);
    expect(result.validation.warnings).toContainEqual({
      code: "missing_time",
      messageKey: "messages.missingTime"
    });
    expect(result.parsed.hasTime).toBe(false);
    expect(result.parsed.points.every((point) => point.timestamp === null)).toBe(true);
    expect(result.analysis?.routePoints).toHaveLength(26);
    expect(result.analysis?.totalDistanceMeters).toBeCloseTo(125000, -3);
    expect(result.analysis?.movingDurationSeconds).toBeNull();
  });

  it("uses the injected terrain fetcher before validation and analysis", async () => {
    const noElevation = VALID_GPX.replaceAll(/<ele>[^<]+<\/ele>/g, "");
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [620, 640, 700] })
    }));

    const result = await analyzeTrackSourceForUi({
      source: noElevation,
      fileName: "terrain.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered,
      terrainElevationProviderEnabled: true,
      fetcher
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.parsed.elevationSource).toBe("terrain");
    expect(result.analysisMode).toBe(ANALYSIS_MODES.terrain);
    expect(result.validation.warnings).toEqual([
      { code: "terrain_elevation", messageKey: "messages.terrainElevation" }
    ]);
  });

  it("does not request terrain elevation when the terrain provider is disabled", async () => {
    const noElevation = VALID_GPX.replaceAll(/<ele>[^<]+<\/ele>/g, "");
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [620, 640, 700] })
    }));

    const result = await analyzeTrackSourceForUi({
      source: noElevation,
      fileName: "terrain.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered,
      fetcher
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.parsed.elevationSource).toBe("none");
    expect(result.analysisMode).toBe(ANALYSIS_MODES.filtered);
  });

  it("replaces parsed track elevation from terrain on demand", async () => {
    const prepared = await analyzeTrackSourceForUi({
      source: VALID_GPX,
      fileName: "pipeline.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [621, 641, 701] })
    }));

    const enriched = await enrichParsedTrackFromTerrainForUi(prepared.parsed, {
      mode: "replace",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(enriched.elevationSource).toBe("terrain");
    expect(enriched.provenance?.terrainElevation).toMatchObject({
      mode: "replacement",
      status: "applied",
      pointCount: 3
    });
  });

  it("recomputes a selected UI analysis for an already parsed track", async () => {
    const prepared = await analyzeTrackSourceForUi({
      source: VALID_GPX,
      fileName: "pipeline.gpx",
      fileSizeBytes: 1024,
      previousAnalysisMode: ANALYSIS_MODES.filtered,
      previousDefaultMode: ANALYSIS_MODES.filtered
    });

    const analysis = analyzeParsedTrackForUi(prepared.parsed, ANALYSIS_MODES.raw);

    expect(analysis).toMatchObject({ mode: ANALYSIS_MODES.raw });
    expect(analysis).not.toHaveProperty("availableSummaries");
  });
});
