import { describe, expect, it } from "vitest";

import {
  hasElevationSourceSwitch,
  normalizeElevationSource
} from "../../src/core/elevation-source.js";

describe("elevation source helpers", () => {
  it("keeps known elevation sources and normalizes unknown values", () => {
    expect(normalizeElevationSource("barometric")).toBe("barometric");
    expect(normalizeElevationSource("terrain")).toBe("terrain");
    expect(normalizeElevationSource("gpx")).toBe("gpx");
    expect(normalizeElevationSource("none")).toBe("unknown");
    expect(normalizeElevationSource(null)).toBe("unknown");
    expect(normalizeElevationSource(42)).toBe("unknown");
  });

  it("detects source switches after normalization", () => {
    expect(
      hasElevationSourceSwitch({ elevationSource: "gpx" }, { elevationSource: "terrain" })
    ).toBe(true);
    expect(hasElevationSourceSwitch({ elevationSource: "gpx" }, { elevationSource: "gpx" })).toBe(
      false
    );
    expect(hasElevationSourceSwitch({ elevationSource: "none" }, { elevationSource: null })).toBe(
      false
    );
  });
});
