import { describe, expect, it, vi } from "vitest";
import {
  createOpenFreeMapWaterwayDetailLayers,
  createOpenFreeMapWaterwayDetailPlan,
  fetchOpenFreeMapWaterwayDetail
} from "../../src/render/waterway-detail.js";
import { createWaterwayVectorTile } from "../helpers/vector-tile.js";

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

const TILE_TEMPLATE = "https://tiles.openfreemap.org/planet/current/{z}/{x}/{y}.pbf";

function createTileJsonResponse(tiles = [TILE_TEMPLATE]) {
  return new Response(JSON.stringify({ tiles }), {
    headers: { "Content-Type": "application/json" }
  });
}

function createBakhapchaPlan() {
  return createOpenFreeMapWaterwayDetailPlan({
    style: OPENFREEMAP_STYLE,
    bounds: BAKHAPCHA_BOUNDS,
    mapZoom: 8
  });
}

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

  it("rejects world coverage before materializing any z9 tile coordinates", () => {
    const originalPush = Array.prototype.push;
    let detailTilePushes = 0;

    Array.prototype.push = function (...items) {
      detailTilePushes += items.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          item.z === 9 &&
          Number.isFinite(item.x) &&
          Number.isFinite(item.y)
      ).length;
      return Reflect.apply(originalPush, this, items);
    };

    try {
      expect(
        createOpenFreeMapWaterwayDetailPlan({
          style: OPENFREEMAP_STYLE,
          bounds: {
            minLatitude: -85,
            maxLatitude: 85,
            minLongitude: -180,
            maxLongitude: 180
          },
          mapZoom: 0
        })
      ).toBeNull();
    } finally {
      Array.prototype.push = originalPush;
    }

    expect(detailTilePushes).toBe(0);
  });

  it("keeps a TileJSON request failure best-effort without requesting tiles", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network unavailable");
    });

    await expect(
      fetchOpenFreeMapWaterwayDetail({
        plan: createBakhapchaPlan(),
        fetcher
      })
    ).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      "https://tiles.openfreemap.org/planet",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps decoded named properties from successful tiles when sibling tiles fail", async () => {
    const tileData = createWaterwayVectorTile({
      features: [
        {
          properties: {
            name: "Bakhapcha Tributary",
            class: "river",
            rank: 3
          }
        },
        { properties: { name: "Hidden Tunnel", brunnel: "tunnel" } },
        { properties: { name: "Waterway Point" }, geometryType: 1 }
      ]
    });
    const fetcher = vi.fn(async (url) => {
      if (url === "https://tiles.openfreemap.org/planet") {
        return createTileJsonResponse();
      }

      return url.endsWith("/9/470/143.pbf")
        ? new Response(Uint8Array.from(tileData).buffer)
        : new Response(null, { status: 503 });
    });

    await expect(
      fetchOpenFreeMapWaterwayDetail({ plan: createBakhapchaPlan(), fetcher })
    ).resolves.toMatchObject({
      type: "FeatureCollection",
      features: [
        {
          properties: {
            name: "Bakhapcha Tributary",
            class: "river",
            rank: 3
          },
          geometry: { type: "LineString" }
        }
      ]
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it("keeps a malformed vector tile best-effort when another tile decodes", async () => {
    const tileData = createWaterwayVectorTile({
      features: [{ properties: { name: "Decoded Tributary", class: "stream" } }]
    });
    const fetcher = vi.fn(async (url) => {
      if (url === "https://tiles.openfreemap.org/planet") {
        return createTileJsonResponse();
      }

      if (url.endsWith("/9/470/143.pbf")) {
        return new Response(Uint8Array.from([255, 255, 255]).buffer);
      }

      return url.endsWith("/9/471/143.pbf")
        ? new Response(Uint8Array.from(tileData).buffer)
        : new Response(null, { status: 503 });
    });

    await expect(
      fetchOpenFreeMapWaterwayDetail({ plan: createBakhapchaPlan(), fetcher })
    ).resolves.toMatchObject({
      type: "FeatureCollection",
      features: [{ properties: { name: "Decoded Tributary", class: "stream" } }]
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it("ignores malformed TileJSON before requesting vector tiles", async () => {
    const fetcher = vi.fn(async () => createTileJsonResponse(["https://example.test/no-tags.pbf"]));

    await expect(
      fetchOpenFreeMapWaterwayDetail({ plan: createBakhapchaPlan(), fetcher })
    ).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores vector tiles without a waterway source layer", async () => {
    const tileData = createWaterwayVectorTile({
      layerName: "transportation",
      features: [{ properties: { name: "Not a river" } }]
    });
    const fetcher = vi.fn(async (url) =>
      url === "https://tiles.openfreemap.org/planet"
        ? createTileJsonResponse()
        : new Response(Uint8Array.from(tileData).buffer)
    );

    await expect(
      fetchOpenFreeMapWaterwayDetail({ plan: createBakhapchaPlan(), fetcher })
    ).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it("derives the source URL and preserves native line and poster label styling", () => {
    const style = {
      sources: {
        renamedProviderSource: {
          type: "vector",
          url: "https://example.test/current-planet"
        }
      },
      layers: [
        {
          id: "renamed-river-line",
          type: "line",
          source: "renamedProviderSource",
          "source-layer": "waterway",
          minzoom: 11,
          filter: ["==", ["get", "class"], "river"],
          layout: { "line-cap": "round" },
          paint: { "line-color": "#123456", "line-width": 2 }
        },
        {
          id: "poster-waterway-label",
          type: "symbol",
          source: "renamedProviderSource",
          "source-layer": "waterway",
          minzoom: 9,
          maxzoom: 14,
          filter: ["has", "name"],
          layout: { "symbol-placement": "line", "text-field": ["get", "name"] },
          paint: { "text-color": "#654321", "text-halo-width": 1 }
        }
      ]
    };

    expect(
      createOpenFreeMapWaterwayDetailPlan({
        style,
        bounds: BAKHAPCHA_BOUNDS,
        mapZoom: 8
      })?.tileJsonUrl
    ).toBe("https://example.test/current-planet");
    expect(createOpenFreeMapWaterwayDetailLayers(style)).toEqual({
      sourceId: "openfreemap-waterway-detail",
      line: {
        id: "openfreemap-waterway-detail-line",
        type: "line",
        source: "openfreemap-waterway-detail",
        layout: { "line-cap": "round" },
        paint: { "line-color": "#123456", "line-width": 2 }
      },
      label: {
        id: "openfreemap-waterway-detail-label",
        type: "symbol",
        source: "openfreemap-waterway-detail",
        layout: { "symbol-placement": "line", "text-field": ["get", "name"] },
        paint: { "text-color": "#654321", "text-halo-width": 1 }
      }
    });
  });

  it("times out a fetch that ignores abort signals without failing the map", async () => {
    const fetcher = vi.fn(() => new Promise(() => {}));
    const detail = await Promise.race([
      fetchOpenFreeMapWaterwayDetail({
        plan: createBakhapchaPlan(),
        fetcher,
        timeoutMs: 5
      }),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 25))
    ]);

    expect(detail).toBeNull();
  });
});
