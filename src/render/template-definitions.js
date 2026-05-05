/**
 * @typedef {object} TemplateDefinition
 * @property {"route-report"} id
 * @property {string} label
 * @property {number} width
 * @property {number} height
 * @property {"portrait" | "landscape"} pdfOrientation
 */

/** @type {TemplateDefinition[]} */
export const TEMPLATE_DEFINITIONS = [
  {
    id: "route-report",
    label: "Маршрутный отчет",
    width: 1240,
    height: 1754,
    pdfOrientation: "portrait"
  }
];

export const THEMES = [{ id: "terrain", label: "Terrain" }];
