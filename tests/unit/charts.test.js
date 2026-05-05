import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { createElevationPosterOption } from "../../src/render/echarts-options.js";
import {
  disposeElevationChart,
  renderElevationChart,
  selectElevationChartSamples
} from "../../src/render/elevation-chart.js";
import { renderSlopeChart, renderSpeedChart } from "../../src/render/series-charts.js";

const analysis = {
  distanceSeries: [
    { distanceFromStartMeters: 0, elevation: 600 },
    { distanceFromStartMeters: 5000, elevation: 1000 },
    { distanceFromStartMeters: 10000, elevation: 2031 },
    { distanceFromStartMeters: 15000, elevation: 900 }
  ],
  speedSeries: [
    { distanceFromStartMeters: 0, speedKmh: 3 },
    { distanceFromStartMeters: 5000, speedKmh: 7 },
    { distanceFromStartMeters: 10000, speedKmh: 4 }
  ],
  slopeSeries: [
    { distanceFromStartMeters: 0, slopePercent: 4 },
    { distanceFromStartMeters: 5000, slopePercent: 23 },
    { distanceFromStartMeters: 10000, slopePercent: -12 }
  ],
  averageSpeedKmh: 4.11,
  movingAverageSpeedKmh: 5.3,
  maxElevationMeters: 2031,
  minElevationMeters: 600
};

describe("chart renderers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      /** @type {CanvasRenderingContext2D} */ ({
        measureText: (value) => createTextMetrics(String(value).length * 8)
      })
    );
  });

  it("renders localized elevation chart with ECharts SVG engine", () => {
    const host = document.createElement("div");
    renderElevationChart(host, analysis, createI18n("de", LOCALES));
    const chartHost = host.querySelector("[data-chart-engine='echarts']");

    expect(chartHost).not.toBeNull();
    expect(chartHost?.querySelector("svg")).not.toBeNull();
    expect(chartHost?.querySelector(".echarts-chart-title")).toBeNull();
    expect(chartHost?.getAttribute("aria-label")).toBe("Routen-Höhenprofil");
    expect(chartHost?.textContent).not.toContain("Höhenprofil");
  });

  it("disposes elevation chart resources idempotently", () => {
    const host = document.createElement("div");
    const disconnect = vi.fn();
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class FakeResizeObserver {
        observe = vi.fn();
        disconnect = disconnect;
      }
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 42)
    );
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    renderElevationChart(host, analysis, createI18n("en", LOCALES));
    expect(host.querySelector("[data-chart-engine='echarts']")).not.toBeNull();

    expect(() => disposeElevationChart(host)).not.toThrow();
    expect(() => disposeElevationChart(host)).not.toThrow();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });

  it("prefers filtered elevation chart samples and falls back to distance samples", () => {
    const filteredSamples = [
      { distanceFromStartMeters: 0, elevation: 100 },
      { distanceFromStartMeters: 10, elevation: 101 },
      { distanceFromStartMeters: 20, elevation: 100.5 }
    ];
    const rawDistanceSamples = [
      { distanceFromStartMeters: 0, elevation: 180 },
      { distanceFromStartMeters: 10, elevation: 100 },
      { distanceFromStartMeters: 20, elevation: 101 }
    ];

    expect(
      selectElevationChartSamples({
        distanceSeries: rawDistanceSamples,
        elevationSeries: filteredSamples
      })
    ).toEqual(filteredSamples);
    expect(
      Math.max(
        ...selectElevationChartSamples({
          distanceSeries: rawDistanceSamples,
          elevationSeries: filteredSamples
        }).map((sample) => sample.elevation)
      )
    ).toBeLessThan(120);
    expect(
      selectElevationChartSamples({
        distanceSeries: rawDistanceSamples,
        elevationSeries: [100, 101, 100.5]
      })
    ).toEqual(rawDistanceSamples);
  });

  it("breaks the elevation line between model continuity runs", () => {
    const option = createElevationPosterOption(
      [
        { distanceFromStartMeters: 0, elevation: 100, continuousRunId: 0 },
        { distanceFromStartMeters: 10, elevation: 105, continuousRunId: 0 },
        { distanceFromStartMeters: 30, elevation: 500, continuousRunId: 1 },
        { distanceFromStartMeters: 40, elevation: 505, continuousRunId: 1 }
      ],
      createI18n("en", LOCALES)
    );
    const data = option.series[0].data;

    expect(data).toContainEqual([0.03, null]);
    expect(option.series[0].connectNulls).toBe(false);
  });

  it("renders localized speed svg with average line", () => {
    const host = document.createElement("div");
    renderSpeedChart(host, analysis, createI18n("es", LOCALES));

    expect(host.querySelector("[data-chart-ribbon='speed']")).not.toBeNull();
    expect(host.querySelector("[data-chart-line='speed']")).not.toBeNull();
    expect(host.querySelector("[data-average-speed]")).not.toBeNull();
    expect(host.querySelector("[data-moving-speed]")).not.toBeNull();
    expect(host.querySelector("[data-chart-legend='speed']")).not.toBeNull();
    expect(host.querySelector("[data-chart-heading='speed']")).not.toBeNull();
    expect(host.querySelector("[data-chart-heading='speed']")?.classList).toContain(
      "chart-title--poster"
    );
    expect(host.querySelector("[data-chart-heading='speed']")?.getAttribute("y")).toBe("28");
    moveOverChart(host, "speed", 392);
    expect(host.querySelector("[data-chart-tooltip='speed']")).not.toBeNull();
    expect(host.querySelector("[data-chart-tooltip='speed']")?.textContent).toContain("7,0");
    expect(host.textContent).toContain("Velocidad");
    expect(host.textContent).toContain("media");
  });

  it("does not reduce every speed sample while moving the tooltip pointer", () => {
    const host = document.createElement("div");
    const speedSeries = Array.from({ length: 256 }, (_, index) => ({
      distanceFromStartMeters: index * 100,
      speedKmh: 3 + (index % 12)
    }));
    renderSpeedChart(
      host,
      {
        ...analysis,
        speedSeries
      },
      createI18n("en")
    );

    const originalReduce = Array.prototype.reduce;
    let largeReductions = 0;
    Array.prototype.reduce = function patchedReduce(...args) {
      if (this.length >= 128) {
        largeReductions += 1;
      }

      return Reflect.apply(originalReduce, this, args);
    };

    try {
      moveOverChart(host, "speed", 392);
    } finally {
      Array.prototype.reduce = originalReduce;
    }

    expect(largeReductions).toBe(0);
  });

  it("does not pass large speed sample arrays to Math extrema", () => {
    const host = document.createElement("div");
    const originalMax = Math.max;
    const maxArgCounts = [];
    const speedSeries = Array.from({ length: 160 }, (_, index) => ({
      distanceFromStartMeters: index * 100,
      speedKmh: 2 + (index % 24)
    }));

    Math.max = function patchedMax(...args) {
      maxArgCounts.push(args.length);
      if (args.length > 8) {
        throw new Error(`Math.max spread budget exceeded with ${args.length} arguments`);
      }

      return originalMax.apply(this, args);
    };

    try {
      renderSpeedChart(
        host,
        {
          ...analysis,
          speedSeries
        },
        createI18n("en")
      );
    } finally {
      Math.max = originalMax;
    }

    expect(host.querySelector("[data-chart-line='speed']")).not.toBeNull();
    expect(maxArgCounts.every((count) => count <= 8)).toBe(true);
  });

  it("renders localized slope svg with positive and negative bars", () => {
    const host = document.createElement("div");
    renderSlopeChart(host, analysis, createI18n("fr", LOCALES));

    expect(host.querySelector("[data-slope-baseline]")).not.toBeNull();
    expect(host.querySelector("[data-slope-bar='up']")).not.toBeNull();
    expect(host.querySelector("[data-slope-bar='down']")).not.toBeNull();
    expect(host.querySelector("[data-chart-legend='slope']")).not.toBeNull();
    expect(host.querySelector("[data-chart-heading='slope']")).not.toBeNull();
    expect(host.querySelector("[data-chart-heading='slope']")?.classList).toContain(
      "chart-title--poster"
    );
    expect(host.querySelector("[data-chart-heading='slope']")?.getAttribute("y")).toBe("28");
    expect(
      Number(host.querySelector("[data-slope-bar='up']")?.getAttribute("width"))
    ).toBeGreaterThan(100);
    moveOverChart(host, "slope", 392);
    expect(host.querySelector("[data-chart-tooltip='slope']")).not.toBeNull();
    expect(host.querySelector("[data-chart-tooltip='slope']")?.textContent).toContain("23.0%");
    expect(host.textContent).toContain("Pente");
    expect(host.textContent).toContain("montée");
  });
});

/**
 * @param {number} width
 * @returns {TextMetrics}
 */
function createTextMetrics(width) {
  return {
    width,
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: width,
    fontBoundingBoxAscent: 9,
    fontBoundingBoxDescent: 3,
    emHeightAscent: 9,
    emHeightDescent: 3,
    hangingBaseline: 7,
    alphabeticBaseline: 0,
    ideographicBaseline: -2
  };
}

/**
 * @param {HTMLElement} host
 * @param {string} name
 * @param {number} clientX
 */
function moveOverChart(host, name, clientX) {
  const svg = host.querySelector("svg");
  const target = host.querySelector(`[data-chart-hover-target='${name}']`);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 760,
      height: 230,
      right: 760,
      bottom: 230,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  });

  const PointerMoveEvent = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
  target?.dispatchEvent(
    new PointerMoveEvent("pointermove", {
      bubbles: true,
      clientX,
      clientY: 90
    })
  );
}
