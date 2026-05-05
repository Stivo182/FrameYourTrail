import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatMetricRegressionReport,
  runMetricRegressionCases,
  runMetricRegressionManifest
} from "../../scripts/metric-regression-runner.mjs";

const manifestPath = resolve("tests/fixtures/filtered-golden.json");

describe("metric regression runner", () => {
  it("passes committed golden cases with metric tolerances", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "valid-track-filtered",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          expected: {
            totalDistanceMeters: 1132.89,
            elevationGainMeters: 125
          },
          tolerance: {
            totalDistanceMeters: 0.01,
            elevationGainMeters: 0.5
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.cases[0]).toMatchObject({
      id: "valid-track-filtered",
      mode: "recomputed_filtered",
      passed: true
    });
  });

  it("returns readable metric failures without stopping at the first mismatch", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "valid-track-filtered",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          expected: {
            totalDistanceMeters: 1,
            elevationGainMeters: 1
          },
          tolerance: {
            totalDistanceMeters: 0,
            elevationGainMeters: 0
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "totalDistanceMeters",
        expected: 1
      }),
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "elevationGainMeters",
        expected: 1
      })
    ]);
  });

  it("fails numeric comparisons when the actual metric is unavailable", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "no-elevation",
          file: "no-elevation.gpx",
          mode: "recomputed_filtered",
          expected: {
            elevationGainMeters: 0
          },
          tolerance: {
            elevationGainMeters: 0
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "no-elevation",
        metric: "elevationGainMeters",
        actual: null,
        expected: 0
      })
    ]);
  });

  it("can apply deterministic terrain elevations from a manifest case", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "terrain-restored",
          file: "no-elevation.gpx",
          mode: "recomputed_terrain",
          terrainElevations: [100, 112],
          expected: {
            elevationGainMeters: 12,
            elevationLossMeters: 0
          },
          tolerance: {
            elevationGainMeters: 0,
            elevationLossMeters: 0
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(true);
    expect(result.cases[0]).toMatchObject({
      id: "terrain-restored",
      mode: "recomputed_terrain",
      passed: true
    });
  });

  it("parses XML, TCX, and FIT metric cases through the app parser facade", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "metric-xml-route-filtered",
          file: "metric-gpx-like-route.xml",
          mediaType: "application/xml",
          mode: "recomputed_filtered",
          tags: {
            format: "xml"
          },
          expected: {
            totalDistanceMeters: 111.32
          },
          tolerance: {
            totalDistanceMeters: 0.05
          }
        },
        {
          id: "metric-tcx-lap-imported",
          file: "metric-tcx-lap-summary.tcx",
          mediaType: "application/vnd.garmin.tcx+xml",
          mode: "imported_summary",
          tags: {
            format: "tcx",
            metricMode: "imported_summary"
          },
          expected: {
            totalDistanceMeters: 2400,
            totalDurationSeconds: 600,
            movingDurationSeconds: 600,
            maxSpeedKmh: 27
          },
          tolerance: {
            totalDistanceMeters: 0,
            totalDurationSeconds: 0,
            movingDurationSeconds: 0,
            maxSpeedKmh: 0
          }
        },
        {
          id: "metric-fit-session-imported",
          file: "minimal-activity.fit",
          mediaType: "application/octet-stream",
          mode: "imported_summary",
          tags: {
            format: "fit",
            metricMode: "imported_summary"
          },
          expected: {
            totalDistanceMeters: 600,
            totalDurationSeconds: 720,
            movingDurationSeconds: 700,
            movingAverageSpeedKmh: 3.6,
            maxSpeedKmh: 9
          },
          tolerance: {
            totalDistanceMeters: 0,
            totalDurationSeconds: 0,
            movingDurationSeconds: 0,
            movingAverageSpeedKmh: 0,
            maxSpeedKmh: 0
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.cases).toEqual([
      expect.objectContaining({
        id: "metric-xml-route-filtered",
        mode: "recomputed_filtered",
        passed: true
      }),
      expect.objectContaining({
        id: "metric-tcx-lap-imported",
        mode: "imported_summary",
        passed: true
      }),
      expect.objectContaining({
        id: "metric-fit-session-imported",
        mode: "imported_summary",
        passed: true
      })
    ]);
  });

  it("fails when required matrix coverage tags are missing", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "flat-baro",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          tags: {
            deviceType: "barometric",
            recordingMode: "smart",
            terrain: "rolling",
            format: "gpx"
          },
          expected: {
            totalDistanceMeters: 1132.89
          },
          tolerance: {
            totalDistanceMeters: 0.01
          }
        }
      ],
      {
        manifestPath,
        requiredCoverage: {
          deviceType: ["barometric", "phone"],
          recordingMode: ["smart", "sparse"],
          terrain: ["rolling"],
          format: ["gpx"]
        }
      }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "__coverage__",
        metric: "coverage.deviceType",
        actual: ["barometric"],
        expected: ["barometric", "phone"],
        missing: ["phone"]
      }),
      expect.objectContaining({
        caseId: "__coverage__",
        metric: "coverage.recordingMode",
        actual: ["smart"],
        expected: ["smart", "sparse"],
        missing: ["sparse"]
      })
    ]);
  });

  it("fails when required tag combinations are missing from an object manifest", async () => {
    const result = await runMetricRegressionManifest(
      {
        requiredCombinations: [
          { format: "gpx", metricMode: "recomputed_filtered" },
          { format: "tcx", metricMode: "imported_summary" }
        ],
        cases: [
          {
            id: "valid-track-filtered",
            file: "valid-track.gpx",
            mode: "recomputed_filtered",
            tags: {
              format: "gpx",
              metricMode: "recomputed_filtered"
            },
            expected: {
              totalDistanceMeters: 1132.89
            },
            tolerance: {
              totalDistanceMeters: 0.01
            }
          }
        ]
      },
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "__coverage__",
        metric: "coverage.combination",
        actual: [{ format: "gpx", metricMode: "recomputed_filtered" }],
        expected: [
          { format: "gpx", metricMode: "recomputed_filtered" },
          { format: "tcx", metricMode: "imported_summary" }
        ],
        missing: [{ format: "tcx", metricMode: "imported_summary" }]
      })
    ]);
  });

  it("runs object manifests with required matrix coverage", async () => {
    const result = await runMetricRegressionManifest(
      {
        requiredCoverage: {
          deviceType: ["barometric"],
          recordingMode: ["smart"],
          terrain: ["rolling"],
          format: ["gpx"]
        },
        cases: [
          {
            id: "valid-track-filtered",
            file: "valid-track.gpx",
            mode: "recomputed_filtered",
            tags: {
              deviceType: "barometric",
              recordingMode: "smart",
              terrain: "rolling",
              format: "gpx"
            },
            expected: {
              totalDistanceMeters: 1132.89
            },
            tolerance: {
              totalDistanceMeters: 0.01
            }
          }
        ]
      },
      { manifestPath }
    );

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.cases).toHaveLength(1);
  });

  it("trims matrix coverage values before comparing tags", async () => {
    const result = await runMetricRegressionManifest(
      {
        requiredCoverage: {
          deviceType: ["barometric"],
          recordingMode: [" smart "],
          terrain: ["rolling"],
          format: ["gpx"]
        },
        cases: [
          {
            id: "valid-track-filtered",
            file: "valid-track.gpx",
            mode: "recomputed_filtered",
            tags: {
              deviceType: " barometric ",
              recordingMode: "smart",
              terrain: "rolling",
              format: "gpx"
            },
            expected: {
              totalDistanceMeters: 1132.89
            },
            tolerance: {
              totalDistanceMeters: 0.01
            }
          }
        ]
      },
      { manifestPath }
    );

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when expected provenance flags are not present", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "valid-track-filtered",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          expected: {
            totalDistanceMeters: 1132.89
          },
          tolerance: {
            totalDistanceMeters: 0.01
          },
          expectedProvenance: {
            filtersApplied: ["imaginary_filter"],
            confidenceFlags: ["moving_time_heuristic"]
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "provenance.filtersApplied",
        actual: expect.arrayContaining(["distance_domain_fusion", "moving_time_hysteresis"]),
        expected: ["imaginary_filter"],
        missing: ["imaginary_filter"]
      })
    ]);
  });

  it("fails when expected audit stage values do not match", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "valid-track-filtered",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          expected: {
            totalDistanceMeters: 1132.89
          },
          tolerance: {
            totalDistanceMeters: 0.01
          },
          expectedAudit: {
            "cleaning.removedPoints": 1,
            "continuity.timeGaps": 0,
            "summary.flags": 1
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "audit.cleaning.removedPoints",
        actual: 0,
        expected: 1
      }),
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "audit.summary.flags",
        actual: 3,
        expected: 1
      })
    ]);
  });

  it("fails when expected audit paths are malformed", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "valid-track-filtered",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          expected: {
            totalDistanceMeters: 1132.89
          },
          tolerance: {
            totalDistanceMeters: 0.01
          },
          expectedAudit: {
            "summary.flags.extra": 2,
            summary: 2,
            ".flags": 2,
            "summary.": 2
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "audit.summary.flags.extra",
        actual: undefined,
        expected: 2
      }),
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "audit.summary",
        actual: undefined,
        expected: 2
      }),
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "audit..flags",
        actual: undefined,
        expected: 2
      }),
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "audit.summary.",
        actual: undefined,
        expected: 2
      })
    ]);
  });

  it("fails when expected diagnostic values do not match", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "valid-track-filtered",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          expected: {
            totalDistanceMeters: 1132.89
          },
          tolerance: {
            totalDistanceMeters: 0.01
          },
          expectedDiagnostics: {
            "sampling.recordingMode": "dense"
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "valid-track-filtered",
        metric: "diagnostics.sampling.recordingMode",
        actual: "sparse",
        expected: "dense"
      })
    ]);
  });

  it("supports recording mode alias in expected diagnostics", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "valid-track-filtered",
          file: "valid-track.gpx",
          mode: "recomputed_filtered",
          expected: {
            totalDistanceMeters: 1132.89
          },
          tolerance: {
            totalDistanceMeters: 0.01
          },
          expectedDiagnostics: {
            recordingMode: "sparse"
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("formats coverage failures with missing values", () => {
    const report = formatMetricRegressionReport({
      passed: false,
      cases: [{ id: "one" }],
      failures: [
        {
          caseId: "__coverage__",
          metric: "coverage.deviceType",
          actual: ["barometric"],
          expected: ["barometric", "phone"],
          missing: ["phone"]
        }
      ]
    });

    expect(report).toContain(
      "__coverage__.coverage.deviceType: actual=[barometric], expected=[barometric, phone], missing=[phone]"
    );
  });

  it("fails when the requested analysis mode falls back to another mode", async () => {
    const result = await runMetricRegressionCases(
      [
        {
          id: "typo-mode",
          file: "valid-track.gpx",
          mode: "typo_mode",
          expected: {
            totalDistanceMeters: 1132.89
          },
          tolerance: {
            totalDistanceMeters: 0.01
          }
        }
      ],
      { manifestPath }
    );

    expect(result.passed).toBe(false);
    expect(result.cases[0]).toMatchObject({
      id: "typo-mode",
      requestedMode: "typo_mode",
      mode: "recomputed_filtered",
      passed: false
    });
    expect(result.failures).toEqual([
      expect.objectContaining({
        caseId: "typo-mode",
        metric: "mode",
        actual: "recomputed_filtered",
        expected: "typo_mode"
      })
    ]);
  });
});
