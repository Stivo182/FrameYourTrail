import { describe, expect, it } from "vitest";

import {
  getTerrainElevationProvider,
  isTerrainElevationProviderEnabled
} from "../../src/services/terrain-provider-config.js";

describe("terrain elevation provider config", () => {
  it("disables external terrain elevation by default", () => {
    expect(getTerrainElevationProvider()).toBe("none");
    expect(isTerrainElevationProviderEnabled()).toBe(false);
  });

  it("allows Open-Meteo when explicitly configured before startup", () => {
    expect(getTerrainElevationProvider("open-meteo")).toBe("open-meteo");
    expect(isTerrainElevationProviderEnabled("open-meteo")).toBe(true);
  });

  it("reads the Frame Your Trail runtime provider override", () => {
    globalThis.__FRAME_YOUR_TRAIL_TERRAIN_ELEVATION_PROVIDER__ = "open-meteo";

    try {
      expect(getTerrainElevationProvider()).toBe("open-meteo");
      expect(isTerrainElevationProviderEnabled()).toBe(true);
    } finally {
      delete globalThis.__FRAME_YOUR_TRAIL_TERRAIN_ELEVATION_PROVIDER__;
    }
  });

  it("falls back to none for unknown provider values", () => {
    expect(getTerrainElevationProvider("custom-dem")).toBe("none");
    expect(isTerrainElevationProviderEnabled("custom-dem")).toBe(false);
  });
});
