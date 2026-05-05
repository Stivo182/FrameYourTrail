import { describe, expect, it } from "vitest";

import {
  interpolatedPercentile,
  lowerRankMedian,
  lowerRankPercentile,
  median,
  nearestRankPercentile,
  upperRankPercentile
} from "../../src/core/statistics.js";

describe("statistics helpers", () => {
  it("uses nearest-rank percentile for existing activity/source assessment policy", () => {
    expect(nearestRankPercentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(nearestRankPercentile([1, 2, 3, 4], 0.95)).toBe(4);
    expect(nearestRankPercentile([], 0.5)).toBeNull();
  });

  it("uses interpolated percentile for existing fusion noise summaries", () => {
    expect(interpolatedPercentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(interpolatedPercentile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(interpolatedPercentile([], 0.5)).toBeNull();
  });

  it("uses lower-rank percentile for existing speed-profile policy", () => {
    expect(lowerRankPercentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(lowerRankPercentile([1, 2, 3, 4], 0.9)).toBe(3);
    expect(lowerRankPercentile([], 0.5)).toBeNull();
  });

  it("uses upper-rank percentile for existing elevation gain integration policy", () => {
    expect(upperRankPercentile([1, 2, 3, 4], 0.5)).toBe(3);
    expect(upperRankPercentile([1, 2, 3, 4], 0.9)).toBe(4);
    expect(upperRankPercentile([], 0.5)).toBeNull();
  });

  it("uses conventional median for existing moving and speed summaries", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });

  it("uses lower-rank median for existing fusion robust estimates", () => {
    expect(lowerRankMedian([4, 1, 3, 2])).toBe(2);
    expect(lowerRankMedian([3, 1, 2])).toBe(2);
    expect(lowerRankMedian([])).toBeNull();
  });
});
