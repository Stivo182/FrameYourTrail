import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP_STYLE_ID,
  MAP_STYLE_OPTIONS,
  getMapTextLabelBoundaryIndex,
  getMapStyleDefinition,
  loadMapStyle,
  normalizeMapStyleId
} from "../../src/render/map-styles.js";
import { createOpenFreeMapStyleResponse } from "./helpers/openfreemap-style-fixture.js";

describe("map style catalog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createOpenFreeMapStyleResponse())
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes a fixed no-key map style catalog", () => {
    expect(DEFAULT_MAP_STYLE_ID).toBe("openfreemap_poster");
    expect(MAP_STYLE_OPTIONS.map((style) => style.id)).toEqual([
      "openfreemap_poster",
      "osm_standard",
      "cyclosm"
    ]);
    expect(MAP_STYLE_OPTIONS.some((style) => /maptiler/i.test(style.id))).toBe(false);
    expect(getMapStyleDefinition("cyclosm")).toMatchObject({ id: "cyclosm", kind: "raster" });
    expect(normalizeMapStyleId("cyclosm")).toBe("cyclosm");
    expect(normalizeMapStyleId("missing")).toBe(DEFAULT_MAP_STYLE_ID);
  });

  it("exports one fail-safe geometry-to-text-label boundary", () => {
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "early-arrow", type: "symbol" },
        { id: "road", type: "line" },
        { id: "building", type: "fill" },
        { id: "late-arrow", type: "symbol", layout: { "icon-image": "oneway" } },
        { id: "place-label", type: "symbol", layout: { "text-field": ["get", "name"] } },
        { id: "road-label", type: "symbol", layout: { "text-field": ["get", "name"] } }
      ])
    ).toBe(4);
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "place-label", type: "symbol", layout: { "text-field": ["get", "name"] } },
        { id: "road-label", type: "symbol", layout: { "text-field": ["get", "name"] } }
      ])
    ).toBe(0);
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "early-arrow", type: "symbol" },
        { id: "early-shield", type: "symbol" }
      ])
    ).toBe(2);
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "background", type: "background" },
        { id: "road", type: "line" }
      ])
    ).toBe(2);
    expect(getMapTextLabelBoundaryIndex([])).toBe(0);
  });

  it("generates cloned raster MapLibre styles with attribution", async () => {
    const firstStyle = await loadMapStyle("osm_standard");
    const secondStyle = await loadMapStyle("osm_standard");

    expect(firstStyle).not.toBe(secondStyle);
    expect(firstStyle.sources["osm-standard-raster"]).toMatchObject({
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: expect.stringContaining("OpenStreetMap")
    });
    expect(firstStyle.layers).toEqual([
      {
        id: "osm-standard-raster",
        type: "raster",
        source: "osm-standard-raster"
      }
    ]);
    firstStyle.layers.push({ id: "mutation", type: "background" });
    expect(secondStyle.layers).toHaveLength(1);
  });

  it("times out OpenFreeMap style requests when the fetcher stalls", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise(() => {}));

    try {
      const stylePromise = loadMapStyle("openfreemap_poster", {
        timeoutMs: 5,
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        fetcher
      });
      const assertion = expect(stylePromise).rejects.toThrow(/timeout/i);

      await vi.advanceTimersByTimeAsync(5);

      await assertion;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
