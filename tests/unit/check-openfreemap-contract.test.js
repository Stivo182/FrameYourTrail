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

function readProviderFixture() {
  return JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../fixtures/openfreemap-provider-feature-contract.json"),
      "utf8"
    )
  );
}

async function createPosterStyle() {
  const { loadMapStyle } = await import("../../src/render/map-styles.js");
  const libertyFixture = readLibertyFixture();

  return loadMapStyle("openfreemap_poster", {
    fetcher: async () =>
      new Response(JSON.stringify(libertyFixture), {
        headers: { "Content-Type": "application/json" }
      })
  });
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

  it("preserves exact decoded Unicode names in the provider fixture", () => {
    const featuresById = new Map(
      readProviderFixture().features.map((feature) => [feature.id, feature])
    );

    expect(featuresById.get("miyajima-ropeway-label").properties.name).toBe("宮島ロープウエー");
    expect(featuresById.get("jr-miyajima-ferry-label").properties.name).toBe("JR宮島連絡船");
  });

  it("matches every filter-relevant provider property while ignoring unrelated properties", async () => {
    const { featureMatchesContract } = await loadChecker();
    const contractFeature = {
      sourceLayer: "transportation_name",
      geometryType: "LineString",
      properties: {
        name: "Miyajima Ropeway base name",
        name_en: "Miyajima Ropeway",
        "name:en": "Miyajima Ropeway",
        "name:latin": "Miyajima Ropeway",
        class: "aerialway",
        subclass: "cable_car",
        rank: 1,
        oneway: 1
      }
    };
    const matchingFeature = {
      sourceLayer: "transportation_name",
      geometryType: "LineString",
      properties: {
        name: "Miyajima Ropeway base name",
        name_en: "Miyajima Ropeway",
        "name:en": "Miyajima Ropeway",
        "name:latin": "Miyajima Ropeway",
        class: "aerialway",
        subclass: "cable_car",
        rank: 1,
        oneway: 0
      }
    };

    expect(featureMatchesContract(contractFeature, matchingFeature)).toBe(true);
    for (const property of [
      "class",
      "subclass",
      "name",
      "name_en",
      "name:en",
      "name:latin",
      "rank"
    ]) {
      const candidate = structuredClone(matchingFeature);
      delete candidate.properties[property];

      expect(featureMatchesContract(contractFeature, candidate), property).toBe(false);
    }
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

  it("rejects a motorway candidate without its base name from the contract and generated filter", async () => {
    const { featureMatchesContract, featurePassesPosterFilter } = await loadChecker();
    const contractFeature = readProviderFixture().features.find(
      (feature) => feature.id === "john-fitzgerald-expressway-label"
    );
    const candidate = structuredClone(contractFeature);
    const posterStyle = await createPosterStyle();

    expect(featureMatchesContract(contractFeature, candidate)).toBe(true);
    expect(featurePassesPosterFilter(contractFeature, candidate, posterStyle)).toBe(true);

    delete candidate.properties.name;

    expect(featureMatchesContract(contractFeature, candidate)).toBe(false);
    expect(featurePassesPosterFilter(contractFeature, candidate, posterStyle)).toBe(false);
  });

  it("rejects a lighthouse candidate without name:en from the contract and generated filter", async () => {
    const { featureMatchesContract, featurePassesPosterFilter } = await loadChecker();
    const contractFeature = readProviderFixture().features.find(
      (feature) => feature.id === "westerheversand-lighthouse-label"
    );
    const candidate = structuredClone(contractFeature);
    const posterStyle = await createPosterStyle();

    expect(featureMatchesContract(contractFeature, candidate)).toBe(true);
    expect(featurePassesPosterFilter(contractFeature, candidate, posterStyle)).toBe(true);

    delete candidate.properties["name:en"];

    expect(featureMatchesContract(contractFeature, candidate)).toBe(false);
    expect(featurePassesPosterFilter(contractFeature, candidate, posterStyle)).toBe(false);
  });

  it("fails when a provider sample target poster layer is missing", async () => {
    const { featurePassesPosterFilter } = await loadChecker();
    const contractFeature = readProviderFixture().features[0];

    expect(() =>
      featurePassesPosterFilter(contractFeature, contractFeature, { layers: [] })
    ).toThrow(/target poster layer .* is missing/);
  });

  it("fails when a provider sample target poster layer has no filter", async () => {
    const { featurePassesPosterFilter } = await loadChecker();
    const contractFeature = readProviderFixture().features[0];
    const posterStyle = await createPosterStyle();
    const targetLayer = posterStyle.layers.find((layer) => layer.id === "poster-aerialway-line");

    if (!targetLayer || !("filter" in targetLayer)) {
      throw new Error("Expected generated poster aerialway layer with a filter");
    }

    delete targetLayer.filter;

    expect(() => featurePassesPosterFilter(contractFeature, contractFeature, posterStyle)).toThrow(
      /target poster layer .* has no filter/
    );
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
