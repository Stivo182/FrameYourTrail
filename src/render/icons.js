import {
  ArrowDownToLine,
  ArrowUpToLine,
  Footprints,
  Gauge,
  MapPin,
  OctagonPause,
  Route,
  Timer,
  TrendingDown,
  TrendingUp,
  UnfoldVertical,
  Wind,
  Zap
} from "lucide";

const ICONS = {
  distance: lucide("distance", Route, "lucide-route"),
  movingTime: lucide("movingTime", Footprints, "lucide-footprints"),
  stoppedTime: lucide("stoppedTime", OctagonPause, "lucide-octagon-pause"),
  totalTime: lucide("totalTime", Timer, "lucide-timer"),
  averageSpeed: lucide("averageSpeed", Gauge, "lucide-gauge"),
  movingSpeed: lucide("movingSpeed", Wind, "lucide-wind"),
  maxSpeed: lucide("maxSpeed", Zap, "lucide-zap"),
  gain: lucide("gain", TrendingUp, "lucide-trending-up"),
  loss: lucide("loss", TrendingDown, "lucide-trending-down"),
  minElevation: lucide("minElevation", ArrowDownToLine, "lucide-arrow-down-to-line"),
  maxElevation: lucide("maxElevation", ArrowUpToLine, "lucide-arrow-up-to-line"),
  elevationRange: lucide("elevationRange", UnfoldVertical, "lucide-unfold-vertical"),
  location: lucide("location", MapPin, "lucide-map-pin")
};

/**
 * @typedef {import("lucide").IconNode} LucideIconNode
 */

/**
 * @param {string} name
 * @param {LucideIconNode} node
 * @param {string} shape
 * @returns {string}
 */
function lucide(name, node, shape) {
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

/**
 * @param {keyof typeof ICONS} name
 * @returns {string}
 */
export function icon(name) {
  return ICONS[name] ?? "";
}
