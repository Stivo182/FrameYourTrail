import { describe, expect, it } from "vitest";
import { createPreviewRenderer, readCssPixelValue } from "../../src/render/preview-renderer.js";

const i18n = { language: "en", t: (key) => key };

const payload = {
  mapStyleId: "cyclosm",
  title: "Track",
  dateLabel: "",
  fileName: "track.gpx",
  warnings: [],
  trackLocation: null,
  parsed: {
    hasElevation: false,
    hasTime: false,
    elevationSource: /** @type {const} */ ("none"),
    points: [{ latitude: 1, longitude: 2, elevation: null, timestamp: null, segmentIndex: 0 }]
  },
  analysis: {
    distanceSeries: [],
    routePoints: [{ latitude: 3, longitude: 4, elevation: null, timestamp: null, segmentIndex: 0 }],
    speedSeries: [{ distanceFromStartMeters: 0, speedKmh: 12 }]
  }
};

function createPreviewHost() {
  document.body.innerHTML = `
    <section class="workspace">
      <div class="poster-scroll">
        <div class="poster-preview-frame" data-poster-preview-frame>
          <div class="poster-preview-scale" data-preview-root></div>
        </div>
      </div>
    </section>
  `;

  const host = document.querySelector("[data-preview-root]");
  if (!(host instanceof HTMLElement)) {
    throw new Error("Preview host was not created");
  }

  return host;
}

function createPreviewElement() {
  const preview = document.createElement("article");
  preview.className = "infographic";
  preview.style.setProperty("--poster-width", "400px");
  preview.style.setProperty("--poster-height", "600px");
  preview.innerHTML = `
    <div data-map-slot></div>
    <div data-chart="elevation"></div>
  `;
  return preview;
}

function deferred() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("preview renderer", () => {
  it("reads CSS pixel values conservatively", () => {
    expect(readCssPixelValue("120px")).toBe(120);
    expect(readCssPixelValue("12.5px")).toBe(12.5);
    expect(readCssPixelValue("12rem")).toBeNull();
    expect(readCssPixelValue("")).toBeNull();
  });

  it("renders poster, map, and elevation chart through injected lazy loaders", async () => {
    const host = createPreviewHost();
    const preview = createPreviewElement();
    /** @type {unknown[]} */
    let mapArgs = [];
    /** @type {unknown[]} */
    let chartArgs = [];
    const renderer = createPreviewRenderer({
      loadPosterRenderer: async () => ({
        renderInfographic: () => preview
      }),
      getRouteMapRenderer: async () => ({
        render: async (...args) => {
          mapArgs = args;
        }
      }),
      loadElevationChart: async () => ({
        renderElevationChart: (...args) => {
          chartArgs = args;
        }
      })
    });

    await renderer.render(host, payload, i18n);
    await Promise.all([
      renderer.getPendingRenderPromises().map,
      renderer.getPendingRenderPromises().chart
    ]);

    expect(host.firstElementChild).toBe(preview);
    expect(mapArgs[0]).toBe(preview.querySelector("[data-map-slot]"));
    expect(mapArgs[1]).toBe(payload.analysis.routePoints);
    expect(mapArgs[3]).toBe(payload.analysis.speedSeries);
    expect(mapArgs[4]).toBe("cyclosm");
    expect(chartArgs[0]).toBe(preview.querySelector("[data-chart='elevation']"));
    expect(chartArgs[1]).toBe(payload.analysis);
    expect(preview.closest("[data-poster-preview-frame]")?.getAttribute("style")).toContain(
      "--poster-width: 400px"
    );
  });

  it("disposes the rendered elevation chart host on reset", async () => {
    const host = createPreviewHost();
    const preview = createPreviewElement();
    /** @type {HTMLElement | undefined} */
    let renderedChartHost;
    /** @type {HTMLElement[]} */
    const disposedChartHosts = [];
    const renderer = createPreviewRenderer({
      loadPosterRenderer: async () => ({
        renderInfographic: () => preview
      }),
      getRouteMapRenderer: async () => ({
        render: async () => {}
      }),
      loadElevationChart: async () => ({
        renderElevationChart: (chartHost) => {
          renderedChartHost = chartHost;
        },
        disposeElevationChart: (chartHost) => {
          disposedChartHosts.push(chartHost);
        }
      })
    });

    await renderer.render(host, payload, i18n);
    await renderer.getPendingRenderPromises().chart;
    renderer.reset();

    expect(renderedChartHost).toBe(preview.querySelector("[data-chart='elevation']"));
    expect(disposedChartHosts).toEqual([renderedChartHost]);
  });

  it("does not dispose an elevation chart before one has rendered", () => {
    /** @type {HTMLElement[]} */
    const disposedChartHosts = [];
    const renderer = createPreviewRenderer({
      loadPosterRenderer: async () => ({
        renderInfographic: createPreviewElement
      }),
      getRouteMapRenderer: async () => ({
        render: async () => {}
      }),
      loadElevationChart: async () => ({
        renderElevationChart: () => {},
        disposeElevationChart: (chartHost) => {
          disposedChartHosts.push(chartHost);
        }
      })
    });

    renderer.reset();

    expect(disposedChartHosts).toEqual([]);
  });

  it("ignores poster work that resolves after reset", async () => {
    const host = createPreviewHost();
    const gate = deferred();
    const renderer = createPreviewRenderer({
      loadPosterRenderer: async () =>
        /** @type {Promise<{ renderInfographic: () => HTMLElement }>} */ (gate.promise),
      getRouteMapRenderer: async () => ({
        render: async () => {}
      }),
      loadElevationChart: async () => ({
        renderElevationChart: () => {}
      })
    });

    const renderPromise = renderer.render(host, payload, i18n);
    renderer.reset();
    gate.resolve({ renderInfographic: createPreviewElement });
    await renderPromise;

    expect(host.children).toHaveLength(0);
  });

  it("renders a localized alert when poster rendering fails", async () => {
    const host = createPreviewHost();
    const renderer = createPreviewRenderer({
      loadPosterRenderer: async () => {
        throw new Error("poster failed");
      },
      getRouteMapRenderer: async () => ({
        render: async () => {}
      }),
      loadElevationChart: async () => ({
        renderElevationChart: () => {}
      })
    });

    await renderer.render(host, payload, {
      language: "en",
      t: (key) =>
        key === "messages.previewRenderError" ? "Could not render the poster preview." : key
    });

    expect(host.querySelector("[data-preview-render-error]")).not.toBeNull();
    expect(host.querySelector("[role='alert']")).not.toBeNull();
    expect(host.textContent).toContain("Could not render the poster preview.");
  });

  it("marks map and chart slots when lazy renderers fail", async () => {
    const host = createPreviewHost();
    const preview = createPreviewElement();
    const renderer = createPreviewRenderer({
      loadPosterRenderer: async () => ({
        renderInfographic: () => preview
      }),
      getRouteMapRenderer: async () => ({
        render: async () => {
          throw new Error("map failed");
        }
      }),
      loadElevationChart: async () => {
        throw new Error("chart failed");
      }
    });

    await renderer.render(host, payload, i18n);
    await Promise.all([
      renderer.getPendingRenderPromises().map,
      renderer.getPendingRenderPromises().chart
    ]);

    expect(preview.querySelector("[data-map-slot]")?.getAttribute("data-map-status")).toBe("error");
    expect(
      preview.querySelector("[data-chart='elevation']")?.getAttribute("data-chart-status")
    ).toBe("error");
  });
});
