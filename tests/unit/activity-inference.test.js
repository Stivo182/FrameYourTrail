import { describe, expect, it } from "vitest";
import {
  ELEVATION_ACTIVITY_DEFAULTS,
  inferElevationActivity
} from "../../src/core/activity-inference.js";

const point = (index, seconds, latitude, longitude, elevation = 100, segmentIndex = 0) => ({
  latitude,
  longitude,
  elevation,
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, seconds)),
  segmentIndex
});

describe("inferElevationActivity", () => {
  it("prefers explicit structured activity over inferred movement features", () => {
    const points = [
      {
        latitude: 55,
        longitude: 37,
        elevation: 100,
        timestamp: new Date("2024-05-25T08:00:00Z"),
        segmentIndex: 0
      },
      {
        latitude: 55.0001,
        longitude: 37.0001,
        elevation: 101,
        timestamp: new Date("2024-05-25T08:10:00Z"),
        segmentIndex: 0
      }
    ];

    const result = inferElevationActivity(points, {
      explicitActivity: { type: "bike", source: "gpx_track_type", raw: "cycling" }
    });

    expect(result).toMatchObject({
      inferred: "bike",
      confidence: 0.95,
      reasonCodes: ["explicit_activity"],
      explicit: { type: "bike", source: "gpx_track_type", raw: "cycling" }
    });
  });

  it("ignores malformed explicit activity and falls back to movement inference", () => {
    const points = [
      point(0, 0, 46, 7),
      point(1, 60, 46.00045, 7),
      point(2, 120, 46.0009, 7),
      point(3, 180, 46.00135, 7)
    ];
    const malformedActivities = [
      { type: "route_plan", source: "gpx_track_type", raw: "cycling" },
      { type: "bike", source: "restored_activity", raw: "cycling" },
      { type: "bike", source: "gpx_track_type", raw: 42 }
    ];

    for (const explicitActivity of malformedActivities) {
      const result = inferElevationActivity(points, {
        explicitActivity: /** @type {any} */ (explicitActivity)
      });

      expect(result).toMatchObject({
        explicit: null,
        inferred: "foot"
      });
      expect(result.reasonCodes).not.toContain("explicit_activity");
    }
  });

  it("infers route_plan for untimed elevated routes", () => {
    const points = [
      { latitude: 55, longitude: 37, elevation: 100, timestamp: null, segmentIndex: 0 },
      { latitude: 55.001, longitude: 37.001, elevation: 110, timestamp: null, segmentIndex: 0 },
      { latitude: 55.002, longitude: 37.002, elevation: 105, timestamp: null, segmentIndex: 0 }
    ];

    const result = inferElevationActivity(points);

    expect(result).toMatchObject({
      inferred: "route_plan",
      confidence: expect.any(Number),
      defaults: ELEVATION_ACTIVITY_DEFAULTS.route_plan
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.reasonCodes).toContain("no_timestamps");
  });

  it("infers bike for sustained moderate speeds", () => {
    const points = [
      point(0, 0, 45, 36),
      point(1, 60, 45.004, 36),
      point(2, 120, 45.008, 36),
      point(3, 180, 45.012, 36),
      point(4, 240, 45.016, 36)
    ];

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("bike");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result.defaults.resampleStepMeters).toBe(10);
  });

  it("reports activity candidates without changing the selected activity", () => {
    const points = [
      point(0, 0, 45, 36),
      point(1, 60, 45.004, 36),
      point(2, 120, 45.008, 36),
      point(3, 180, 45.012, 36),
      point(4, 240, 45.016, 36)
    ];

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("bike");
    expect(result.activityCandidates[0]).toMatchObject({
      activity: "bike",
      score: result.confidence
    });
    expect(result.activityCandidates.map((candidate) => candidate.activity)).toContain("foot");
    expect(
      result.activityCandidates.every((candidate) => Array.isArray(candidate.reasonCodes))
    ).toBe(true);
  });

  it("infers foot for slow moving tracks", () => {
    const points = [
      point(0, 0, 46, 7),
      point(1, 60, 46.00045, 7),
      point(2, 120, 46.0009, 7),
      point(3, 180, 46.00135, 7)
    ];

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("foot");
    expect(result.defaults.resampleStepMeters).toBe(5);
  });

  it("keeps a water candidate for flat low-speed movement without net descent", () => {
    const points = Array.from({ length: 8 }, (_item, index) =>
      point(index, index * 60, 46 + index * 0.00025, 7, 100 + (index % 2 === 0 ? 0.3 : -0.3))
    );

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("foot");
    expect(result.activityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: "water",
          reasonCodes: expect.arrayContaining(["flat_low_speed_water_candidate"])
        })
      ])
    );
  });

  it("infers water for strongly directional slow descent signals", () => {
    const points = Array.from({ length: 80 }, (_item, index) =>
      point(index, index * 20, 55 + index * 0.00008, 37, 300 - index * 2)
    );

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("water");
    expect(result.defaults.minSustainedDistanceMeters).toBe(300);
    expect(result.reasonCodes).toContain("sustained_directional_descent");
  });

  it("infers water for noisy slow sustained descent signals", () => {
    const points = Array.from({ length: 220 }, (_item, index) =>
      point(
        index,
        index * 20,
        55 + index * 0.00036,
        37,
        800 - index * 1.8 + (index % 2 === 0 ? 28 : -28)
      )
    );

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("water");
    expect(result.defaults.minSustainedDistanceMeters).toBe(300);
    expect(result.reasonCodes).toContain("noisy_sustained_descent");
  });

  it("does not infer motion speed from coordinate jumps across segments", () => {
    const points = [point(0, 0, 46, 7, 100, 0), point(1, 60, 47, 8, 100, 1)];

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("unknown");
    expect(result.reasonCodes).toContain("insufficient_motion_signal");
    expect(result.features.medianSpeedKmh).toBeNull();
    expect(result.features.p95SpeedKmh).toBeNull();
  });

  it("does not infer motion speed from coordinate jumps across declared time gaps", () => {
    const points = [point(0, 0, 46, 7), point(1, 60, 46.00045, 7), point(2, 3660, 46.9, 7)];

    const result = inferElevationActivity(points, {
      timeGapBreakIndexes: new Set([2])
    });

    expect(result.inferred).toBe("foot");
    expect(result.reasonCodes).toContain("foot_speed");
    expect(result.reasonCodes).not.toContain("motor_speed");
    expect(result.features.p95SpeedKmh).toBeLessThan(18);
  });

  it("does not infer water from elevation discontinuities across segments", () => {
    const points = [
      point(0, 0, 55, 37, 300, 0),
      point(1, 60, 55.00008, 37, 299, 0),
      point(2, 120, 55.00016, 37, 298, 0),
      point(3, 180, 55.00024, 37, 120, 1),
      point(4, 240, 55.00032, 37, 119, 1),
      point(5, 300, 55.0004, 37, 118, 1)
    ];

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("foot");
    expect(result.reasonCodes).toContain("foot_speed");
    expect(result.features.netElevationChangeMeters).toBe(-4);
    expect(result.features.rawElevationChangeMeters).toBe(4);
    expect(result.features.directionalElevationRatio).toBe(1);
  });

  it("does not infer water from elevation discontinuities across missing elevation gaps", () => {
    const points = [
      point(0, 0, 55, 37, 300),
      point(1, 60, 55.00008, 37, 299),
      point(2, 120, 55.00016, 37, 298),
      point(3, 180, 55.00024, 37, Number.NaN),
      point(4, 240, 55.00032, 37, 120),
      point(5, 300, 55.0004, 37, 119),
      point(6, 360, 55.00048, 37, 118)
    ];

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("foot");
    expect(result.reasonCodes).not.toContain("sustained_directional_descent");
    expect(result.features.netElevationChangeMeters).toBe(-4);
    expect(result.features.rawElevationChangeMeters).toBe(4);
  });

  it("does not infer water from elevation discontinuities across declared time gap breaks", () => {
    const points = [
      point(0, 0, 55, 37, 300),
      point(1, 60, 55.00008, 37, 299),
      point(2, 120, 55.00016, 37, 298),
      point(3, 180, 55.00024, 37, 120),
      point(4, 240, 55.00032, 37, 119),
      point(5, 300, 55.0004, 37, 118)
    ];

    const result = inferElevationActivity(points, {
      timeGapBreakIndexes: new Set([3])
    });

    expect(result.inferred).toBe("foot");
    expect(result.reasonCodes).toContain("foot_speed");
    expect(result.reasonCodes).not.toContain("sustained_directional_descent");
    expect(result.features.netElevationChangeMeters).toBe(-4);
    expect(result.features.rawElevationChangeMeters).toBe(4);
    expect(result.features.directionalElevationRatio).toBe(1);
  });

  it("keeps plausible descent across declared time gaps as a water candidate without selecting water", () => {
    const points = [
      point(0, 0, 55, 37, 300),
      point(1, 60, 55.00008, 37, 270),
      point(2, 120, 55.00016, 37, 240),
      point(3, 180, 55.00024, 37, 210)
    ];

    const result = inferElevationActivity(points, {
      timeGapBreakIndexes: new Set([1, 2, 3])
    });

    expect(result.inferred).not.toBe("water");
    expect(result.reasonCodes).toContain("insufficient_motion_signal");
    expect(result.activityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: "water",
          reasonCodes: expect.arrayContaining(["sustained_descent_candidate"])
        })
      ])
    );
    expect(result.features.medianSpeedKmh).toBeNull();
    expect(result.features.p95SpeedKmh).toBeNull();
    expect(result.features.netElevationChangeMeters).toBe(-90);
    expect(result.features.rawElevationChangeMeters).toBe(90);
    expect(result.features.directionalElevationRatio).toBe(1);
  });

  it("does not select water when only unrelated flat motion is continuous", () => {
    const points = [
      point(0, 0, 55, 37, 300),
      point(1, 60, 55.00008, 37, 300),
      point(2, 120, 55.00016, 37, 270),
      point(3, 180, 55.00024, 37, 240),
      point(4, 240, 55.00032, 37, 210)
    ];

    const result = inferElevationActivity(points, {
      timeGapBreakIndexes: new Set([2, 3, 4])
    });

    expect(result.inferred).not.toBe("water");
    expect(result.reasonCodes).toContain("foot_speed");
    expect(result.reasonCodes).not.toContain("sustained_directional_descent");
    expect(result.activityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: "water",
          reasonCodes: expect.arrayContaining(["sustained_descent_candidate"])
        })
      ])
    );
    expect(result.features.medianSpeedKmh).toBeGreaterThan(0);
    expect(result.features.netElevationChangeMeters).toBe(-90);
    expect(result.features.rawElevationChangeMeters).toBe(90);
    expect(result.features.directionalElevationRatio).toBe(1);
  });

  it("does not let a tiny continuous descent unlock water for a gapped descent", () => {
    const points = [
      point(0, 0, 55, 37, 300),
      point(1, 60, 55.00008, 37, 299),
      point(2, 120, 55.00016, 37, 250),
      point(3, 180, 55.00024, 37, 201),
      point(4, 240, 55.00032, 37, 152)
    ];

    const result = inferElevationActivity(points, {
      timeGapBreakIndexes: new Set([2, 3, 4])
    });

    expect(result.inferred).not.toBe("water");
    expect(result.activityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: "water",
          reasonCodes: expect.arrayContaining(["sustained_descent_candidate"])
        })
      ])
    );
    expect(result.features.speedSupportedDescentMeters).toBe(1);
    expect(result.features.netElevationChangeMeters).toBe(-148);
  });

  it("does not count same-coordinate descent as speed-supported water motion", () => {
    const points = [300, 275, 250, 225, 200].map((elevation, index) =>
      point(index, index * 60, 55, 37, elevation)
    );

    const result = inferElevationActivity(points);

    expect(result.inferred).not.toBe("water");
    expect(result.reasonCodes).toContain("insufficient_motion_signal");
    expect(result.reasonCodes).not.toContain("sustained_directional_descent");
    expect(result.activityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: "water",
          reasonCodes: expect.arrayContaining(["sustained_descent_candidate"])
        })
      ])
    );
    expect(result.features.speedSupportedDescentMeters ?? 0).toBe(0);
    expect(result.features.netElevationChangeMeters).toBe(-100);
    expect(result.features.rawElevationChangeMeters).toBe(100);
  });

  it("does not count near-zero XY jitter descent as speed-supported water motion", () => {
    const points = [300, 275, 250, 225, 200].map((elevation, index) =>
      point(index, index * 60, 55 + index * 1e-9, 37, elevation)
    );

    const result = inferElevationActivity(points);

    expect(result.inferred).not.toBe("water");
    expect(result.reasonCodes).toContain("insufficient_motion_signal");
    expect(result.reasonCodes).not.toContain("sustained_directional_descent");
    expect(result.activityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: "water",
          reasonCodes: expect.arrayContaining(["sustained_descent_candidate"])
        })
      ])
    );
    expect(result.features.speedSupportedDescentMeters ?? 0).toBe(0);
    expect(result.features.netElevationChangeMeters).toBe(-100);
    expect(result.features.rawElevationChangeMeters).toBe(100);
  });

  it("does not count anchor-bounded oscillating XY jitter as speed-supported water motion", () => {
    const metersToLatitudeDegrees = 1 / 111_320;
    const latitudeOffsetsMeters = [0, 4, -4, 4, -4];
    const points = [300, 270, 240, 210, 180].map((elevation, index) =>
      point(
        index,
        index * 60,
        55 + latitudeOffsetsMeters[index] * metersToLatitudeDegrees,
        37,
        elevation
      )
    );

    const result = inferElevationActivity(points);

    expect(result.inferred).not.toBe("water");
    expect(result.reasonCodes).toContain("insufficient_motion_signal");
    expect(result.reasonCodes).not.toContain("sustained_directional_descent");
    expect(result.activityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: "water",
          reasonCodes: expect.arrayContaining(["sustained_descent_candidate"])
        })
      ])
    );
    expect(result.features.speedSupportedDescentMeters ?? 0).toBe(0);
    expect(result.features.netElevationChangeMeters).toBe(-120);
    expect(result.features.rawElevationChangeMeters).toBe(120);
  });

  it("uses high-end speed samples for p95 on short tracks", () => {
    const points = [
      point(0, 0, 45, 36),
      point(1, 60, 45.00045, 36),
      point(2, 120, 45.0009, 36),
      point(3, 180, 45.00135, 36),
      point(4, 240, 45.05, 36)
    ];

    const result = inferElevationActivity(points);

    expect(result.inferred).toBe("motor");
    expect(result.reasonCodes).toContain("motor_speed");
    expect(result.features.medianSpeedKmh).toBeLessThan(8);
    expect(result.features.p95SpeedKmh).toBeGreaterThanOrEqual(70);
  });

  it("reports deterministic activity features", () => {
    const points = [
      point(0, 0, 46, 7, 100),
      point(1, 60, 46.00045, 7, 104),
      point(2, 120, 46.0009, 7, 102),
      point(3, 180, 46.00135, 7, 110)
    ];

    const result = inferElevationActivity(points);

    expect(result.features).toMatchObject({
      sampleCount: 4,
      timedPointCount: 4,
      netElevationChangeMeters: 10,
      rawElevationChangeMeters: 14,
      directionalElevationRatio: 10 / 14
    });
    expect(result.features.medianSpeedKmh).toBeCloseTo(3, 0);
    expect(result.features.p95SpeedKmh).toBeCloseTo(3, 0);
  });
});
