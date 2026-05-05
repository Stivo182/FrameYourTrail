import { describe, expect, it } from "vitest";

import { createI18n } from "../../src/i18n/index.js";
import {
  formatDistance,
  formatDistanceMeters,
  formatDuration,
  formatDurationSeconds,
  formatElevation,
  formatElevationMeters,
  getFormatUnits,
  formatSpeedKmh,
  formatSpeed
} from "../../src/core/formatters.js";

describe("formatters", () => {
  it("formats distance", () => {
    expect(formatDistance(23470, "en")).toBe("23.5 km");
    expect(formatDistance(23470, "de")).toBe("23,5 km");
  });

  it("formats duration", () => {
    expect(formatDuration(20538)).toBe("5:42:18");
    expect(formatDuration(null)).toBe("—");
  });

  it("formats elevation", () => {
    expect(formatElevation(1540, "fr")).toBe("1 540,0 m");
    expect(formatElevation(null, "es")).toBe("—");
  });

  it("formats speed", () => {
    expect(formatSpeed(4.114, "en")).toBe("4.1 km/h");
    expect(formatSpeed(null, "es")).toBe("—");
  });

  it("rounds explicit unit formatter output without changing raw values", () => {
    const distanceMeters = 23470.123456;
    const durationSeconds = 20538.6789;
    const elevationMeters = 1540.98765;
    const speedKmh = 4.14999;

    expect(formatDistanceMeters(distanceMeters, "en")).toBe("23.5 km");
    expect(formatDurationSeconds(durationSeconds)).toBe("5:42:19");
    expect(formatElevationMeters(elevationMeters, "fr")).toBe("1 541,0 m");
    expect(formatSpeedKmh(speedKmh, "de")).toBe("4,1 km/h");

    expect(distanceMeters).toBe(23470.123456);
    expect(durationSeconds).toBe(20538.6789);
    expect(elevationMeters).toBe(1540.98765);
    expect(speedKmh).toBe(4.14999);
  });

  it("keeps backward-compatible formatter names identical to explicit unit formatters", () => {
    expect(formatDistance(23470.123456, "de")).toBe(formatDistanceMeters(23470.123456, "de"));
    expect(formatDuration(20538.6789)).toBe(formatDurationSeconds(20538.6789));
    expect(formatElevation(1540.98765, "fr")).toBe(formatElevationMeters(1540.98765, "fr"));
    expect(formatSpeed(4.14999, "en")).toBe(formatSpeedKmh(4.14999, "en"));
  });

  it("derives format units from i18n dictionaries", () => {
    expect(getFormatUnits(createI18n("en"))).toEqual({
      kilometer: "km",
      meter: "m",
      speed: "km/h"
    });
  });
});
