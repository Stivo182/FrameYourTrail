import { describe, expect, it } from "vitest";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { createElevationPosterOption } from "../../src/render/echarts-options.js";

const samples = [
  { distanceFromStartMeters: 0, elevation: 620 },
  { distanceFromStartMeters: 500, elevation: 690 },
  { distanceFromStartMeters: 1130, elevation: 735 }
];

describe("echarts poster options", () => {
  it("builds a localized poster-style elevation chart option", () => {
    const option = createElevationPosterOption(samples, createI18n("de", LOCALES));
    const series = option.series[0];

    expect(option.animation).toBe(false);
    expect(option.backgroundColor).toBe("transparent");
    expect(option.textStyle).toMatchObject({
      fontFamily: '"Inter", "Manrope", sans-serif'
    });
    expect(option.title.text).toBe("Höhenprofil");
    expect(option.tooltip.trigger).toBe("axis");
    expect(option.tooltip.className).toBe("echarts-route-tooltip");
    expect(option.tooltip.formatter([{ data: [0.5, 690] }])).toContain("Höhe 690,0 m");
    expect(option.grid).toMatchObject({
      left: 58,
      right: 24,
      top: 18,
      bottom: 24
    });
    expect(option.yAxis).toMatchObject({
      position: "left",
      name: "Höhe, m"
    });
    expect(option.yAxis.axisLabel.show).toBe(true);
    expect(option.yAxis.splitLine.lineStyle).toMatchObject({
      color: "rgba(43, 61, 50, 0.08)",
      type: [4, 8],
      width: 1
    });
    expect(option.visualMap[0]).toMatchObject({
      show: false,
      type: "continuous",
      dimension: 1,
      inRange: {
        color: ["#6f8f4d", "#c99a3d", "#d9793e", "#b94a3a"]
      }
    });
    expect(series).toMatchObject({
      type: "line",
      smooth: true,
      showSymbol: false
    });
    expect(series.lineStyle).toMatchObject({
      cap: "round",
      join: "round"
    });
    expect(series.data).toEqual([
      [0, 620],
      [0.5, 690],
      [1.13, 735]
    ]);
    expect(series.markPoint.data.map((item) => item.itemStyle.color)).toEqual([
      "#6f8f4d",
      "#b94a3a"
    ]);
    expect(series.areaStyle.color.colorStops).toEqual([
      { offset: 0, color: "rgba(217, 121, 62, 0.28)" },
      { offset: 0.58, color: "rgba(201, 154, 61, 0.18)" },
      { offset: 1, color: "rgba(240, 238, 227, 0.04)" }
    ]);
    expect(series.markPoint.data.map((item) => item.name)).toEqual(["Min. Höhe", "Max. Höhe"]);
  });

  it("does not pass large elevation sample arrays to Math extrema", () => {
    const originalMax = Math.max;
    const originalMin = Math.min;
    const maxArgCounts = [];
    const minArgCounts = [];
    const largeSamples = Array.from({ length: 160 }, (_item, index) => ({
      distanceFromStartMeters: index * 100,
      elevation: 500 + Math.sin(index / 9) * 80 + index / 20
    }));

    Math.max = function patchedMax(...args) {
      maxArgCounts.push(args.length);
      if (args.length > 8) {
        throw new Error(`Math.max spread budget exceeded with ${args.length} arguments`);
      }

      return originalMax.apply(this, args);
    };
    Math.min = function patchedMin(...args) {
      minArgCounts.push(args.length);
      if (args.length > 8) {
        throw new Error(`Math.min spread budget exceeded with ${args.length} arguments`);
      }

      return originalMin.apply(this, args);
    };

    try {
      const option = createElevationPosterOption(largeSamples, createI18n("en"));

      expect(option.series[0].data).toHaveLength(160);
      expect(option.visualMap[0].min).toBeLessThan(option.visualMap[0].max);
    } finally {
      Math.max = originalMax;
      Math.min = originalMin;
    }

    expect(maxArgCounts.every((count) => count <= 8)).toBe(true);
    expect(minArgCounts.every((count) => count <= 8)).toBe(true);
  });

  it("keeps dense elevation samples on distinct chart distances", () => {
    const option = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 620 },
        { distanceFromStartMeters: 4, elevation: 625 },
        { distanceFromStartMeters: 8, elevation: 628 },
        { distanceFromStartMeters: 12, elevation: 631 }
      ],
      createI18n("en")
    );

    expect(option.series[0].data.map(([distanceKm]) => distanceKm)).toEqual([
      0, 0.004, 0.008, 0.012
    ]);
  });

  it("formats x-axis distance labels through the shared distance formatter", () => {
    const option = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 620 },
        { distanceFromStartMeters: 1234.56789, elevation: 690 }
      ],
      createI18n("en")
    );

    expect(option.xAxis.axisLabel.formatter(1.23456789)).toBe("1.2 km");
  });

  it("can extend the x-axis to the canonical total distance", () => {
    const option = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 620 },
        { distanceFromStartMeters: 1000, elevation: 690 }
      ],
      createI18n("en"),
      { maxDistanceMeters: 2000 }
    );

    expect(option.series[0].data.at(-1)?.[0]).toBe(1);
    expect(option.xAxis.max).toBe(2);
  });

  it("keeps endpoint extrema labels inside the right edge of the elevation plot", () => {
    const maxAtLastPoint = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 620 },
        { distanceFromStartMeters: 500, elevation: 690 },
        { distanceFromStartMeters: 1000, elevation: 735 }
      ],
      createI18n("en")
    );
    const minAtLastPoint = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 735 },
        { distanceFromStartMeters: 500, elevation: 690 },
        { distanceFromStartMeters: 1000, elevation: 620 }
      ],
      createI18n("en")
    );

    expect(maxAtLastPoint.series[0].markPoint.data[1].label.position).toBe("left");
    expect(minAtLastPoint.series[0].markPoint.data[0].label.position).toBe("left");
  });

  it("keeps near-end extrema labels inside the right edge of the elevation plot", () => {
    const option = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 735 },
        { distanceFromStartMeters: 30000, elevation: 690 },
        { distanceFromStartMeters: 60186, elevation: 620 },
        { distanceFromStartMeters: 60274, elevation: 625 }
      ],
      createI18n("en")
    );

    expect(option.series[0].markPoint.data[0].label.position).toBe("left");
  });

  it("keeps near-start extrema labels inside the left edge of the elevation plot", () => {
    const option = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 620 },
        { distanceFromStartMeters: 88, elevation: 735 },
        { distanceFromStartMeters: 30000, elevation: 690 },
        { distanceFromStartMeters: 60274, elevation: 625 }
      ],
      createI18n("en")
    );

    expect(option.series[0].markPoint.data[1].label.position).toBe("right");
  });

  it("does not treat a zero-distance elevation profile as a right-edge endpoint", () => {
    const option = createElevationPosterOption(
      [{ distanceFromStartMeters: 0, elevation: 620 }],
      createI18n("en")
    );

    expect(option.series[0].markPoint.data[0].label.position).toBe("right");
    expect(option.series[0].markPoint.data[1].label.position).toBe("right");
  });
});
