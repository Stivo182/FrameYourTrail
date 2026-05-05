import { describe, expect, it, vi } from "vitest";
import { exportPoster, getExportFileName } from "../../src/controllers/export-controller.js";

function resolvedPreviewRenderer() {
  return {
    getPendingRenderPromises: () => ({
      poster: Promise.resolve(),
      chart: Promise.resolve(),
      map: Promise.resolve()
    })
  };
}

function deferred() {
  /** @type {() => void} */
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = () => done(undefined);
  });
  return { promise, resolve };
}

describe("export controller", () => {
  it("derives export file names from the current source file", () => {
    expect(getExportFileName("ride.gpx")).toBe("ride");
    expect(getExportFileName("archive.route.tcx")).toBe("archive.route");
    expect(getExportFileName("route")).toBe("route");
    expect(getExportFileName(".gpx")).toBe("frame-your-trail");
  });

  it("waits for poster, chart, and map render work before exporting", async () => {
    const root = document.createElement("div");
    const node = document.createElement("article");
    node.className = "infographic";
    root.append(node);
    document.body.append(root);
    const poster = deferred();
    const chart = deferred();
    const map = deferred();
    const exportPng = vi.fn(async () => {});
    const operation = exportPoster({
      kind: "png",
      root,
      fileName: "track.gpx",
      templateId: "route-report",
      previewRenderer: {
        getPendingRenderPromises: () => ({
          poster: poster.promise,
          chart: chart.promise,
          map: map.promise
        })
      },
      exporters: { exportPng }
    });

    await Promise.resolve();
    expect(exportPng).not.toHaveBeenCalled();

    poster.resolve();
    await Promise.resolve();
    expect(exportPng).not.toHaveBeenCalled();

    chart.resolve();
    map.resolve();
    await expect(operation).resolves.toBe(true);
    expect(exportPng).toHaveBeenCalledWith(node, "track");
  });

  it("does not export when the poster node is missing", async () => {
    const exportPng = vi.fn(async () => {});

    await expect(
      exportPoster({
        kind: "png",
        root: document.createElement("div"),
        fileName: "track.gpx",
        templateId: "route-report",
        previewRenderer: resolvedPreviewRenderer(),
        exporters: { exportPng }
      })
    ).resolves.toBe(false);
    expect(exportPng).not.toHaveBeenCalled();
  });

  it("returns false when no poster exists after pending poster render settles", async () => {
    const root = document.createElement("div");
    const poster = deferred();
    const exportPng = vi.fn(async () => {});
    const operation = exportPoster({
      kind: "png",
      root,
      fileName: "track.gpx",
      templateId: "route-report",
      previewRenderer: {
        getPendingRenderPromises: () => ({
          poster: poster.promise,
          chart: Promise.resolve(),
          map: Promise.resolve()
        })
      },
      exporters: { exportPng }
    });

    await Promise.resolve();
    expect(exportPng).not.toHaveBeenCalled();

    poster.resolve();
    await expect(operation).resolves.toBe(false);
    expect(exportPng).not.toHaveBeenCalled();
  });

  it("routes pdf and clipboard exports to the matching exporter", async () => {
    const root = document.createElement("div");
    const node = document.createElement("article");
    node.className = "infographic";
    root.append(node);
    document.body.append(root);
    const exportPdf = vi.fn(async () => {});
    const copyPngToClipboard = vi.fn(async () => {});

    await expect(
      exportPoster({
        kind: "pdf",
        root,
        fileName: "track.gpx",
        templateId: "route-report",
        previewRenderer: resolvedPreviewRenderer(),
        exporters: { exportPdf }
      })
    ).resolves.toBe(true);
    await expect(
      exportPoster({
        kind: "clipboard",
        root,
        fileName: "track.gpx",
        templateId: "route-report",
        previewRenderer: resolvedPreviewRenderer(),
        exporters: { copyPngToClipboard }
      })
    ).resolves.toBe(true);

    expect(exportPdf).toHaveBeenCalledWith(node, "track", "route-report");
    expect(copyPngToClipboard).toHaveBeenCalledWith(node);
  });
});
