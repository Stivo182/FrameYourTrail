import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const loadChecker = () => import("../../scripts/check-openfreemap-contract.mjs");

function readLibertyFixture() {
  return JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../fixtures/openfreemap-liberty-contract.json"),
      "utf8"
    )
  );
}

function createLiveStyle(fixture) {
  const style = structuredClone(fixture);
  delete style.metadata;

  return {
    ...style,
    sources: {
      auxiliary: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      ...style.sources
    },
    layers: [
      { id: "live-only-before", type: "background" },
      ...style.layers,
      { id: "live-only-after", type: "background" }
    ]
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("OpenFreeMap live contract checker", () => {
  it("accepts semantically equal captured sources and layers within a larger live style", async () => {
    const { assertLibertyContract } = await loadChecker();
    const fixture = readLibertyFixture();

    expect(assertLibertyContract(fixture, createLiveStyle(fixture))).toEqual({
      layerCount: 19,
      sourceCount: 2
    });
  });

  it("reports semantic layer drift by captured layer id", async () => {
    const { assertLibertyContract } = await loadChecker();
    const fixture = readLibertyFixture();
    const liveStyle = createLiveStyle(fixture);
    const parkLayer = liveStyle.layers.find((layer) => layer.id === "park");

    parkLayer.paint["fill-opacity"] = 0.5;

    expect(() => assertLibertyContract(fixture, liveStyle)).toThrow(
      /Liberty layer "park" changed semantically/
    );
  });

  it("reports captured layer order drift", async () => {
    const { assertLibertyContract } = await loadChecker();
    const fixture = readLibertyFixture();
    const liveStyle = createLiveStyle(fixture);
    const firstIndex = liveStyle.layers.findIndex((layer) => layer.id === "park");
    const secondIndex = liveStyle.layers.findIndex((layer) => layer.id === "landuse_residential");

    [liveStyle.layers[firstIndex], liveStyle.layers[secondIndex]] = [
      liveStyle.layers[secondIndex],
      liveStyle.layers[firstIndex]
    ];

    expect(() => assertLibertyContract(fixture, liveStyle)).toThrow(
      /captured Liberty layer order changed/
    );
  });

  it("matches provider evidence by layer, geometry type, class, subclass, and stable name", async () => {
    const { featureMatchesContract } = await loadChecker();
    const contractFeature = {
      sourceLayer: "transportation_name",
      geometryType: "LineString",
      properties: {
        name: "Local name that may change",
        name_en: "Miyajima Ropeway",
        class: "aerialway",
        subclass: "cable_car",
        oneway: 1
      }
    };
    const matchingFeature = {
      sourceLayer: "transportation_name",
      geometryType: "LineString",
      properties: {
        name: "Updated local name",
        name_en: "Miyajima Ropeway",
        class: "aerialway",
        subclass: "cable_car"
      }
    };

    expect(featureMatchesContract(contractFeature, matchingFeature)).toBe(true);
    expect(
      featureMatchesContract(contractFeature, {
        ...matchingFeature,
        properties: { ...matchingFeature.properties, name_en: "Another ropeway" }
      })
    ).toBe(false);
    expect(
      featureMatchesContract(contractFeature, {
        ...matchingFeature,
        sourceLayer: "transportation"
      })
    ).toBe(false);
    expect(
      featureMatchesContract(contractFeature, {
        ...matchingFeature,
        geometryType: "Point"
      })
    ).toBe(false);
  });

  it("uses the local name when provider evidence has no English name", async () => {
    const { featureMatchesContract } = await loadChecker();
    const contractFeature = {
      sourceLayer: "poi",
      geometryType: "Point",
      properties: { class: "lighthouse", name: "Cape Light" }
    };

    expect(featureMatchesContract(contractFeature, structuredClone(contractFeature))).toBe(true);
    expect(
      featureMatchesContract(contractFeature, {
        ...contractFeature,
        properties: { class: "lighthouse", name: "Harbor Light" }
      })
    ).toBe(false);
  });

  it("reports HTTP failures with the resource label, status, and URL", async () => {
    const { fetchJson } = await loadChecker();
    const fetcher = vi.fn(
      async () => new Response("unavailable", { status: 503, statusText: "Service Unavailable" })
    );

    await expect(
      fetchJson("https://example.test/style", "Liberty style", { fetcher })
    ).rejects.toThrow(
      "Liberty style request failed with HTTP 503 Service Unavailable: https://example.test/style"
    );
  });

  it("reports request timeouts with the resource label, duration, and URL", async () => {
    vi.useFakeTimers();
    const { fetchJson } = await loadChecker();
    const fetcher = vi.fn(() => new Promise(() => {}));
    const request = fetchJson("https://example.test/planet", "TileJSON", {
      fetcher,
      timeoutMs: 25
    });
    const assertion = expect(request).rejects.toThrow(
      "TileJSON request timed out after 25ms: https://example.test/planet"
    );

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
