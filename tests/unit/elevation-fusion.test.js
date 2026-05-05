import { describe, expect, it } from "vitest";
import {
  buildFusedElevationProfile,
  MAD_TO_SIGMA_SCALE,
  resampleElevationRunToDistanceGrid
} from "../../src/core/elevation-fusion.js";

/**
 * @param {number} index
 * @param {number} elevation
 * @param {"gpx" | "terrain"} [source]
 * @returns {import("../../src/core/route-types.js").TrackPoint}
 */
const point = (index, elevation, source = "gpx") => ({
  latitude: 55 + index * 0.0001,
  longitude: 37,
  elevation,
  elevationSource: source,
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, index * 10)),
  segmentIndex: 0
});

/**
 * @param {number} index
 * @param {number} elevation
 * @param {{ latitude: number, timestampOffsetSeconds: number }} overrides
 * @returns {import("../../src/core/route-types.js").TrackPoint}
 */
const plausibleMountainPoint = (index, elevation, overrides) => ({
  latitude: overrides.latitude,
  longitude: 37,
  elevation,
  elevationSource: "gpx",
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, 0) + overrides.timestampOffsetSeconds * 1000),
  segmentIndex: 0
});

/**
 * @param {number} index
 * @param {number} elevation
 * @param {number} segmentIndex
 * @returns {import("../../src/core/route-types.js").TrackPoint}
 */
const segmentedPoint = (index, elevation, segmentIndex) => ({
  ...point(index, elevation),
  segmentIndex
});

/**
 * @param {number} elevation
 * @returns {import("../../src/core/route-types.js").TrackPoint}
 */
const duplicatePoint = (elevation) => ({
  ...point(0, elevation),
  elevation
});

const plausibleSparseBoundaryReliefPoints = () =>
  Array.from({ length: 100 }, (_, index) =>
    plausibleMountainPoint(index, index < 4 ? 100 : 160, {
      latitude: 55 + index * 0.01,
      timestampOffsetSeconds: index * 1800
    })
  );

const denseSparseTailCollapsePoints = () =>
  Array.from({ length: 500 }, (_, index) =>
    plausibleMountainPoint(index, index >= 200 && index < 220 ? -25 : 100, {
      latitude: 55 + index * 0.00001,
      timestampOffsetSeconds: index
    })
  );

const fusionOptions = {
  activityDefaults: { resampleStepMeters: 10 },
  sourceAssessment: { primaryAbsoluteSource: "gpx", primaryRelativeSource: "gpx" }
};

describe("elevation fusion", () => {
  it("keeps the MAD-to-sigma scale as a named calibration constant", () => {
    expect(MAD_TO_SIGMA_SCALE).toBeCloseTo(1.4826, 4);
  });

  it("resamples the same shape to a regular distance grid", () => {
    const points = [point(0, 100), point(1, 110), point(3, 130), point(6, 160)];

    const samples = resampleElevationRunToDistanceGrid(points, { stepMeters: 10 });

    expect(samples.length).toBeGreaterThan(5);
    expect(samples[0]).toMatchObject({ distanceMeters: 0, elevation: 100 });
    expect(samples[samples.length - 1].elevation).toBeCloseTo(160);
    expect(samples[1].distanceMeters - samples[0].distanceMeters).toBeCloseTo(10);
  });

  it("replaces isolated raw spikes before fusion and keeps raw extrema separately", () => {
    const points = [100, 101, 102, 180, 103, 104, 105].map((elevation, index) =>
      point(index, elevation)
    );

    const result = buildFusedElevationProfile(points, {
      activityDefaults: { resampleStepMeters: 10 },
      sourceAssessment: { primaryAbsoluteSource: "gpx", primaryRelativeSource: "gpx" }
    });

    expect(result.rawExtrema).toEqual({ min: 100, max: 180 });
    expect(result.filteredExtrema.max).toBeLessThan(120);
    expect(result.outliersRemovedPct).toBeGreaterThan(0);
    expect(result.flags).toContain("filtered_extrema_used");
  });

  it("removes isolated flat-context spikes during pre-resample interior cleanup", () => {
    const points = [100, 100, 100, 180, 100, 100, 100].map((elevation, index) =>
      point(index, elevation)
    );

    const result = buildFusedElevationProfile(points, fusionOptions);

    expect(result.rawExtrema).toEqual({ min: 100, max: 180 });
    expect(result.filteredExtrema.max).toBeLessThan(120);
    expect(result.outliersRemovedPct).toBeGreaterThan(0);
    expect(result.preResampleInteriorOutlierReplacementCount).toBeGreaterThan(0);
    expect(result.flags).toContain("pre_resample_interior_outliers_replaced");
  });

  it("reports sigma before and after smoothing", () => {
    const points = [100, 104, 99, 105, 101, 106, 102].map((elevation, index) =>
      point(index, elevation)
    );

    const result = buildFusedElevationProfile(points, fusionOptions);

    expect(result.noise).toMatchObject({
      medianSigmaAfterCleanupMeters: expect.any(Number),
      p95SigmaAfterCleanupMeters: expect.any(Number),
      medianSigmaAfterSmoothingMeters: expect.any(Number),
      p95SigmaAfterSmoothingMeters: expect.any(Number)
    });
    expect(result.noise.p95SigmaAfterCleanupMeters).toBeGreaterThanOrEqual(
      result.noise.p95SigmaAfterSmoothingMeters
    );
  });

  it("replaces low-relief isolated spikes below the old absolute Hampel floor", () => {
    const points = [100, 100.2, 108, 100.3, 100.4].map((elevation, index) =>
      point(index, elevation)
    );

    const result = buildFusedElevationProfile(points, fusionOptions);

    expect(result.filteredExtrema.max).toBeLessThan(104);
    expect(result.outliersRemovedPct).toBeGreaterThan(0);
    expect(result.flags).toContain("hampel_outliers_replaced");
  });

  it("replaces isolated high and low endpoint spikes without flattening real endpoint slopes", () => {
    const spikePoints = [180, 100, 101, 102].map((elevation, index) => point(index, elevation));
    const lowSpikePoints = [20, 100, 101, 102].map((elevation, index) => point(index, elevation));
    const lastHighSpikePoints = [100, 101, 102, 180].map((elevation, index) =>
      point(index, elevation)
    );
    const lastLowSpikePoints = [100, 101, 102, 20].map((elevation, index) =>
      point(index, elevation)
    );
    const climbPoints = [100, 120, 140, 160].map((elevation, index) => point(index, elevation));

    const spikeResult = buildFusedElevationProfile(spikePoints, fusionOptions);
    const lowSpikeResult = buildFusedElevationProfile(lowSpikePoints, fusionOptions);
    const lastHighSpikeResult = buildFusedElevationProfile(lastHighSpikePoints, fusionOptions);
    const lastLowSpikeResult = buildFusedElevationProfile(lastLowSpikePoints, fusionOptions);
    const climbResult = buildFusedElevationProfile(climbPoints, fusionOptions);

    expect(spikeResult.samples[0].elevation).toBeLessThan(110);
    expect(lowSpikeResult.samples[0].elevation).toBeGreaterThan(90);
    expect(lastHighSpikeResult.samples.at(-1)?.elevation).toBeLessThan(110);
    expect(lastLowSpikeResult.samples.at(-1)?.elevation).toBeGreaterThan(90);
    expect(spikeResult.flags).toContain("endpoint_spikes_replaced");
    expect(lowSpikeResult.flags).toContain("endpoint_spikes_replaced");
    expect(lastHighSpikeResult.flags).toContain("endpoint_spikes_replaced");
    expect(lastLowSpikeResult.flags).toContain("endpoint_spikes_replaced");
    expect(climbResult.samples[0].elevation).toBe(100);
    expect(climbResult.samples.at(-1)?.elevation).toBe(160);
  });

  it("replaces extreme endpoint spikes on short three-point runs", () => {
    const cases = [
      { elevations: [180, 100, 101], min: 99, max: 105 },
      { elevations: [20, 100, 101], min: 95, max: 105 },
      { elevations: [100, 101, 180], min: 95, max: 105 },
      { elevations: [100, 101, 20], min: 95, max: 105 }
    ];

    for (const testCase of cases) {
      const result = buildFusedElevationProfile(
        testCase.elevations.map((elevation, index) => point(index, elevation)),
        fusionOptions
      );

      expect(result.filteredExtrema.min).toBeGreaterThanOrEqual(testCase.min);
      expect(result.filteredExtrema.max).toBeLessThanOrEqual(testCase.max);
      expect(result.endpointSpikeReplacementCount).toBeGreaterThanOrEqual(1);
      expect(result.flags).toContain("endpoint_spikes_replaced");
    }
  });

  it("preserves plausible sparse endpoint climbs using distance and time context", () => {
    const points = [
      plausibleMountainPoint(0, 100, { latitude: 55, timestampOffsetSeconds: 0 }),
      plausibleMountainPoint(1, 160, { latitude: 55.01, timestampOffsetSeconds: 1800 }),
      plausibleMountainPoint(2, 161, { latitude: 55.0102, timestampOffsetSeconds: 1810 }),
      plausibleMountainPoint(3, 162, { latitude: 55.0104, timestampOffsetSeconds: 1820 })
    ];

    const result = buildFusedElevationProfile(points, fusionOptions);

    expect(result.samples[0].elevation).toBeCloseTo(100);
    expect(result.filteredExtrema.min).toBeCloseTo(100);
    expect(result.endpointSpikeReplacementCount).toBe(0);
  });

  it("preserves plausible sparse lower relief at the start of a long route", () => {
    const result = buildFusedElevationProfile(plausibleSparseBoundaryReliefPoints(), fusionOptions);

    expect(result.filteredExtrema.min).toBeCloseTo(100);
    expect(result.preResampleSparseTailReplacementCount).toBe(0);
    expect(result.flags).not.toContain("pre_resample_sparse_tail_replaced");
  });

  it("keeps outlier percentage bounded when raw cleanup collapses to few resampled samples", () => {
    const result = buildFusedElevationProfile(denseSparseTailCollapsePoints(), {
      ...fusionOptions,
      activityDefaults: { resampleStepMeters: 10_000 }
    });

    expect(result.preResampleSparseTailReplacementCount).toBeGreaterThan(0);
    expect(result.samples.length).toBeLessThan(result.preResampleSparseTailReplacementCount);
    expect(result.outliersRemovedPct).toBeLessThanOrEqual(100);
  });

  it("preserves endpoint elevation anchors while smoothing a simple climb", () => {
    const points = [100, 110, 120, 130, 140].map((elevation, index) => point(index, elevation));

    const result = buildFusedElevationProfile(points, fusionOptions);

    expect(result.samples[0].elevation).toBeCloseTo(100);
    expect(result.samples[result.samples.length - 1].elevation).toBeCloseTo(140);
  });

  it("does not resample across invalid elevation gaps", () => {
    const points = [point(0, 100), point(1, Number.NaN), point(2, 200)];

    const samples = resampleElevationRunToDistanceGrid(points, { stepMeters: 5 });

    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.elevation)).toEqual([100, 200]);
  });

  it("preserves route distance offsets across invalid elevation gaps", () => {
    const points = [point(0, 100), point(1, Number.NaN), point(2, 200)];

    const samples = resampleElevationRunToDistanceGrid(points, { stepMeters: 5 });

    expect(samples.map((sample) => sample.distanceMeters)).not.toEqual([0, 0]);
    expect(samples[0].distanceMeters).toBe(0);
    expect(samples[1].distanceMeters).toBeGreaterThan(20);
  });

  it("preserves route distance offsets without interpolating across source changes", () => {
    const points = [point(0, 100, "gpx"), point(1, 200, "terrain")];

    const samples = resampleElevationRunToDistanceGrid(points, { stepMeters: 5 });

    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.elevation)).toEqual([100, 200]);
    expect(samples.map((sample) => sample.distanceMeters)).not.toEqual([0, 0]);
    expect(samples[1].distanceMeters).toBeGreaterThan(10);
  });

  it.each([
    {
      breakName: "invalid elevation gap",
      points: [point(0, 100), point(1, 105), point(2, Number.NaN), point(3, 500), point(4, 505)]
    },
    {
      breakName: "source change",
      points: [
        point(0, 100, "gpx"),
        point(1, 105, "gpx"),
        point(2, 500, "terrain"),
        point(3, 505, "terrain")
      ]
    },
    {
      breakName: "segment change",
      points: [
        segmentedPoint(0, 100, 0),
        segmentedPoint(1, 105, 0),
        segmentedPoint(2, 500, 1),
        segmentedPoint(3, 505, 1)
      ]
    }
  ])("exposes public continuity boundaries across a $breakName", ({ points }) => {
    const result = buildFusedElevationProfile(points, {
      activityDefaults: { resampleStepMeters: 50 },
      sourceAssessment: { primaryAbsoluteSource: "gpx", primaryRelativeSource: "gpx" }
    });
    const naiveGain = sumPositiveGain(result.samples, false);
    const continuityAwareGain = sumPositiveGain(result.samples, true);

    expect(result.runRanges).toHaveLength(2);
    expect(result.samples.every((sample) => Number.isInteger(sample.continuousRunId))).toBe(true);
    expect(result.runRanges.map((range) => range.continuousRunId)).toEqual([0, 1]);
    expect(naiveGain).toBeGreaterThan(300);
    expect(continuityAwareGain).toBeLessThan(20);
  });

  it.each([
    {
      breakName: "invalid elevation gap",
      points: [point(0, 100), point(1, Number.NaN), point(2, 1000), point(3, 1014)],
      breakSourceIndex: 2
    },
    {
      breakName: "source change",
      points: [point(0, 100, "gpx"), point(1, 1000, "terrain"), point(2, 1014, "terrain")],
      breakSourceIndex: 1
    },
    {
      breakName: "segment change",
      points: [segmentedPoint(0, 100, 0), segmentedPoint(1, 1000, 1), segmentedPoint(2, 1014, 1)],
      breakSourceIndex: 1
    }
  ])(
    "estimates relative sigma inside the run after a $breakName",
    ({ points, breakSourceIndex }) => {
      const result = buildFusedElevationProfile(points, {
        activityDefaults: { resampleStepMeters: 7 },
        sourceAssessment: { primaryAbsoluteSource: "gpx", primaryRelativeSource: "gpx" }
      });

      const firstSampleAfterBreak = result.samples.find(
        (sample) => sample.sourceIndex === breakSourceIndex && sample.elevation === 1000
      );

      expect(firstSampleAfterBreak?.sigmaRelMeters).toBe(0);
    }
  );

  it("does not resample across segment boundaries", () => {
    const points = [
      segmentedPoint(0, 100, 0),
      segmentedPoint(1, 110, 0),
      segmentedPoint(2, 200, 1)
    ];

    const samples = resampleElevationRunToDistanceGrid(points, { stepMeters: 5 });

    expect(samples.some((sample) => sample.elevation > 110 && sample.elevation < 200)).toBe(false);
    expect(samples[samples.length - 1].elevation).toBe(200);
  });

  it("keeps new segment distance internal without adding the cross-segment jump", () => {
    const points = [
      segmentedPoint(0, 100, 0),
      segmentedPoint(10, 200, 1),
      segmentedPoint(11, 210, 1)
    ];

    const samples = resampleElevationRunToDistanceGrid(points, { stepMeters: 5 });

    expect(samples[0]).toMatchObject({ distanceMeters: 0, elevation: 100 });
    expect(samples[1]).toMatchObject({ distanceMeters: 0, elevation: 200 });
    expect(samples[samples.length - 1].distanceMeters).toBeGreaterThan(10);
    expect(samples[samples.length - 1].distanceMeters).toBeLessThan(20);
    expect(samples[samples.length - 1].elevation).toBeCloseTo(210);
  });

  it("computes extrema for large dense profiles without argument spreading", () => {
    const pointCount = 130_000;
    const points = Array.from({ length: pointCount }, (_value, index) =>
      duplicatePoint(index === pointCount - 1 ? 250 : 100 - (index % 50))
    );

    const result = buildFusedElevationProfile(points, fusionOptions);

    expect(result.rawExtrema).toEqual({ min: 51, max: 250 });
  });

  it("returns one sample for a single finite point", () => {
    const samples = resampleElevationRunToDistanceGrid([point(0, 123)], { stepMeters: 10 });

    expect(samples).toEqual([
      expect.objectContaining({ distanceMeters: 0, elevation: 123, sourceIndex: 0 })
    ]);
  });

  it("keeps duplicate zero-distance coordinates finite and anchored", () => {
    const samples = resampleElevationRunToDistanceGrid(
      [duplicatePoint(100), duplicatePoint(110), duplicatePoint(120)],
      { stepMeters: 10 }
    );

    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ distanceMeters: 0, elevation: 120 });
  });

  it("terrain anchors absolute level without preserving terrain steps as relative chatter", () => {
    const points = [100, 112, 100, 112, 100, 112, 100].map((elevation, index) =>
      point(index, elevation, "terrain")
    );

    const result = buildFusedElevationProfile(points, {
      activityDefaults: { resampleStepMeters: 10 },
      sourceAssessment: { primaryAbsoluteSource: "terrain", primaryRelativeSource: "terrain" }
    });

    const totalChange = result.samples
      .slice(1)
      .reduce(
        (total, sample, index) =>
          total + Math.abs(sample.elevation - result.samples[index].elevation),
        0
      );

    expect(totalChange).toBeLessThan(24);
    expect(result.method).toBe("distance_domain_filtered_profile");
  });
});

/**
 * @param {ReturnType<typeof buildFusedElevationProfile>["samples"]} samples
 * @param {boolean} skipRunBreaks
 */
function sumPositiveGain(samples, skipRunBreaks) {
  return samples.slice(1).reduce((gain, sample, index) => {
    const previous = samples[index];
    if (skipRunBreaks && sample.continuousRunId !== previous.continuousRunId) {
      return gain;
    }
    return gain + Math.max(0, sample.elevation - previous.elevation);
  }, 0);
}
