import { describe, expect, it } from "vitest";

import {
  hasExplicitTimeZone,
  isValidLatitude,
  isValidLongitude,
  normalizeSemicircleCoordinate,
  parseOptionalDateInfo,
  parseOptionalInteger,
  parseOptionalNumber
} from "../../src/core/track-source-primitives.js";

describe("track source primitives", () => {
  it("parses finite optional numbers and rejects empty values", () => {
    expect(parseOptionalNumber("12.5")).toBe(12.5);
    expect(parseOptionalNumber("-3")).toBe(-3);
    expect(parseOptionalNumber(null)).toBeNull();
    expect(parseOptionalNumber("not-a-number")).toBeNull();
  });

  it("parses optional integers by truncating finite numbers", () => {
    expect(parseOptionalInteger("12.9")).toBe(12);
    expect(parseOptionalInteger("-3.9")).toBe(-3);
    expect(parseOptionalInteger(null)).toBeNull();
  });

  it("reports explicit, missing, none, and invalid timestamp timezone status", () => {
    expect(parseOptionalDateInfo(null)).toEqual({
      timestamp: null,
      timeZoneStatus: "none"
    });

    const explicit = parseOptionalDateInfo("2024-01-02T03:04:05Z");
    expect(explicit.timeZoneStatus).toBe("explicit");
    expect(explicit.timestamp?.toISOString()).toBe("2024-01-02T03:04:05.000Z");

    const missing = parseOptionalDateInfo("2024-01-02T03:04:05");
    expect(missing.timeZoneStatus).toBe("missing");
    expect(missing.timestamp?.toISOString()).toBe("2024-01-02T03:04:05.000Z");

    expect(parseOptionalDateInfo("bad-date")).toEqual({
      timestamp: null,
      timeZoneStatus: "invalid"
    });
  });

  it("detects explicit timezone suffixes", () => {
    expect(hasExplicitTimeZone("2024-01-02T03:04:05Z")).toBe(true);
    expect(hasExplicitTimeZone("2024-01-02T03:04:05+03:00")).toBe(true);
    expect(hasExplicitTimeZone("2024-01-02T03:04:05+0300")).toBe(true);
    expect(hasExplicitTimeZone("2024-01-02T03:04:05")).toBe(false);
  });

  it("keeps degree coordinates and converts FIT semicircles", () => {
    expect(normalizeSemicircleCoordinate(45, "latitude")).toBe(45);
    expect(normalizeSemicircleCoordinate(1073741824, "latitude")).toBe(90);
    expect(normalizeSemicircleCoordinate(2147483648, "longitude")).toBe(180);
    expect(normalizeSemicircleCoordinate(Number.NaN, "latitude")).toBeNull();
  });

  it("validates geographic bounds", () => {
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(180.1)).toBe(false);
  });
});
