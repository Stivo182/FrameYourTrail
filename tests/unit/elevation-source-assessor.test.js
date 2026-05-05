import { describe, expect, it } from "vitest";
import { assessElevationSources } from "../../src/core/elevation-source-assessor.js";

/**
 * @param {number} index
 * @param {number} elevation
 * @param {"barometric" | "terrain" | "gpx" | "none" | undefined} elevationSource
 * @param {number} segmentIndex
 */
const point = (index, elevation, elevationSource = "gpx", segmentIndex = 0) => ({
  latitude: 55 + index * 0.0001,
  longitude: 37,
  elevation,
  elevationSource,
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, index * 10)),
  segmentIndex
});

/**
 * @param {number} index
 * @param {number} elevation
 */
const sparseMountainPoint = (index, elevation) => ({
  latitude: 55 + index * 0.009,
  longitude: 37,
  elevation,
  elevationSource: /** @type {const} */ ("gpx"),
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, 0) + index * 600_000),
  segmentIndex: 0
});

const withoutSegmentIndex = (item) => {
  const rest = { ...item };
  Reflect.deleteProperty(rest, "segmentIndex");
  return rest;
};

describe("assessElevationSources", () => {
  it("keeps barometric relative trust when absolute drift is suspected", () => {
    const points = Array.from({ length: 30 }, (_item, index) =>
      point(index, 100 + index * 0.7 + Math.sin(index / 4) * 0.05, "barometric")
    );

    const result = assessElevationSources(points);

    expect(result.primaryRelativeSource).toBe("barometric");
    expect(result.baroRelTrust).toBeGreaterThanOrEqual(0.8);
    expect(result.baroAbsTrust).toBeLessThan(result.baroRelTrust);
    expect(result.assessments.barometric.reasonCodes).toContain("barometric_relative_signal");
    expect(result.assessments.barometric.reasonCodes).toContain(
      "barometric_absolute_drift_possible"
    );
    expect(result.assessments.barometric.reasonCodes).not.toContain(
      "barometric_low_relief_chatter"
    );
  });

  it("downgrades barometric relative trust for vertical spikes", () => {
    const elevations = [100, 100.3, 132, 100.6, 100.9, 101.2];
    const points = elevations.map((elevation, index) => point(index, elevation, "barometric"));

    const result = assessElevationSources(points);

    expect(result.baroRelTrust).toBeLessThan(0.7);
    expect(result.baroAbsTrust).toBeLessThan(result.baroRelTrust);
    expect(result.assessments.barometric.reasonCodes).toContain("barometric_relative_signal");
    expect(result.assessments.barometric.reasonCodes).toContain("barometric_vertical_spikes");
    expect(result.assessments.barometric.reasonCodes).not.toContain(
      "barometric_absolute_drift_possible"
    );
  });

  it("does not let a clean barometric drift run mask spikes in another run", () => {
    const driftRun = Array.from({ length: 30 }, (_item, index) =>
      point(index, 100 + index * 0.7 + Math.sin(index / 4) * 0.05, "barometric", 0)
    );
    const spikeElevations = [200, 200.3, 232, 200.6, 200.9, 201.2];
    const spikeRun = spikeElevations.map((elevation, index) =>
      point(index + driftRun.length, elevation, "barometric", 1)
    );

    const result = assessElevationSources([...driftRun, ...spikeRun]);

    expect(result.baroRelTrust).toBeLessThan(0.7);
    expect(result.baroAbsTrust).toBeLessThan(result.baroRelTrust);
    expect(result.assessments.barometric.reasonCodes).toContain(
      "barometric_absolute_drift_possible"
    );
    expect(result.assessments.barometric.reasonCodes).toContain("barometric_vertical_spikes");
  });

  it("labels low-relief barometric chatter separately from absolute drift", () => {
    const points = Array.from({ length: 30 }, (_item, index) =>
      point(index, 100 + (index % 2 === 0 ? 0 : 0.4), "barometric")
    );

    const result = assessElevationSources(points);

    expect(result.primaryRelativeSource).toBe("barometric");
    expect(result.baroRelTrust).toBeGreaterThanOrEqual(0.8);
    expect(result.baroAbsTrust).toBeLessThan(result.baroRelTrust);
    expect(result.assessments.barometric.reasonCodes).toContain("barometric_low_relief_chatter");
    expect(result.assessments.barometric.reasonCodes).not.toContain(
      "barometric_absolute_drift_possible"
    );
  });

  it("uses terrain as the primary absolute source without making it the relative source", () => {
    const points = Array.from({ length: 12 }, (_item, index) =>
      point(index, index % 2 === 0 ? 100 : 112, "terrain")
    );

    const result = assessElevationSources(points);

    expect(result.primaryAbsoluteSource).toBe("terrain");
    expect(result.terrainAbsTrust).toBeGreaterThanOrEqual(0.7);
    expect(result.terrainRelTrust).toBeLessThanOrEqual(0.5);
  });

  it("downgrades noisy gps relative trust", () => {
    const points = Array.from({ length: 60 }, (_item, index) =>
      point(index, 100 + Math.sin(index) * 8 + (index % 11 === 0 ? 20 : 0), "gpx")
    );

    const result = assessElevationSources(points);

    expect(result.gpsRelTrust).toBeLessThan(0.5);
    expect(result.assessments.gpx.reasonCodes).toContain("gps_vertical_noise");
  });

  it("does not treat sparse plausible mountain grade as GPS vertical noise", () => {
    const points = [100, 180, 260, 340, 420].map((elevation, index) =>
      sparseMountainPoint(index, elevation)
    );

    const result = assessElevationSources(points);

    expect(result.gpsRelTrust).toBeGreaterThanOrEqual(0.6);
    expect(result.assessments.gpx.reasonCodes).toContain("gps_low_noise");
    expect(result.assessments.gpx.reasonCodes).not.toContain("gps_vertical_noise");
    expect(result.assessments.gpx.p95DeltaMeters).toBeGreaterThan(8);
    expect(result.assessments.gpx.medianSampleDistanceMeters).toBeGreaterThan(900);
    expect(result.assessments.gpx.p95Grade).toBeLessThan(0.1);
  });

  it("does not count source or segment boundary jumps as noise", () => {
    const points = [
      ...Array.from({ length: 2 }, (_item, index) => point(index, 100 + index * 0.4, "gpx", 0)),
      ...Array.from({ length: 2 }, (_item, index) => point(index + 2, 500 + index * 0.4, "gpx", 1)),
      ...Array.from({ length: 2 }, (_item, index) => point(index + 4, 100 + index * 0.4, "gpx", 2)),
      ...Array.from({ length: 2 }, (_item, index) => point(index + 6, 500 + index * 0.4, "gpx", 3))
    ];

    const result = assessElevationSources(points);

    expect(result.gpsRelTrust).toBeGreaterThanOrEqual(0.6);
    expect(result.assessments.gpx.reasonCodes).toContain("gps_low_noise");
    expect(result.assessments.gpx.reasonCodes).not.toContain("gps_vertical_noise");
    expect(result.assessments.gpx.p95DeltaMeters).toBeLessThan(1);
    expect(result.assessments.gpx.rawChangeToRangeRatio).toBeLessThan(2);
  });

  it("normalizes missing segment indexes the same way as fusion continuity", () => {
    const points = [
      withoutSegmentIndex(point(0, 100, "gpx", 0)),
      point(1, 100.4, "gpx", 0),
      withoutSegmentIndex(point(2, 100.8, "gpx", 0))
    ];

    const result = assessElevationSources(points);

    expect(result.gpsRelTrust).toBeGreaterThanOrEqual(0.6);
    expect(result.assessments.gpx.reasonCodes).toContain("gps_low_noise");
    expect(result.assessments.gpx.continuousPairCount).toBe(2);
  });

  it("does not count declared time-gap discontinuities as source noise", () => {
    const points = [100, 101, 102, 500, 501, 502].map((elevation, index) =>
      point(index, elevation, "gpx")
    );

    const result = assessElevationSources(points, {
      timeGapBreakIndexes: new Set([3])
    });

    expect(result.gpsRelTrust).toBeGreaterThanOrEqual(0.6);
    expect(result.assessments.gpx.reasonCodes).toContain("gps_low_noise");
    expect(result.assessments.gpx.reasonCodes).not.toContain("gps_vertical_noise");
    expect(result.assessments.gpx.p95DeltaMeters).toBeLessThan(2);
    expect(result.assessments.gpx.rawChangeToRangeRatio).toBeLessThan(2);
  });

  it("does not count sub-threshold declared time-gap pairs as dense source noise", () => {
    const points = [100, 101, 102, 150, 151, 152].map((elevation, index) =>
      point(index, elevation, "gpx")
    );

    const result = assessElevationSources(points, {
      timeGapBreakIndexes: new Set([3])
    });

    expect(result.gpsRelTrust).toBeGreaterThanOrEqual(0.6);
    expect(result.assessments.gpx.reasonCodes).toContain("gps_low_noise");
    expect(result.assessments.gpx.reasonCodes).not.toContain("gps_vertical_noise");
    expect(result.assessments.gpx.p95DeltaMeters).toBeLessThan(2);
    expect(result.assessments.gpx.continuousPairCount).toBe(4);
  });

  it("requires continuous source pairs before assigning relative trust", () => {
    const points = [
      point(0, 100, "gpx", 0),
      point(1, Number.NaN, "gpx", 0),
      point(2, 102, "gpx", 0),
      point(3, 200, "gpx", 1)
    ];

    const result = assessElevationSources(points);

    expect(result.gpsRelTrust).toBeLessThan(0.2);
    expect(result.assessments.gpx.sampleCount).toBe(3);
    expect(result.assessments.gpx.continuousPairCount).toBe(0);
    expect(result.assessments.gpx.p75DeltaMeters).toBeNull();
    expect(result.assessments.gpx.p95DeltaMeters).toBeNull();
    expect(result.assessments.gpx.rawChangeToRangeRatio).toBeNull();
    expect(result.assessments.gpx.reasonCodes).toContain("insufficient_continuous_pairs");
    expect(result.assessments.gpx.reasonCodes).not.toContain("gps_low_noise");
  });

  it("normalizes missing or none elevation sources to unknown and ignores invalid elevations", () => {
    const points = [
      { ...point(0, 100), elevationSource: undefined },
      point(1, Number.NaN, "none"),
      point(2, 101, "none"),
      point(3, Number.POSITIVE_INFINITY, "gpx")
    ];

    const result = assessElevationSources(points);

    expect(result.unknownRelTrust).toBeLessThan(0.2);
    expect(result.unknownAbsTrust).toBe(0);
    expect(result.assessments.unknown.sampleCount).toBe(2);
    expect(result.assessments.unknown.continuousPairCount).toBe(0);
    expect(result.assessments.unknown.p75DeltaMeters).toBeNull();
    expect(result.assessments.unknown.p95DeltaMeters).toBeNull();
    expect(result.assessments.unknown.rawChangeToRangeRatio).toBeNull();
    expect(result.assessments.unknown.reasonCodes).toContain("insufficient_continuous_pairs");
    expect(result.assessments.gpx.sampleCount).toBe(0);
    expect(result.assessments.gpx.p75DeltaMeters).toBeNull();
    expect(result.assessments.gpx.p95DeltaMeters).toBeNull();
    expect(result.assessments.gpx.rawChangeToRangeRatio).toBeNull();
  });
});
