import { toBlob, toJpeg, toPng } from "html-to-image";
import { supportsClipboardImage } from "./export-capabilities.js";

export { supportsClipboardImage };

export const EXPORT_OPTIONS = {
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: "#ffffff"
};

/**
 * @param {HTMLElement} node
 * @param {string} fileName
 */
export async function exportPng(node, fileName) {
  const dataUrl = await createPngDataUrl(node);
  downloadDataUrl(dataUrl, `${fileName}.png`);
}

/**
 * @param {HTMLElement} node
 * @param {string} fileName
 */
export async function exportJpeg(node, fileName) {
  await waitForFonts();
  const dataUrl = await toJpeg(node, {
    ...EXPORT_OPTIONS,
    quality: 0.92
  });
  downloadDataUrl(dataUrl, `${fileName}.jpg`);
}

/**
 * @param {HTMLElement} node
 */
export async function copyPngToClipboard(node) {
  if (!supportsClipboardImage()) {
    throw new Error("Clipboard image API is not supported");
  }

  await waitForFonts();
  const blob = await toBlob(node, EXPORT_OPTIONS);

  if (!blob) {
    throw new Error("Image blob was not created");
  }

  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

/**
 * @param {HTMLElement} node
 */
export async function createPngDataUrl(node) {
  await waitForFonts();
  return toPng(node, EXPORT_OPTIONS);
}

async function waitForFonts() {
  await document.fonts?.ready;
}

/**
 * @param {string} dataUrl
 * @param {string} fileName
 */
function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}
