import { describe, expect, it } from "vitest";

import {
  hasTimeGapElevationDiscontinuity,
  normalizeElevationSegmentIndex,
  normalizeFiniteElevationSegmentIndex
} from "../../src/core/elevation-continuity.js";
import { getSegmentIndex } from "../../src/core/track-continuity.js";

describe("elevation continuity helpers", () => {
  it("normalizes missing and invalid segment indexes to zero", () => {
    expect(normalizeElevationSegmentIndex(undefined)).toBe(0);
    expect(normalizeElevationSegmentIndex(-1)).toBe(0);
    expect(normalizeElevationSegmentIndex(1.5)).toBe(0);
    expect(normalizeElevationSegmentIndex(2)).toBe(2);
  });

  it("preserves finite route-like segment indexes", () => {
    expect(normalizeFiniteElevationSegmentIndex(undefined)).toBe(0);
    expect(normalizeFiniteElevationSegmentIndex(Number.NaN)).toBe(0);
    expect(normalizeFiniteElevationSegmentIndex(-1)).toBe(-1);
    expect(normalizeFiniteElevationSegmentIndex(1.5)).toBe(1.5);
    expect(normalizeFiniteElevationSegmentIndex(2)).toBe(2);
  });

  it("keeps finite elevation segment normalization aligned with route continuity", () => {
    const pointWithoutSegmentIndex =
      /** @type {import("../../src/core/route-types.js").TrackPoint} */ ({
        latitude: 0,
        longitude: 0,
        elevation: 0,
        timestamp: null
      });
    const basePoint = {
      latitude: 0,
      longitude: 0,
      elevation: 0,
      timestamp: null
    };
    const cases = [
      { value: undefined, point: pointWithoutSegmentIndex },
      { value: Number.NaN, point: { ...basePoint, segmentIndex: Number.NaN } },
      { value: -1, point: { ...basePoint, segmentIndex: -1 } },
      { value: 1.5, point: { ...basePoint, segmentIndex: 1.5 } },
      { value: 2, point: { ...basePoint, segmentIndex: 2 } }
    ];

    for (const { value, point } of cases) {
      expect(normalizeFiniteElevationSegmentIndex(value)).toBe(getSegmentIndex(point));
    }
  });

  it("detects elevation discontinuity only on declared gap and large vertical jump", () => {
    const gaps = new Set([3]);
    const previous = { elevation: 100 };
    const point = { elevation: 160 };

    expect(hasTimeGapElevationDiscontinuity(3, gaps, previous, point)).toBe(true);
    expect(hasTimeGapElevationDiscontinuity(2, gaps, previous, point)).toBe(false);
    expect(hasTimeGapElevationDiscontinuity(3, gaps, previous, { elevation: 159 })).toBe(false);
    expect(hasTimeGapElevationDiscontinuity(3, gaps, undefined, point)).toBe(false);
  });
});
