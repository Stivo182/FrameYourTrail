/**
 * @typedef {{
 *   poster: Promise<unknown>,
 *   chart: Promise<unknown>,
 *   map: Promise<unknown>
 * }} PreviewRenderPromises
 */

/**
 * @typedef {{
 *   getPendingRenderPromises: () => PreviewRenderPromises
 * }} PreviewRenderer
 */

/**
 * @typedef {{
 *   exportPng?: (node: HTMLElement, fileName: string) => Promise<void>,
 *   exportJpeg?: (node: HTMLElement, fileName: string) => Promise<void>,
 *   exportPdf?: (node: HTMLElement, fileName: string, templateId: string) => Promise<void>,
 *   copyPngToClipboard?: (node: HTMLElement) => Promise<void>
 * }} Exporters
 */

/**
 * @param {{
 *   kind: string,
 *   root: ParentNode,
 *   fileName: string,
 *   templateId: string,
 *   previewRenderer: PreviewRenderer,
 *   exporters?: Exporters
 * }} options
 * @returns {Promise<boolean>}
 */
export async function exportPoster({
  kind,
  root,
  fileName,
  templateId,
  previewRenderer,
  exporters = defaultExporters
}) {
  await previewRenderer.getPendingRenderPromises().poster;

  const node = root.querySelector(".infographic");

  if (!(node instanceof HTMLElement)) {
    return false;
  }

  const exportFileName = getExportFileName(fileName);
  const { chart, map } = previewRenderer.getPendingRenderPromises();
  await Promise.all([chart, map]);

  if (!node.isConnected) {
    return false;
  }

  if (kind === "png") {
    await getExporter(exporters.exportPng, loadExportPng)(node, exportFileName);
    return true;
  }

  if (kind === "jpeg") {
    await getExporter(exporters.exportJpeg, loadExportJpeg)(node, exportFileName);
    return true;
  }

  if (kind === "pdf") {
    await getExporter(exporters.exportPdf, loadExportPdf)(node, exportFileName, templateId);
    return true;
  }

  if (kind === "clipboard") {
    await getExporter(exporters.copyPngToClipboard, loadCopyPngToClipboard)(node);
    return true;
  }

  return false;
}

/**
 * @param {string} fileName
 */
export function getExportFileName(fileName) {
  return fileName.replace(/\.[^.]+$/, "") || "frame-your-trail";
}

/** @type {Exporters} */
const defaultExporters = {};

/**
 * @template {(...args: any[]) => Promise<void>} T
 * @param {T | undefined} injected
 * @param {() => Promise<T>} loader
 * @returns {T}
 */
function getExporter(injected, loader) {
  if (injected) {
    return injected;
  }

  return /** @type {T} */ (
    async (...args) => {
      const exporter = await loader();
      return exporter(...args);
    }
  );
}

async function loadExportPng() {
  const { exportPng } = await import("../services/image-export-service.js");
  return exportPng;
}

async function loadExportJpeg() {
  const { exportJpeg } = await import("../services/image-export-service.js");
  return exportJpeg;
}

async function loadExportPdf() {
  const { exportPdf } = await import("../services/pdf-export-service.js");
  return exportPdf;
}

async function loadCopyPngToClipboard() {
  const { copyPngToClipboard } = await import("../services/image-export-service.js");
  return copyPngToClipboard;
}
