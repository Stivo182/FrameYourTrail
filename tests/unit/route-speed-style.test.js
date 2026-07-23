import { describe, expect, it } from "vitest";
import { ROUTE_LINE_COLOR, createRouteSpeedGradient } from "../../src/render/map.js";
import { speedSeries } from "./helpers/map-route-fixtures.js";

describe("route speed style", () => {
  it("builds a muted poster red-orange-green MapLibre gradient from speed samples", () => {
    const gradient = createRouteSpeedGradient(speedSeries);

    expect(gradient).toEqual([
      "interpolate",
      ["linear"],
      ["line-progress"],
      0,
      "#b94a3a",
      0.333333,
      "#b94a3a",
      0.666667,
      "#d99a3a",
      1,
      "#6f8f4d"
    ]);
  });

  it("avoids duplicate large sample sorting when building a route speed gradient", () => {
    const originalSort = Array.prototype.sort;
    let largeSorts = 0;

    Array.prototype.sort = function patchedSort(...args) {
      if (this.length >= 128) {
        largeSorts += 1;
      }

      return Reflect.apply(originalSort, this, args);
    };

    try {
      const largeSpeedSeries = Array.from({ length: 160 }, (_, index) => {
        const startDistanceFromStartMeters = index * 100;
        const distanceFromStartMeters = startDistanceFromStartMeters + 100;
        const speedKmh = 8 + (index % 17);

        return {
          index: index + 1,
          startDistanceFromStartMeters,
          distanceFromStartMeters,
          distanceMeters: 100,
          durationSeconds: (100 / speedKmh) * 3.6,
          rawSpeedKmh: speedKmh,
          speedKmh
        };
      });

      const gradient = createRouteSpeedGradient(largeSpeedSeries, 16000);

      expect(gradient).not.toBeNull();
      expect(largeSorts).toBeLessThanOrEqual(2);
    } finally {
      Array.prototype.sort = originalSort;
    }
  });

  it("returns no gradient when speed data cannot create a useful range", () => {
    expect(createRouteSpeedGradient([])).toBeNull();
    expect(
      createRouteSpeedGradient([
        {
          index: 1,
          startDistanceFromStartMeters: 0,
          distanceFromStartMeters: 100,
          distanceMeters: 100,
          durationSeconds: 60,
          rawSpeedKmh: 8,
          speedKmh: 8
        },
        {
          index: 2,
          startDistanceFromStartMeters: 100,
          distanceFromStartMeters: 200,
          distanceMeters: 100,
          durationSeconds: 60,
          rawSpeedKmh: 8,
          speedKmh: 8
        }
      ])
    ).toBeNull();
  });

  it("returns no gradient when speed samples do not cover the rendered route distance", () => {
    expect(createRouteSpeedGradient(speedSeries, 400)).toBeNull();
    expect(
      createRouteSpeedGradient(
        [
          { ...speedSeries[0], startDistanceFromStartMeters: 20, distanceFromStartMeters: 120 },
          { ...speedSeries[1], startDistanceFromStartMeters: 120, distanceFromStartMeters: 220 },
          { ...speedSeries[2], startDistanceFromStartMeters: 220, distanceFromStartMeters: 320 }
        ],
        320
      )
    ).toBeNull();
  });

  it("exports the default route line color", () => {
    expect(ROUTE_LINE_COLOR).toBe("#c95b2e");
  });
});
