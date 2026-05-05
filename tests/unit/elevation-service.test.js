import { describe, expect, it, vi } from "vitest";
import { enrichElevationFromTerrain } from "../../src/services/elevation-service.js";

/**
 * @typedef {import("../../src/core/route-types.js").RouteSource} RouteSource
 */

/**
 * @param {number} latitude
 * @param {number} longitude
 * @param {number | null} [elevation]
 */
const point = (latitude, longitude, elevation = null) => ({
  latitude,
  longitude,
  elevation,
  timestamp: null,
  segmentIndex: 0
});

describe("enrichElevationFromTerrain", () => {
  it("keeps GPX elevation without requesting terrain data", async () => {
    const fetcher = vi.fn();
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37, 120), point(55.1, 37.1, 121)],
      hasElevation: true,
      hasTime: false,
      elevationSource: "gpx"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not replace explicit barometric elevation with terrain data", async () => {
    const fetcher = vi.fn();
    /** @type {RouteSource} */
    const parsed = {
      fileName: "barometric.gpx",
      name: "barometric",
      points: [
        { ...point(55, 37, 120), elevationSource: "barometric" },
        { ...point(55.1, 37.1, 121), elevationSource: "barometric" }
      ],
      hasElevation: true,
      hasTime: true,
      elevationSource: "barometric"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not replace missing explicit barometric source with terrain data", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, 181] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "barometric-missing.gpx",
      name: "barometric-missing",
      points: [
        { ...point(55, 37, null), elevationSource: "barometric" },
        { ...point(55.1, 37.1, null), elevationSource: "barometric" }
      ],
      hasElevation: false,
      hasTime: true,
      elevationSource: "barometric"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fills missing elevation from terrain batches", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, 181, 155] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37), point(55.1, 37.1), point(55.2, 37.2)],
      hasElevation: false,
      hasTime: true,
      elevationSource: "none"
    };

    const result = await enrichElevationFromTerrain(parsed, fetcher);

    expect(result.hasElevation).toBe(true);
    expect(result.elevationSource).toBe("terrain");
    expect(result.points.map((item) => item.elevation)).toEqual([156, 181, 155]);
    expect(result.rawPoints).toEqual(parsed.points);
    expect(result.rawPoints?.map((item) => item.elevation)).toEqual([null, null, null]);
    expect(result.points.every((item) => item.elevationSource === "terrain")).toBe(true);
    expect(result.provenance?.terrainElevation).toMatchObject({
      mode: "fallback",
      status: "applied",
      pointCount: 3
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("api.open-meteo.com/v1/elevation")
    );
  });

  it("replaces existing file elevation only when terrain replacement is explicit", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, 181] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37, 120), point(55.1, 37.1, 121)],
      hasElevation: true,
      hasTime: true,
      elevationSource: "gpx"
    };

    const result = await enrichElevationFromTerrain(parsed, fetcher, { mode: "replace" });

    expect(result).not.toBe(parsed);
    expect(result.points.map((item) => item.elevation)).toEqual([156, 181]);
    expect(result.points.every((item) => item.elevationSource === "terrain")).toBe(true);
    expect(result.rawPoints).toEqual(parsed.points);
    expect(result.rawPoints?.map((item) => item.elevation)).toEqual([120, 121]);
    expect(result.provenance?.terrainElevation).toMatchObject({
      mode: "replacement",
      status: "applied",
      pointCount: 2
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves existing raw points and unrelated provenance during terrain replacement", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, 181] })
    }));
    const originalRawPoints = [point(55, 37, 120), point(55.1, 37.1, 121)];
    const parsedPoints = [point(55, 37, 119), point(55.1, 37.1, 123)];
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      rawPoints: originalRawPoints,
      points: parsedPoints,
      hasElevation: true,
      hasTime: true,
      elevationSource: "gpx",
      provenance: {
        format: "gpx",
        rawExtensions: { foo: "bar" }
      }
    };

    const result = await enrichElevationFromTerrain(parsed, fetcher, { mode: "replace" });

    expect(result).not.toBe(parsed);
    expect(result.rawPoints).toBe(originalRawPoints);
    expect(result.rawPoints).toEqual(originalRawPoints);
    expect(result.points.map((item) => item.elevation)).toEqual([156, 181]);
    expect(result.provenance?.rawExtensions).toEqual({ foo: "bar" });
    expect(result.provenance?.terrainElevation).toMatchObject({
      mode: "replacement",
      status: "applied",
      pointCount: 2
    });
  });

  it("keeps original parsed when raw points and parsed points are not length-aligned during replacement", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, 181, 155] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      rawPoints: [point(55, 37, 120), point(55.1, 37.1, 121), point(55.2, 37.2, 119)],
      points: [point(55, 37, 120), point(55.1, 37.1, 121)],
      hasElevation: true,
      hasTime: true,
      elevationSource: "gpx"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher, { mode: "replace" })).resolves.toBe(
      parsed
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("replaces parsed barometric elevation when terrain replacement is explicit", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, 181] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "barometric.gpx",
      name: "barometric",
      points: [point(55, 37, 120), point(55.1, 37.1, 121)],
      hasElevation: true,
      hasTime: true,
      elevationSource: "barometric"
    };

    const result = await enrichElevationFromTerrain(parsed, fetcher, { mode: "replace" });

    expect(result).not.toBe(parsed);
    expect(result.points.map((item) => item.elevation)).toEqual([156, 181]);
    expect(result.points.every((item) => item.elevationSource === "terrain")).toBe(true);
    expect(result.rawPoints).toEqual(parsed.points);
    expect(result.rawPoints?.map((item) => item.elevation)).toEqual([120, 121]);
    expect(result.provenance?.terrainElevation).toMatchObject({
      mode: "replacement",
      status: "applied",
      pointCount: 2
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("replaces point barometric elevation when terrain replacement is explicit", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, 181] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "point-barometric.gpx",
      name: "point-barometric",
      points: [
        { ...point(55, 37, 120), elevationSource: "barometric" },
        { ...point(55.1, 37.1, 121), elevationSource: "barometric" }
      ],
      hasElevation: true,
      hasTime: true,
      elevationSource: "gpx"
    };

    const result = await enrichElevationFromTerrain(parsed, fetcher, { mode: "replace" });

    expect(result).not.toBe(parsed);
    expect(result.points.map((item) => item.elevation)).toEqual([156, 181]);
    expect(result.points.every((item) => item.elevationSource === "terrain")).toBe(true);
    expect(result.rawPoints).toEqual(parsed.points);
    expect(result.rawPoints?.map((item) => item.elevation)).toEqual([120, 121]);
    expect(result.provenance?.terrainElevation).toMatchObject({
      mode: "replacement",
      status: "applied",
      pointCount: 2
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps original parsed when terrain elevation array length mismatches", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37), point(55.1, 37.1)],
      hasElevation: false,
      hasTime: true,
      elevationSource: "none"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps original parsed when terrain elevations are all invalid", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [null, "not-a-number"] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37), point(55.1, 37.1)],
      hasElevation: false,
      hasTime: true,
      elevationSource: "none"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps original parsed when terrain elevations contain mixed invalid values", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elevation: [156, "bad"] })
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37), point(55.1, 37.1)],
      hasElevation: false,
      hasTime: true,
      elevationSource: "none"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries transient terrain lookup failures", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ elevation: [156, 181] })
      });
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37), point(55.1, 37.1)],
      hasElevation: false,
      hasTime: true,
      elevationSource: "none"
    };

    const result = await enrichElevationFromTerrain(parsed, fetcher);

    expect(result.hasElevation).toBe(true);
    expect(result.points.map((item) => item.elevation)).toEqual([156, 181]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry terrain lookup after a rate limit response", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 429,
      json: async () => ({})
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37), point(55.1, 37.1)],
      hasElevation: false,
      hasTime: true,
      elevationSource: "none"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps missing elevation when terrain lookup fails", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      json: async () => ({})
    }));
    /** @type {RouteSource} */
    const parsed = {
      fileName: "track.gpx",
      name: "track",
      points: [point(55, 37), point(55.1, 37.1)],
      hasElevation: false,
      hasTime: true,
      elevationSource: "none"
    };

    await expect(enrichElevationFromTerrain(parsed, fetcher)).resolves.toBe(parsed);
  });
});
