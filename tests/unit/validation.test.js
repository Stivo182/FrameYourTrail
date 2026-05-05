import { describe, expect, it } from "vitest";
import { validateParsedTrack } from "../../src/core/validation.js";

describe("validateParsedTrack", () => {
  it("returns warnings for missing elevation and time", () => {
    const result = validateParsedTrack(
      {
        points: [
          { latitude: 1, longitude: 1, elevation: null, timestamp: null, segmentIndex: 0 },
          { latitude: 2, longitude: 2, elevation: null, timestamp: null, segmentIndex: 0 }
        ],
        hasElevation: false,
        hasTime: false,
        elevationSource: "none"
      },
      1200
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((item) => item.code)).toEqual(["missing_elevation", "missing_time"]);
    expect(result.warnings.map((item) => item.messageKey)).toEqual([
      "messages.missingElevation",
      "messages.missingTime"
    ]);
  });

  it("returns a warning for large files", () => {
    const result = validateParsedTrack(
      {
        points: [
          { latitude: 1, longitude: 1, elevation: 10, timestamp: new Date(), segmentIndex: 0 }
        ],
        hasElevation: true,
        hasTime: true,
        elevationSource: "gpx"
      },
      60 * 1024 * 1024
    );

    expect(result.warnings.map((item) => item.code)).toContain("large_file");
  });

  it("returns a warning when elevation was restored from terrain data", () => {
    const result = validateParsedTrack(
      {
        points: [
          { latitude: 1, longitude: 1, elevation: 10, timestamp: new Date(), segmentIndex: 0 },
          { latitude: 2, longitude: 2, elevation: 20, timestamp: new Date(), segmentIndex: 0 }
        ],
        hasElevation: true,
        hasTime: true,
        elevationSource: "terrain"
      },
      1200
    );

    expect(result.warnings.map((item) => item.code)).toEqual(["terrain_elevation"]);
    expect(result.warnings.map((item) => item.messageKey)).toEqual(["messages.terrainElevation"]);
  });

  it("returns an error when there are not enough points for analysis", () => {
    const result = validateParsedTrack(
      {
        points: [
          { latitude: 1, longitude: 1, elevation: 10, timestamp: new Date(), segmentIndex: 0 }
        ],
        hasElevation: true,
        hasTime: true,
        elevationSource: "gpx"
      },
      1200
    );

    expect(result.errors.map((item) => item.code)).toEqual(["insufficient_points"]);
    expect(result.errors.map((item) => item.messageKey)).toEqual(["messages.insufficientPoints"]);
  });
});
