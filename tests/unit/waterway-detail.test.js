import { describe, expect, it, vi } from "vitest";
import {
  createOpenFreeMapWaterwayDetailPlan,
  fetchOpenFreeMapWaterwayDetail
} from "../../src/render/waterway-detail.js";

const BAKHAPCHA_BOUNDS = {
  minLatitude: 61.061819,
  maxLatitude: 61.760921,
  minLongitude: 150.638698,
  maxLongitude: 151.762894
};

const OPENFREEMAP_STYLE = {
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet"
    }
  },
  layers: [
    {
      id: "waterway_river",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway"
    }
  ]
};

describe("OpenFreeMap waterway detail", () => {
  it("plans the six z9 tiles covering the Bakhapcha route bounds", () => {
    expect(
      createOpenFreeMapWaterwayDetailPlan({
        style: OPENFREEMAP_STYLE,
        bounds: BAKHAPCHA_BOUNDS,
        mapZoom: 8.1856
      })
    ).toEqual({
      tileJsonUrl: "https://tiles.openfreemap.org/planet",
      tiles: [
        { z: 9, x: 470, y: 143 },
        { z: 9, x: 471, y: 143 },
        { z: 9, x: 470, y: 144 },
        { z: 9, x: 471, y: 144 },
        { z: 9, x: 470, y: 145 },
        { z: 9, x: 471, y: 145 }
      ]
    });
  });

  it.each([
    [9, "native z9 tiles already contain the detail"],
    [10.5, "native higher-zoom tiles already contain the detail"],
    [-0.1, "the map zoom is outside the supported range"]
  ])("skips the overlay when %s", (mapZoom) => {
    expect(
      createOpenFreeMapWaterwayDetailPlan({
        style: OPENFREEMAP_STYLE,
        bounds: BAKHAPCHA_BOUNDS,
        mapZoom
      })
    ).toBeNull();
  });

  it("skips the overlay when the z9 coverage exceeds its tile cap", () => {
    expect(
      createOpenFreeMapWaterwayDetailPlan({
        style: OPENFREEMAP_STYLE,
        bounds: BAKHAPCHA_BOUNDS,
        mapZoom: 8,
        maxTileCount: 5
      })
    ).toBeNull();
  });

  it("keeps TileJSON and tile failures best-effort", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    await expect(
      fetchOpenFreeMapWaterwayDetail({
        plan: createOpenFreeMapWaterwayDetailPlan({
          style: OPENFREEMAP_STYLE,
          bounds: BAKHAPCHA_BOUNDS,
          mapZoom: 8
        }),
        fetcher
      })
    ).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      "https://tiles.openfreemap.org/planet",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("times out a fetch that ignores abort signals without failing the map", async () => {
    const fetcher = vi.fn(() => new Promise(() => {}));
    const detail = await Promise.race([
      fetchOpenFreeMapWaterwayDetail({
        plan: createOpenFreeMapWaterwayDetailPlan({
          style: OPENFREEMAP_STYLE,
          bounds: BAKHAPCHA_BOUNDS,
          mapZoom: 8
        }),
        fetcher,
        timeoutMs: 5
      }),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 25))
    ]);

    expect(detail).toBeNull();
  });
});
