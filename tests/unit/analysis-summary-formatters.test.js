import { describe, expect, it } from "vitest";

import {
  formatRoundedCount,
  formatRoundedMeters,
  formatRoundedSeconds,
  getElevationRangeMeters
} from "../../src/core/analysis-summary-formatters.js";

describe("analysis summary formatters", () => {
  it("formats rounded meters, seconds, and counts", () => {
    expect(formatRoundedMeters(12.6)).toBe("13 m");
    expect(formatRoundedMeters(null)).toBe("n/a");
    expect(formatRoundedSeconds(12.4)).toBe("12 s");
    expect(formatRoundedSeconds(null)).toBe("n/a");
    expect(formatRoundedCount(4.6)).toBe("5");
    expect(formatRoundedCount(null)).toBe("0");
  });

  it("computes non-negative elevation range", () => {
    expect(getElevationRangeMeters(100, 125.4)).toBe(25.400000000000006);
    expect(getElevationRangeMeters(125, 100)).toBe(0);
    expect(getElevationRangeMeters(null, 100)).toBeNull();
    expect(getElevationRangeMeters(100, Number.NaN)).toBeNull();
  });
});
