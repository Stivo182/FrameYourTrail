import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Blob } from "node:buffer";

import { JSDOM } from "jsdom";

import { renderInfographic } from "../src/render/templates.js";
import { analyzeTrackSourceForUi } from "../src/services/track-analysis-pipeline.js";

const DEFAULT_POINT_COUNT = 10_000;
const DEFAULT_ITERATIONS = 3;
const DEFAULT_WARMUP_ITERATIONS = 1;
const FIRST_TIMESTAMP_MS = Date.UTC(2024, 4, 25, 8, 0, 0, 0);
const FILE_NAME = "synthetic-large-track.gpx";
const BENCHMARK_DOM_GLOBALS = [
  "window",
  "document",
  "DOMParser",
  "XMLSerializer",
  "HTMLElement",
  "Node"
];

/**
 * @param {{ pointCount?: number }} [options]
 * @returns {string}
 */
export function createSyntheticLargeGpx(options = {}) {
  const pointCount = normalizePositiveInteger(
    options.pointCount ?? DEFAULT_POINT_COUNT,
    "pointCount"
  );
  const points = [];

  for (let index = 0; index < pointCount; index += 1) {
    const latitude = 43.1 + index * 0.00008;
    const longitude = 42.1 + index * 0.0001;
    const elevation = 620 + Math.sin(index / 24) * 38 + index * 0.015;
    const timestamp = new Date(FIRST_TIMESTAMP_MS + index * 30_000).toISOString();

    points.push(
      `      <trkpt lat="${latitude.toFixed(6)}" lon="${longitude.toFixed(6)}"><ele>${elevation.toFixed(2)}</ele><time>${timestamp}</time></trkpt>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FrameYourTrailLargeTrackBenchmark" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Synthetic Large Track</name></metadata>
  <trk>
    <name>Synthetic Large Track</name>
    <trkseg>
${points.join("\n")}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * @param {string[]} args
 * @returns {{ pointCount: number, iterations: number, warmupIterations: number, json: boolean }}
 */
export function parseLargeTrackBenchmarkArgs(args) {
  const options = {
    pointCount: DEFAULT_POINT_COUNT,
    iterations: DEFAULT_ITERATIONS,
    warmupIterations: DEFAULT_WARMUP_ITERATIONS,
    json: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--points" || arg === "--iterations" || arg === "--warmup") {
      const value = args[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a positive integer value.`);
      }

      if (arg === "--points") {
        options.pointCount = parsePositiveIntegerArgument(value, arg);
      } else if (arg === "--iterations") {
        options.iterations = parsePositiveIntegerArgument(value, arg);
      } else {
        options.warmupIterations = parseNonNegativeIntegerArgument(value, arg);
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown large-track benchmark option: ${arg}`);
  }

  return options;
}

/**
 * @param {{ pointCount?: number, iterations?: number, warmupIterations?: number }} [options]
 */
export async function runLargeTrackBenchmark(options = {}) {
  const pointCount = normalizePositiveInteger(
    options.pointCount ?? DEFAULT_POINT_COUNT,
    "pointCount"
  );
  const iterations = normalizePositiveInteger(
    options.iterations ?? DEFAULT_ITERATIONS,
    "iterations"
  );
  const warmupIterations = normalizeNonNegativeInteger(
    options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS,
    "warmupIterations"
  );
  const source = createSyntheticLargeGpx({ pointCount });
  const fileSizeBytes = Buffer.byteLength(source, "utf8");
  const runs = [];
  const totalIterations = warmupIterations + iterations;
  const cleanupBenchmarkDomGlobals = installBenchmarkDomGlobals();

  try {
    for (let index = 0; index < totalIterations; index += 1) {
      const run = await measureLargeTrackRun(source, fileSizeBytes, pointCount);

      if (index >= warmupIterations) {
        runs.push(run);
      }
    }

    return {
      pointCount,
      fileSizeBytes,
      iterations,
      warmupIterations,
      runs,
      summary: summarizeRuns(runs)
    };
  } finally {
    cleanupBenchmarkDomGlobals();
  }
}

/**
 * @param {{
 *   pointCount: number,
 *   fileSizeBytes: number,
 *   runs?: unknown[],
 *   summary: Record<string, { min: number, median: number, max: number }>
 * }} result
 * @returns {string}
 */
export function formatLargeTrackBenchmarkReport(result) {
  const lines = [
    `Large track benchmark: ${result.pointCount} points`,
    `File size: ${formatBytes(result.fileSizeBytes)}`,
    `Measured runs: ${result.runs?.length ?? 0}`,
    "",
    formatSummaryLine("upload/read", result.summary.uploadReadMs),
    formatSummaryLine("parse+analyze", result.summary.parseAnalyzeMs),
    formatSummaryLine("poster shell render", result.summary.posterRenderMs),
    formatSummaryLine("total", result.summary.totalMs)
  ];

  return lines.join("\n");
}

/**
 * @param {string} source
 * @param {number} fileSizeBytes
 * @param {number} pointCount
 */
async function measureLargeTrackRun(source, fileSizeBytes, pointCount) {
  const totalStart = performance.now();
  const uploadReadStart = performance.now();
  const readSource = await new Blob([source]).text();
  const uploadReadMs = performance.now() - uploadReadStart;

  const parseAnalyzeStart = performance.now();
  const { parsed, validation, analysis } = await analyzeTrackSourceForUi({
    source: readSource,
    fileName: FILE_NAME,
    fileSizeBytes
  });
  const parseAnalyzeMs = performance.now() - parseAnalyzeStart;

  if (analysis === null) {
    throw new Error("Synthetic large track did not produce renderable analysis.");
  }

  const posterRenderStart = performance.now();
  const poster = renderInfographic({
    title: parsed.name ?? "Synthetic Large Track",
    dateLabel: parsed.points[0]?.timestamp?.toISOString() ?? "",
    fileName: FILE_NAME,
    warnings: validation.warnings,
    parsed,
    analysis
  });
  const posterRenderMs = performance.now() - posterRenderStart;
  const totalMs = performance.now() - totalStart;

  return {
    pointCount,
    uploadReadMs,
    parseAnalyzeMs,
    posterRenderMs,
    totalMs,
    renderedMetricTableCells: poster.querySelectorAll(".metric-table__cell").length
  };
}

function installBenchmarkDomGlobals() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousDescriptors = new Map(
    BENCHMARK_DOM_GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );

  Object.defineProperties(globalThis, {
    window: { configurable: true, writable: true, value: dom.window },
    document: { configurable: true, writable: true, value: dom.window.document },
    DOMParser: { configurable: true, writable: true, value: dom.window.DOMParser },
    XMLSerializer: { configurable: true, writable: true, value: dom.window.XMLSerializer },
    HTMLElement: { configurable: true, writable: true, value: dom.window.HTMLElement },
    Node: { configurable: true, writable: true, value: dom.window.Node }
  });

  return () => {
    try {
      dom.window.close();
    } finally {
      for (const [name, descriptor] of previousDescriptors) {
        if (descriptor) {
          Reflect.defineProperty(globalThis, name, descriptor);
        } else {
          Reflect.deleteProperty(globalThis, name);
        }
      }
    }
  };
}

/**
 * @param {Array<Record<string, number>>} runs
 */
function summarizeRuns(runs) {
  return {
    uploadReadMs: summarizeMetric(runs, "uploadReadMs"),
    parseAnalyzeMs: summarizeMetric(runs, "parseAnalyzeMs"),
    posterRenderMs: summarizeMetric(runs, "posterRenderMs"),
    totalMs: summarizeMetric(runs, "totalMs")
  };
}

/**
 * @param {Array<Record<string, number>>} runs
 * @param {string} metricName
 */
function summarizeMetric(runs, metricName) {
  const values = runs.map((run) => run[metricName]).sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];

  return {
    min: values[0],
    median,
    max: values[values.length - 1]
  };
}

/**
 * @param {string} label
 * @param {{ min: number, median: number, max: number }} summary
 */
function formatSummaryLine(label, summary) {
  return `${label}: min ${formatMs(summary.min)}, median ${formatMs(summary.median)}, max ${formatMs(summary.max)}`;
}

/**
 * @param {number} value
 */
function formatMs(value) {
  return `${value.toFixed(2)} ms`;
}

/**
 * @param {number} bytes
 */
function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/**
 * @param {string} value
 * @param {string} flag
 */
function parsePositiveIntegerArgument(value, flag) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

/**
 * @param {string} value
 * @param {string} flag
 */
function parseNonNegativeIntegerArgument(value, flag) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }

  return parsed;
}

/**
 * @param {number} value
 * @param {string} name
 */
function normalizePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

/**
 * @param {number} value
 * @param {string} name
 */
function normalizeNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

async function main() {
  try {
    const options = parseLargeTrackBenchmarkArgs(process.argv.slice(2));
    const result = await runLargeTrackBenchmark(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatLargeTrackBenchmarkReport(result));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
