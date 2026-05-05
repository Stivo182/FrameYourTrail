import { describe, expect, it } from "vitest";
import {
  analyzeParsedTrack,
  getAvailableAnalysisModes,
  getDefaultAnalysisMode,
  isAnalysisModeAvailable
} from "../../src/core/metric-modes.js";
import {
  getSelectableAnalysisModes,
  isAnalysisModeSelectable
} from "../../src/core/analysis-modes.js";
import { parseTcx } from "../../src/core/tcx-parser.js";

const point = (latitude, longitude, elevation, elevationSource = "gpx", secondsFromStart = 0) => {
  const source = /** @type {"gpx" | "terrain" | "none"} */ (elevationSource);

  return {
    latitude,
    longitude,
    elevation,
    elevationSource: source,
    timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, secondsFromStart)),
    segmentIndex: 0
  };
};

const timedPointAtMeters = (distanceMeters, secondsFromStart) => ({
  latitude: 0,
  longitude: distanceMeters / 111319.49079327357,
  elevation: 10,
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, secondsFromStart)),
  segmentIndex: 0
});

describe("analyzeParsedTrack", () => {
  it("returns selected and available summaries for imported, raw, and filtered modes", () => {
    const parsed = {
      fileName: "with-summary.gpx",
      name: "With Summary",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        totalDistanceMeters: 1000,
        totalDistance3dMeters: 1004.5,
        totalDurationSeconds: 700,
        movingDurationSeconds: 600,
        elevationGainMeters: 10,
        elevationLossMeters: 8,
        minElevationMeters: 90,
        maxElevationMeters: 105,
        elevationRangeMeters: 999,
        sourceTag: "gpx_extensions"
      },
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 101, "gpx", 60),
        point(43.102, 42.102, 100, "gpx", 120)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "imported_summary" });

    expect(result.mode).toBe("imported_summary");
    expect(result.totalDistanceMeters).toBe(1000);
    expect(result.availableSummaries.imported_summary).toMatchObject({
      mode: "imported_summary",
      totalDistanceMeters: 1000
    });
    expect(result.totalDistance3dMeters).toBe(1004.5);
    expect(result.stoppedDurationSeconds).toBe(100);
    expect(result.elevationRangeMeters).toBe(999);
    expect(result.availableSummaries.imported_summary).toMatchObject({
      totalDistance3dMeters: 1004.5,
      stoppedDurationSeconds: 100,
      elevationRangeMeters: 999
    });
    expect(result.availableSummaries.recomputed_raw).toMatchObject({
      mode: "recomputed_raw",
      elevationGainMeters: 0
    });
    expect(result.availableSummaries.recomputed_filtered).toMatchObject({
      mode: "recomputed_filtered"
    });
    expect(result.provenance.confidenceFlags).toContain("summary_imported");
    expect(result.auditTrail.find((stage) => stage.id === "input")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mode",
          rawValue: "imported_summary",
          value: "imported_summary"
        })
      ])
    );
    expect(result.auditTrail.find((stage) => stage.id === "summary")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "distance",
          rawValue: 1000,
          value: "1000 m"
        }),
        expect.objectContaining({
          id: "source",
          rawValue: "gpx_extensions",
          value: "gpx_extensions"
        })
      ])
    );
  });

  it("preserves explicit imported stopped duration when moving duration is missing", () => {
    const parsed = {
      fileName: "partial-stopped-summary.gpx",
      name: "Partial Stopped Summary",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        totalDurationSeconds: 700,
        stoppedDurationSeconds: 100,
        sourceTag: "gpx_extensions"
      },
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 101, "gpx", 60),
        point(43.102, 42.102, 100, "gpx", 120)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "imported_summary" });

    expect(result.stoppedDurationSeconds).toBe(100);
    expect(result.availableSummaries.imported_summary).toMatchObject({
      totalDurationSeconds: 700,
      movingDurationSeconds: null,
      stoppedDurationSeconds: 100
    });
  });

  it("does not expose computed moving-time provenance in imported summary mode", () => {
    const parsed = {
      fileName: "imported-with-timer.fit",
      name: "Imported With Timer",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        totalDurationSeconds: 300,
        movingDurationSeconds: 180,
        sourceTag: "fit_session"
      },
      provenance: {
        timerEvents: {
          count: 2,
          events: [
            { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
            { timestamp: "2024-05-25T08:01:00.000Z", eventType: "stop_all" }
          ]
        }
      },
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 101, "gpx", 60),
        point(43.102, 42.102, 102, "gpx", 120),
        point(43.103, 42.103, 103, "gpx", 180),
        point(43.104, 42.104, 104, "gpx", 240),
        point(43.105, 42.105, 105, "gpx", 300)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "imported_summary" });

    expect(result.movingDurationSeconds).toBe(180);
    expect(result.provenance.filtersApplied).toContain("imported_summary");
    expect(result.provenance.filtersApplied).not.toContain("moving_time_timer_events");
    expect(result.provenance.filtersApplied).not.toContain("moving_time_hysteresis");
    expect(result.provenance.confidenceFlags).toContain("summary_imported");
    expect(result.provenance.confidenceFlags).not.toContain("moving_time_timer_events");
    expect(result.provenance.confidenceFlags).not.toContain("moving_time_heuristic");
  });

  it("does not invent imported stopped duration from total duration alone", () => {
    const parsed = {
      fileName: "total-only-summary.gpx",
      name: "Total Only Summary",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        totalDurationSeconds: 700,
        sourceTag: "gpx_extensions"
      },
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 101, "gpx", 60),
        point(43.102, 42.102, 100, "gpx", 120)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "imported_summary" });

    expect(result.stoppedDurationSeconds).not.toBe(700);
    expect(result.availableSummaries.imported_summary).toMatchObject({
      totalDurationSeconds: 700,
      movingDurationSeconds: null,
      stoppedDurationSeconds: null
    });
  });

  it("does not replace computed canonical distance with a null imported field", () => {
    const parsed = {
      fileName: "partial-3d-summary.gpx",
      name: "Partial 3D Summary",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        totalDistance3dMeters: 1004.5,
        sourceTag: "gpx_extensions"
      },
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 101, "gpx", 60),
        point(43.102, 42.102, 100, "gpx", 120)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "imported_summary" });

    expect(result.mode).toBe("imported_summary");
    expect(result.totalDistanceMeters).toBeGreaterThan(0);
    expect(result.totalDistance3dMeters).toBe(1004.5);
    expect(result.availableSummaries.imported_summary).toMatchObject({
      totalDistanceMeters: null,
      totalDistance3dMeters: 1004.5
    });
  });

  it("keeps filtered as default when an imported distance total is available", () => {
    const parsed = {
      fileName: "default-file-total.gpx",
      name: "Default File Total",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        totalDistanceMeters: 62500,
        sourceTag: "gpx_extensions"
      },
      points: [point(43.1, 42.1, 100, "gpx", 0), point(43.101, 42.101, 101, "gpx", 60)]
    };

    const result = analyzeParsedTrack(parsed, { includeAvailableSummaries: false });

    expect(result.mode).toBe("recomputed_filtered");
    expect(result.totalDistanceMeters).not.toBe(62500);
    expect(result.provenance.filtersApplied).not.toContain("imported_summary");
  });

  it("preserves imported max speed and elevation range when only those summary fields exist", () => {
    const parsed = {
      fileName: "partial-speed-range-summary.gpx",
      name: "Partial Speed and Range Summary",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        maxSpeedKmh: 42.5,
        elevationRangeMeters: 275,
        sourceTag: "gpx_extensions"
      },
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 100, "gpx", 60),
        point(43.102, 42.102, 100, "gpx", 120)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "imported_summary" });

    expect(result.mode).toBe("imported_summary");
    expect(result.maxSpeedKmh).toBe(42.5);
    expect(result.elevationRangeMeters).toBe(275);
    expect(result.availableSummaries.imported_summary).toMatchObject({
      maxSpeedKmh: 42.5,
      elevationRangeMeters: 275,
      minElevationMeters: null,
      maxElevationMeters: null
    });
  });

  it("keeps missing imported summary fields null and derives elevation range from min and max", () => {
    const parsed = {
      fileName: "partial-null-summary.gpx",
      name: "Partial Null Summary",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: {
        mode: "imported_summary",
        totalDistanceMeters: null,
        totalDistance3dMeters: null,
        totalDurationSeconds: null,
        movingDurationSeconds: null,
        stoppedDurationSeconds: null,
        averageSpeedKmh: null,
        movingAverageSpeedKmh: null,
        overallAverageSpeedKmh: null,
        maxSpeedKmh: null,
        elevationGainMeters: null,
        elevationLossMeters: null,
        minElevationMeters: 620,
        maxElevationMeters: 645,
        elevationRangeMeters: null,
        sourceTag: "gpx_extensions"
      },
      points: [point(43.1, 42.1, 620, "gpx", 0), point(43.101, 42.101, 645, "gpx", 60)]
    };

    const result = analyzeParsedTrack(parsed, { mode: "imported_summary" });

    expect(result.availableSummaries.imported_summary).toMatchObject({
      totalDistanceMeters: null,
      totalDistance3dMeters: null,
      totalDurationSeconds: null,
      movingDurationSeconds: null,
      stoppedDurationSeconds: null,
      averageSpeedKmh: null,
      movingAverageSpeedKmh: null,
      overallAverageSpeedKmh: null,
      maxSpeedKmh: null,
      elevationGainMeters: null,
      elevationLossMeters: null,
      minElevationMeters: 620,
      maxElevationMeters: 645,
      elevationRangeMeters: 25
    });
  });

  it("keeps TCX ActivityExtension speed as metadata for recomputed raw metrics", () => {
    const source = `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
      xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
      <Activities>
        <Activity Sport="Running">
          <Id>2024-05-25T08:00:00Z</Id>
          <Lap StartTime="2024-05-25T08:00:00Z">
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:00:00Z</Time>
                <Position>
                  <LatitudeDegrees>43.1</LatitudeDegrees>
                  <LongitudeDegrees>42.1</LongitudeDegrees>
                </Position>
                <AltitudeMeters>100</AltitudeMeters>
                <Extensions>
                  <ns3:TPX>
                    <ns3:Speed>20</ns3:Speed>
                  </ns3:TPX>
                </Extensions>
              </Trackpoint>
              <Trackpoint>
                <Time>2024-05-25T08:01:00Z</Time>
                <Position>
                  <LatitudeDegrees>43.1001</LatitudeDegrees>
                  <LongitudeDegrees>42.1</LongitudeDegrees>
                </Position>
                <AltitudeMeters>100</AltitudeMeters>
                <Extensions>
                  <ns3:TPX>
                    <ns3:Speed>20</ns3:Speed>
                  </ns3:TPX>
                </Extensions>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const parsed = parseTcx(source, "activity-extension-speed.tcx");
    const result = analyzeParsedTrack(parsed, { mode: "recomputed_raw" });

    expect(parsed.points[0].tcxActivityExtension?.speedMetersPerSecond).toBe(20);
    expect(result.maxSpeedKmh).toBeGreaterThan(0);
    expect(result.maxSpeedKmh).toBeLessThan(2);
    expect(result.maxSpeedKmh).not.toBeCloseTo(72);
  });

  it("accepts the legacy filtered mode identifier without exposing it in the result", () => {
    const parsed = {
      fileName: "legacy.gpx",
      name: "Legacy",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: null,
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 106, "gpx", 60),
        point(43.102, 42.102, 100, "gpx", 120)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "recomputed_basecamp" });

    expect(result.mode).toBe("recomputed_filtered");
    expect(result.availableSummaries.recomputed_filtered).toMatchObject({
      mode: "recomputed_filtered"
    });
  });

  it("uses explicit timer events for computed moving duration before speed hysteresis", () => {
    const parsed = {
      fileName: "timer-events.fit",
      name: "Timer Events",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: null,
      provenance: {
        timerEvents: {
          count: 4,
          events: [
            { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
            { timestamp: "2024-05-25T08:01:00.000Z", eventType: "stop_all" },
            { timestamp: "2024-05-25T08:04:00.000Z", eventType: "start" },
            { timestamp: "2024-05-25T08:05:00.000Z", eventType: "stop_all" }
          ]
        }
      },
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 101, "gpx", 60),
        point(43.102, 42.102, 102, "gpx", 120),
        point(43.103, 42.103, 103, "gpx", 180),
        point(43.104, 42.104, 104, "gpx", 240),
        point(43.105, 42.105, 105, "gpx", 300)
      ]
    };

    const result = analyzeParsedTrack(parsed, { mode: "recomputed_filtered" });

    expect(result.movingDurationSeconds).toBe(120);
    expect(result.stoppedDurationSeconds).toBe(180);
    expect(result.provenance.filtersApplied).toContain("moving_time_timer_events");
    expect(result.provenance.filtersApplied).not.toContain("moving_time_hysteresis");
    expect(result.provenance.confidenceFlags).toContain("moving_time_timer_events");
    expect(result.provenance.confidenceFlags).not.toContain("moving_time_heuristic");
    expect(result.confidenceFlags).toContain("moving_time_timer_events");
    expect(result.confidenceFlags).not.toContain("moving_time_heuristic");
  });

  it("passes explicit parsed activity into elevation diagnostics", () => {
    const parsed = {
      fileName: "typed-track.gpx",
      name: "Typed Track",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: null,
      activity: /** @type {const} */ ({
        type: "bike",
        source: "gpx_track_type",
        raw: "cycling"
      }),
      points: [point(43.1, 42.1, 100, "gpx", 0), point(43.1001, 42.1001, 101, "gpx", 600)]
    };

    const result = analyzeParsedTrack(parsed, {
      mode: "recomputed_filtered",
      includeAvailableSummaries: false
    });

    expect(result.diagnostics.elevation.activityAssessment).toMatchObject({
      inferred: "bike",
      confidence: 0.95,
      reasonCodes: ["explicit_activity"],
      explicit: { type: "bike", source: "gpx_track_type", raw: "cycling" }
    });
  });

  it("keeps sustained fast samples without source-derived speed reliability", () => {
    const parsed = {
      fileName: "source-hike.gpx",
      name: "Source Hike",
      points: [
        timedPointAtMeters(0, 0),
        timedPointAtMeters(22, 1),
        timedPointAtMeters(44, 2),
        timedPointAtMeters(66, 3)
      ],
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: null,
      provenance: {
        format: "gpx",
        pointCount: 4,
        segmentCount: 1
      }
    };

    const result = analyzeParsedTrack(parsed, {
      mode: "recomputed_filtered",
      includeAvailableSummaries: false
    });

    expect(result.routePoints).toHaveLength(4);
    expect(result.provenance.pointsRemoved).toBe(0);
    expect(result.provenance.filtersApplied).not.toContain("speed_outlier");
    expect(result.maxSpeedKmh).toBeGreaterThan(75);
    expect(result.diagnostics.speed.thresholds.speedReliabilityProfileSource).toBe(
      "cleaning_profile"
    );
  });

  it("selects terrain mode when the parsed track was restored from terrain elevation", () => {
    const parsed = {
      fileName: "terrain.gpx",
      name: "Terrain",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"terrain"} */ ("terrain"),
      importedSummary: null,
      points: [
        point(43.1, 42.1, 100, "terrain", 0),
        point(43.101, 42.101, 112, "terrain", 60),
        point(43.102, 42.102, 100, "terrain", 120)
      ]
    };

    const result = analyzeParsedTrack(parsed);

    expect(result.mode).toBe("recomputed_terrain");
    expect(result.availableSummaries.recomputed_terrain).toMatchObject({
      mode: "recomputed_terrain",
      elevationSource: "terrain"
    });
    expect(result.provenance.confidenceFlags).toContain("elevation_dem_corrected");
  });

  it("hides terrain replacement by default before GPX elevation is enriched", () => {
    const parsed = {
      fileName: "normal-gpx.gpx",
      name: "Normal GPX",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: null,
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 106, "gpx", 60),
        point(43.102, 42.102, 101, "gpx", 120)
      ]
    };

    expect(getAvailableAnalysisModes(parsed)).not.toContain("recomputed_terrain");
    expect(getSelectableAnalysisModes(parsed)).not.toContain("recomputed_terrain");
    expect(isAnalysisModeAvailable(parsed, "recomputed_terrain")).toBe(false);
    expect(isAnalysisModeSelectable(parsed, "recomputed_terrain")).toBe(false);
    expect(isAnalysisModeSelectable(parsed, "recomputed_basecamp")).toBe(true);

    const result = analyzeParsedTrack(parsed, { mode: "recomputed_terrain" });

    expect(result.mode).toBe("recomputed_filtered");
    expect(result.summary.elevationSource).toBe("gpx");
  });

  it("makes terrain replacement selectable when explicitly allowed", () => {
    const parsed = {
      fileName: "normal-gpx.gpx",
      name: "Normal GPX",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"gpx"} */ ("gpx"),
      importedSummary: null,
      points: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 106, "gpx", 60),
        point(43.102, 42.102, 101, "gpx", 120)
      ]
    };

    const options = { allowTerrainReplacement: true };

    expect(getSelectableAnalysisModes(parsed, options)).toContain("recomputed_terrain");
    expect(isAnalysisModeSelectable(parsed, "recomputed_terrain", options)).toBe(true);
    expect(isAnalysisModeAvailable(parsed, "recomputed_terrain")).toBe(false);
  });

  it("keeps filtered as default after explicit terrain replacement while exposing terrain mode", () => {
    const parsed = {
      fileName: "terrain-replacement.gpx",
      name: "Terrain Replacement",
      hasElevation: true,
      hasTime: true,
      elevationSource: /** @type {"terrain"} */ ("terrain"),
      importedSummary: null,
      provenance: {
        terrainElevation: {
          mode: /** @type {const} */ ("replacement"),
          status: /** @type {const} */ ("applied"),
          pointCount: 3
        }
      },
      rawPoints: [
        point(43.1, 42.1, 100, "gpx", 0),
        point(43.101, 42.101, 106, "gpx", 60),
        point(43.102, 42.102, 101, "gpx", 120)
      ],
      points: [
        point(43.1, 42.1, 90, "terrain", 0),
        point(43.101, 42.101, 118, "terrain", 60),
        point(43.102, 42.102, 95, "terrain", 120)
      ]
    };

    expect(getDefaultAnalysisMode(parsed)).toBe("recomputed_filtered");

    const defaultResult = analyzeParsedTrack(parsed);

    expect(defaultResult.mode).toBe("recomputed_filtered");
    expect(defaultResult.summary.elevationSource).toBe("gpx");

    const terrainResult = analyzeParsedTrack(parsed, { mode: "recomputed_terrain" });

    expect(terrainResult.mode).toBe("recomputed_terrain");
    expect(terrainResult.summary.elevationSource).toBe("terrain");
  });
});
