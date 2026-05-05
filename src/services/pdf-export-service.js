import { jsPDF } from "jspdf";
import { TEMPLATE_DEFINITIONS } from "../render/template-definitions.js";
import { createPngDataUrl } from "./image-export-service.js";

/**
 * @param {HTMLElement} node
 * @param {string} fileName
 * @param {string} templateId
 */
export async function exportPdf(node, fileName, templateId) {
  const dataUrl = await createPngDataUrl(node);
  const settings = getPdfSettings(templateId);
  const pdf = new jsPDF(settings);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.addImage(dataUrl, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  pdf.save(`${fileName}.pdf`);
}

/**
 * @param {string} templateId
 * @returns {import("jspdf").jsPDFOptions}
 */
export function getPdfSettings(templateId) {
  const definition =
    TEMPLATE_DEFINITIONS.find((item) => item.id === templateId) ?? TEMPLATE_DEFINITIONS[0];

  return {
    orientation: definition.pdfOrientation === "landscape" ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
    compress: true
  };
}
