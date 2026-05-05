import { describe, expect, it } from "vitest";
import { integrateConfirmedElevationGainLoss } from "../../src/core/elevation-gain-integrator.js";

/**
 * @param {number} index
 * @param {number} elevation
 * @param {number} [sigmaRelMeters]
 * @param {number} [continuousRunId]
 */
const sample = (index, elevation, sigmaRelMeters = 0, continuousRunId = undefined) => ({
  distanceMeters: index * 10,
  elevation,
  sigmaRelMeters,
  ...(continuousRunId === undefined ? {} : { continuousRunId })
});

describe("integrateConfirmedElevationGainLoss", () => {
  it("counts a single sustained climb from the initial anchor", () => {
    const samples = [100, 120, 140].map((elevation, index) => sample(index * 5, elevation));

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 4,
      minSustainedDistanceMeters: 20,
      alpha: 3
    });

    expect(result.gain).toBeCloseTo(40);
    expect(result.loss).toBe(0);
    expect(result.profile.map((item) => item.elevation)).toEqual([100, 140]);
  });

  it("counts a single sustained descent from the initial anchor", () => {
    const samples = [300, 260, 220].map((elevation, index) => sample(index * 5, elevation));

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 8,
      minSustainedDistanceMeters: 20,
      alpha: 3
    });

    expect(result.gain).toBe(0);
    expect(result.loss).toBeCloseTo(80);
    expect(result.profile.map((item) => item.elevation)).toEqual([300, 220]);
  });

  it("keeps the climb high point when a run ends with an unconfirmed descent", () => {
    const samples = [100, 120, 140, 135].map((elevation, index) => sample(index, elevation));

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 8,
      minSustainedDistanceMeters: 10,
      alpha: 3
    });

    expect(result.gain).toBeCloseTo(40);
    expect(result.loss).toBe(0);
    expect(result.profile.map((item) => item.elevation)).toEqual([100, 140]);
  });

  it("keeps the descent low point when a run ends with an unconfirmed climb", () => {
    const samples = [200, 180, 160, 165].map((elevation, index) => sample(index, elevation));

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 8,
      minSustainedDistanceMeters: 10,
      alpha: 3
    });

    expect(result.gain).toBe(0);
    expect(result.loss).toBeCloseTo(40);
    expect(result.profile.map((item) => item.elevation)).toEqual([200, 160]);
  });

  it("counts sustained confirmed climbs and descents", () => {
    const samples = [100, 110, 120, 115, 105, 130].map((elevation, index) =>
      sample(index, elevation)
    );

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 4,
      minSustainedDistanceMeters: 10,
      alpha: 3
    });

    expect(result.gain).toBeCloseTo(45);
    expect(result.loss).toBeCloseTo(15);
    expect(result.profile.map((item) => item.elevation)).toEqual([100, 120, 105, 130]);
  });

  it("suppresses short water oscillations", () => {
    const elevations = [300, 302, 299, 301, 298, 296, 294, 292, 290, 288, 286];
    const samples = elevations.map((elevation, index) => sample(index, elevation, 0.8));

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 8,
      minSustainedDistanceMeters: 60,
      alpha: 4
    });

    expect(result.gain).toBe(0);
    expect(result.loss).toBeGreaterThanOrEqual(10);
    expect(result.thresholds.medianThresholdMeters).toBeGreaterThanOrEqual(8);
  });

  it("raises local thresholds from sigmaRel", () => {
    const samples = [100, 103, 99, 104, 100, 115].map((elevation, index) =>
      sample(index, elevation, index < 5 ? 3 : 0)
    );

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 3,
      minSustainedDistanceMeters: 10,
      alpha: 3
    });

    expect(result.gain).toBeCloseTo(15);
    expect(result.loss).toBe(0);
    expect(result.thresholds.p95ThresholdMeters).toBeGreaterThan(3);
  });

  it("does not count movement that never establishes a confirmed direction", () => {
    const result = integrateConfirmedElevationGainLoss([sample(0, 100), sample(1, 103)], {
      baseThresholdMeters: 4,
      minSustainedDistanceMeters: 10
    });

    expect(result.gain).toBe(0);
    expect(result.loss).toBe(0);
    expect(result.profile.map((item) => item.elevation)).toEqual([100]);
  });

  it("does not count boundary deltas between continuous runs", () => {
    const samples = [
      sample(0, 90, 0, 0),
      sample(1, 100, 0, 0),
      sample(2, 300, 0, 1),
      sample(3, 315, 0, 1)
    ];

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 4,
      minSustainedDistanceMeters: 10
    });

    expect(result.gain).toBeCloseTo(25);
    expect(result.loss).toBe(0);
    expect(result.profile.map((item) => item.elevation)).toEqual([90, 100, 300, 315]);
  });

  it("handles zero or one sample", () => {
    const options = {
      baseThresholdMeters: 5,
      minSustainedDistanceMeters: 20
    };

    expect(integrateConfirmedElevationGainLoss([], options)).toEqual({
      gain: 0,
      loss: 0,
      profile: [],
      thresholds: {
        baseThresholdMeters: 5,
        medianThresholdMeters: 5,
        p95ThresholdMeters: 5,
        minSustainedDistanceMeters: 20
      }
    });

    const result = integrateConfirmedElevationGainLoss([sample(0, 120, 4)], options);

    expect(result.gain).toBe(0);
    expect(result.loss).toBe(0);
    expect(result.profile.map((item) => item.elevation)).toEqual([120]);
    expect(result.thresholds).toEqual({
      baseThresholdMeters: 5,
      medianThresholdMeters: 12,
      p95ThresholdMeters: 12,
      minSustainedDistanceMeters: 20
    });
  });

  it("does not under-report p95 threshold for short high-sigma arrays", () => {
    const samples = [sample(0, 100, 0), sample(1, 110, 5)];

    const result = integrateConfirmedElevationGainLoss(samples, {
      baseThresholdMeters: 4,
      minSustainedDistanceMeters: 10,
      alpha: 3
    });

    expect(result.thresholds.p95ThresholdMeters).toBe(15);
  });
});
