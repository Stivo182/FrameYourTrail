import { describe, expect, it } from "vitest";

import {
  getTailSupport,
  isUnsupportedSparseTailGroup
} from "../../src/core/elevation-tail-support.js";

/**
 * @param {number} routeDistanceMeters
 * @param {number | null} timestampSeconds
 */
const observation = (routeDistanceMeters, timestampSeconds = null) => ({
  routeDistanceMeters,
  point: {
    timestamp:
      timestampSeconds === null ? null : new Date(Date.UTC(2026, 5, 2, 8, 0, timestampSeconds))
  }
});

describe("elevation tail support", () => {
  it("measures sample, distance, and duration share", () => {
    const observations = [observation(0, 0), observation(10, 10), observation(100, 100)];

    expect(getTailSupport(observations, [1])).toEqual({
      sampleShare: 1 / 3,
      distanceShare: 0,
      durationShare: 0
    });
  });

  it("accepts tiny unsupported groups", () => {
    const observations = Array.from({ length: 100 }, (_item, index) =>
      observation(index * 10, index)
    );

    expect(isUnsupportedSparseTailGroup(observations, [1, 2, 3])).toBe(true);
  });

  it("rejects groups with too much sample support", () => {
    const observations = Array.from({ length: 100 }, (_item, index) =>
      observation(index * 10, index)
    );

    expect(isUnsupportedSparseTailGroup(observations, [1, 2, 3, 4, 5, 6])).toBe(false);
  });

  it("rejects groups with too much distance support", () => {
    const observations = Array.from({ length: 100 }, (_item, index) =>
      observation(index <= 5 ? index * 20 : 110, index)
    );

    expect(getTailSupport(observations, [1, 2, 3, 4, 5])).toMatchObject({
      sampleShare: 0.05,
      distanceShare: 80 / 110
    });
    expect(isUnsupportedSparseTailGroup(observations, [1, 2, 3, 4, 5])).toBe(false);
  });

  it("rejects groups with too much duration support", () => {
    const observations = Array.from({ length: 100 }, (_item, index) =>
      observation(index * 10, index <= 5 ? index * 20 : 110)
    );

    expect(getTailSupport(observations, [1, 2, 3, 4, 5])).toMatchObject({
      sampleShare: 0.05,
      durationShare: 80 / 110
    });
    expect(isUnsupportedSparseTailGroup(observations, [1, 2, 3, 4, 5])).toBe(false);
  });

  it("returns null distance share when total distance is zero", () => {
    const observations = [observation(0, 0), observation(0, 10), observation(0, 20)];

    expect(getTailSupport(observations, [0, 1])).toEqual({
      sampleShare: 2 / 3,
      distanceShare: null,
      durationShare: 1 / 2
    });
  });

  it("returns null duration share when timestamps are missing", () => {
    const observations = [observation(0), observation(10), observation(20)];

    expect(getTailSupport(observations, [0, 1])).toEqual({
      sampleShare: 2 / 3,
      distanceShare: 1 / 2,
      durationShare: null
    });
  });

  it("does not treat empty candidates as unsupported", () => {
    const observations = [observation(0, 0), observation(10, 10), observation(20, 20)];

    expect(getTailSupport(observations, [])).toEqual({
      sampleShare: 0,
      distanceShare: 0,
      durationShare: 0
    });
    expect(isUnsupportedSparseTailGroup(observations, [])).toBe(false);
  });

  it("measures separated candidate runs independently", () => {
    const observations = [
      observation(0, 0),
      observation(10, 10),
      observation(20, 20),
      observation(100, 100),
      observation(140, 140)
    ];

    expect(getTailSupport(observations, [0, 1, 3, 4])).toEqual({
      sampleShare: 4 / 5,
      distanceShare: 50 / 140,
      durationShare: 50 / 140
    });
  });
});
