/**
 * @typedef {import("lucide").IconNode} LucideIconNode
 */

/**
 * @param {string} name
 * @param {LucideIconNode} node
 * @param {string} shape
 * @returns {string}
 */
export function renderLucideIcon(name, node, shape) {
  const body = node.map(([tag, attributes]) => renderNode(tag, attributes)).join("");

  return `<svg aria-hidden="true" data-icon="${name}" data-icon-shape="${shape}" data-icon-library="lucide" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><g vector-effect="non-scaling-stroke" transform="translate(4 4) scale(1)">${body}</g></svg>`;
}

/**
 * @param {string} tag
 * @param {Record<string, string | number | undefined>} attributes
 * @returns {string}
 */
function renderNode(tag, attributes) {
  const serializedAttributes = Object.entries(attributes)
    .filter(([_key, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${escapeAttribute(String(value))}"`)
    .join(" ");

  return `<${tag}${serializedAttributes ? ` ${serializedAttributes}` : ""} />`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
