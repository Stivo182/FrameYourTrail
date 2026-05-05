import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const templateCss = readFileSync(join(process.cwd(), "src/styles/templates.css"), "utf8");
const mapLibreCss = readFileSync(
  join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl.css"),
  "utf8"
);
const mapLibreMapRule = mapLibreCss.match(/\.maplibregl-map\{[^}]+\}/)?.[0] ?? "";

const EXPECTED_METRIC_COLORS = {
  distance: "#6f8f4d",
  "moving-time": "#c95b2e",
  "stopped-time": "#c99a3d",
  "total-time": "#8a6848",
  "average-speed": "#5f8f5f",
  "moving-speed": "#d9793e",
  "max-speed": "#b94a3a",
  "elevation-gain": "#6f8f4d",
  "elevation-loss": "#c95b2e",
  "min-elevation": "#5f8f5f",
  "max-elevation": "#b94a3a",
  "elevation-range": "#c99a3d"
};

describe("template styles", () => {
  it("uses the optimized WebP poster header background asset", () => {
    const asset = statSync(join(process.cwd(), "src/assets/header-watercolor-lake.webp"));

    expect(templateCss).toContain('url("../assets/header-watercolor-lake.webp")');
    expect(templateCss).not.toContain("header-adventure-route.webp");
    expect(templateCss).not.toContain("header-adventure-route.png");
    expect(asset.size).toBeLessThan(110_000);
  });

  it("assigns semantic accent colors to every metric table cell", () => {
    for (const [metric, color] of Object.entries(EXPECTED_METRIC_COLORS)) {
      const block = getMetricStyleBlock(metric);

      expect(block).toContain(`--metric-accent: ${color};`);
    }
  });

  it("renders the metrics as an unframed four-column table", () => {
    const statsBlock = getStyleBlock(".poster-stats");
    const tableBlock = getStyleBlock(".metric-table");
    const rowBlock = getStyleBlock(".metric-table__row");
    const cellBlock = getStyleBlock(".metric-table__cell");
    const horizontalRuleBlock = getStyleBlock(".metric-table__row:not(:last-child)::after");
    const verticalRuleBlock = getStyleBlock(".metric-table__cell:not(:last-child)::before");

    expect(statsBlock).toContain("display: block;");
    expect(statsBlock).toContain("border: 0;");
    expect(statsBlock).toContain("background: transparent;");
    expect(tableBlock).toContain("position: relative;");
    expect(tableBlock).toContain("display: grid;");
    expect(rowBlock).toContain("display: grid;");
    expect(rowBlock).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(rowBlock).toContain("column-gap: var(--metric-table-column-gap);");
    expect(cellBlock).toContain("background: transparent;");
    expect(cellBlock).not.toContain("border-radius:");
    expect(templateCss).not.toContain(".metric-table::before");
    expect(templateCss).not.toContain(".metric-table::after");
    expect(horizontalRuleBlock).toContain('content: "";');
    expect(verticalRuleBlock).toContain('content: "";');
  });

  it("applies metric accents through the metric icons", () => {
    const iconBlock = getStyleBlock(".metric-table__icon");
    const iconSvgBlock = getStyleBlock(".metric-table__icon svg");

    expect(iconBlock).toContain("grid-row: span 2;");
    expect(iconBlock).toContain("color: var(--metric-accent);");
    expect(iconSvgBlock).toContain("stroke: currentcolor;");
  });

  it("defines a higher-specificity MapLibre host override for lazy-loaded MapLibre CSS", () => {
    expect(mapLibreMapRule).toContain("position:relative");

    const block = getStyleBlock(".maplibre-host.maplibregl-map");

    expect(block).toContain("position: absolute;");
    expect(block).toContain("inset: 0;");
  });

  it("gives the map and elevation profile more vertical space", () => {
    const infographicBlock = getStyleBlock(".infographic");
    const mapBlock = getStyleBlock(".map-panel");
    const chartBlock = getStyleBlock(".chart-slot");
    const landscapeBlock = getLastStyleBlock(".elevation-landscape");

    expect(getPixelDeclaration(infographicBlock, "--poster-map-height")).toBeGreaterThanOrEqual(
      700
    );
    expect(mapBlock).toContain("height: var(--poster-map-height);");
    expect(mapBlock).toContain("min-height: var(--poster-map-height);");
    expect(getPixelDeclaration(chartBlock, "min-height")).toBeGreaterThanOrEqual(220);
    expect(getPixelDeclaration(landscapeBlock, "min-height")).toBeGreaterThanOrEqual(220);
  });

  it("renders the elevation profile chart without a frame or filled panel", () => {
    const chartBlock = getStyleBlock(".chart-slot");
    const chartRuleBlock = getStyleBlock(".chart-slot::before");
    const landscapeBlock = getLastStyleBlock(".elevation-landscape");

    expect(chartBlock).toContain("border: 0;");
    expect(chartBlock).toContain("border-radius: 0;");
    expect(chartBlock).toContain("background: transparent;");
    expect(chartRuleBlock).toContain("content: none;");
    expect(landscapeBlock).toContain("background: transparent;");
  });
});

/**
 * @param {string} selector
 */
function getStyleBlock(selector) {
  const start = templateCss.indexOf(selector);

  expect(start).toBeGreaterThanOrEqual(0);

  const end = templateCss.indexOf("}", start);

  expect(end).toBeGreaterThan(start);

  return templateCss.slice(start, end);
}

/**
 * @param {string} metric
 */
function getMetricStyleBlock(metric) {
  return getStyleBlock(`.metric-table__cell[data-metric="${metric}"]`);
}

/**
 * @param {string} selector
 */
function getLastStyleBlock(selector) {
  const start = templateCss.lastIndexOf(selector);

  expect(start).toBeGreaterThanOrEqual(0);

  const end = templateCss.indexOf("}", start);

  expect(end).toBeGreaterThan(start);

  return templateCss.slice(start, end);
}

/**
 * @param {string} block
 * @param {string} property
 */
function getPixelDeclaration(block, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = block.match(new RegExp(`${escapedProperty}:\\s*(\\d+)px;`))?.[1];

  expect(value).toBeDefined();

  return Number(value);
}
