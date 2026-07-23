import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenFreeMapStyleResponse } from "./helpers/openfreemap-style-fixture.js";

describe("map style cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createOpenFreeMapStyleResponse())
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries failed OpenFreeMap style requests and reuses cloned sanitized styles", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const { DEFAULT_MAP_STYLE_ID, loadMapStyle } = await import("../../src/render/map-styles.js");

    await expect(loadMapStyle(DEFAULT_MAP_STYLE_ID)).rejects.toThrow(
      "OpenFreeMap style request failed: 503"
    );
    const firstStyle = await loadMapStyle(DEFAULT_MAP_STYLE_ID);
    const secondStyle = await loadMapStyle(DEFAULT_MAP_STYLE_ID);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(firstStyle).not.toBe(secondStyle);
    expect(firstStyle.layers).not.toBe(secondStyle.layers);

    const firstFilteredLayer = /** @type {{ id: string, filter: unknown[] } | undefined} */ (
      firstStyle.layers.find((layer) => "filter" in layer && Array.isArray(layer.filter))
    );
    const secondFilteredLayer = /** @type {{ id: string, filter: unknown[] } | undefined} */ (
      secondStyle.layers.find((layer) => layer.id === firstFilteredLayer?.id)
    );
    const mutationMarker = ["==", ["get", "mutated"], true];

    expect(firstFilteredLayer).toBeDefined();
    expect(secondFilteredLayer).toBeDefined();

    if (!firstFilteredLayer || !secondFilteredLayer) {
      throw new Error("Expected cloned filtered map layers");
    }

    expect(firstFilteredLayer.filter).not.toBe(secondFilteredLayer.filter);
    expect(secondFilteredLayer.filter).toEqual(firstFilteredLayer.filter);

    firstFilteredLayer.filter.push(mutationMarker);

    expect(secondFilteredLayer.filter).not.toContainEqual(mutationMarker);
  });
});
