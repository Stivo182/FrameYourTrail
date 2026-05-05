import { describe, expect, it } from "vitest";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { getMetricDisplayItems } from "../../src/render/metric-display.js";

describe("metric display model", () => {
  it("preserves high-precision raw values while rounding formatted display output", () => {
    const analysis = {
      distanceMeters: 12345.6789,
      movingTimeSeconds: 3661.6,
      stoppedTimeSeconds: 59.49,
      totalTimeSeconds: 3721.09,
      overallAverageSpeedKmh: 11.987,
      movingAverageSpeedKmh: 12.345,
      maxSpeedKmh: 45.678,
      elevationGainMeters: 987.654,
      elevationLossMeters: 876.543,
      minElevationMeters: 123.456,
      maxElevationMeters: 789.123,
      elevationRangeMeters: 665.667
    };

    const items = getMetricDisplayItems(analysis, createI18n("en"));
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));

    expect(items.map((item) => item.id)).toEqual([
      "distance",
      "moving-time",
      "stopped-time",
      "total-time",
      "average-speed",
      "moving-speed",
      "max-speed",
      "elevation-gain",
      "elevation-loss",
      "min-elevation",
      "max-elevation",
      "elevation-range"
    ]);
    expect(byId.distance).toMatchObject({
      label: "Distance",
      iconName: "distance",
      rawValue: 12345.6789,
      unit: "meters",
      formattedValue: "12.3 km",
      hero: true
    });
    expect(byId["moving-time"]).toMatchObject({
      rawValue: 3661.6,
      unit: "seconds",
      formattedValue: "1:01:02",
      hero: true
    });
    expect(byId["average-speed"]).toMatchObject({
      rawValue: 11.987,
      unit: "kmh",
      formattedValue: "12.0 km/h"
    });
    expect(byId["elevation-gain"]).toMatchObject({
      rawValue: 987.654,
      unit: "meters",
      formattedValue: "987.7 m",
      hero: true
    });
  });

  it("uses the first available analysis field without feeding rounded display values back into raw metrics", () => {
    const items = getMetricDisplayItems(
      {
        totalDistanceMeters: 23470.44,
        movingDurationSeconds: 20538.51,
        averageSpeedKmh: 4.114,
        elevationGainMeters: 1540.04
      },
      createI18n("de", LOCALES)
    );
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));

    expect(byId.distance.rawValue).toBe(23470.44);
    expect(byId.distance.formattedValue).toBe("23,5 km");
    expect(byId["moving-time"].rawValue).toBe(20538.51);
    expect(byId["moving-time"].formattedValue).toBe("5:42:19");
    expect(byId["moving-speed"].rawValue).toBe(4.114);
    expect(byId["moving-speed"].formattedValue).toBe("4,1 km/h");
  });
});
