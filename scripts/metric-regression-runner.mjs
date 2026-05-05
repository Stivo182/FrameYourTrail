import { readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { analyzeParsedTrack } from "../src/core/metric-modes.js";
import { parseTrackSource } from "../src/core/track-source-parser.js";
import { applyTerrainElevations } from "../src/services/elevation-service.js";

const DIAGNOSTIC_EXPECTATION_ALIASES = Object.freeze({
  recordingMode: "sampling.recordingMode",
  nominalIntervalSeconds: "sampling.nominalIntervalSeconds"
});

/**
 * @param {string} manifestPath
 */
export function loadMetricRegressionCases(manifestPath) {
  return loadMetricRegressionManifest(manifestPath).cases;
}

/**
 * @param {string} manifestPath
 */
export function loadMetricRegressionManifest(manifestPath) {
  return normalizeMetricRegressionManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
}

/**
 * @param {Record<string, any>[] | Record<string, any>} payload
 */
function normalizeMetricRegressionManifest(payload) {
  if (Array.isArray(payload)) {
    return {
      cases: payload,
      requiredCoverage: null,
      requiredCombinations: []
    };
  }

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.cases)) {
    throw new Error("Metric regression manifest must be an array or an object with a cases array");
  }

  return {
    cases: payload.cases,
    requiredCoverage: normalizeRequiredCoverage(
      payload.requiredCoverage ?? payload.coverage?.required ?? null
    ),
    requiredCombinations: normalizeRequiredCombinations(
      payload.requiredCombinations ?? payload.coverage?.requiredCombinations ?? null
    )
  };
}

/**
 * @param {Record<string, any>[]} cases
 * @param {{ manifestPath: string, requiredCoverage?: Record<string, string[]>, requiredCombinations?: Record<string, string>[] }} options
 */
export async function runMetricRegressionCases(cases, options) {
  const manifestDir = dirname(options.manifestPath);
  const caseResults = await Promise.all(
    cases.map((goldenCase) => runMetricRegressionCase(goldenCase, manifestDir))
  );
  const failures = [
    ...caseResults.flatMap((result) => result.failures),
    ...collectCoverageFailures(cases, options.requiredCoverage, options.requiredCombinations)
  ];

  return {
    passed: failures.length === 0,
    cases: caseResults,
    failures
  };
}

/**
 * @param {{ cases: Record<string, any>[], requiredCoverage?: Record<string, string[]> | null, requiredCombinations?: Record<string, string>[] | null }} manifest
 * @param {{ manifestPath: string }} options
 */
export async function runMetricRegressionManifest(manifest, options) {
  return runMetricRegressionCases(manifest.cases, {
    manifestPath: options.manifestPath,
    requiredCoverage: manifest.requiredCoverage ?? undefined,
    requiredCombinations: manifest.requiredCombinations ?? undefined
  });
}

/**
 * @param {Record<string, any>[]} cases
 * @param {Record<string, string[]> | undefined} requiredCoverage
 * @param {Record<string, string>[] | undefined} requiredCombinations
 */
function collectCoverageFailures(cases, requiredCoverage, requiredCombinations) {
  const failures = [];

  if (requiredCoverage && typeof requiredCoverage === "object") {
    for (const [axis, expectedValues] of Object.entries(requiredCoverage)) {
      if (!Array.isArray(expectedValues)) {
        continue;
      }

      const requiredValues = normalizeStringList(expectedValues);

      if (requiredValues.length === 0) {
        continue;
      }

      const actualValues = collectCaseTagValues(cases, axis);
      const missingValues = requiredValues.filter((value) => !actualValues.includes(value));

      if (missingValues.length > 0) {
        failures.push({
          caseId: "__coverage__",
          metric: `coverage.${axis}`,
          actual: actualValues,
          expected: requiredValues,
          missing: missingValues
        });
      }
    }
  }

  return [...failures, ...collectCombinationCoverageFailures(cases, requiredCombinations)];
}

/**
 * @param {Record<string, any>[]} cases
 * @param {string} axis
 */
function collectCaseTagValues(cases, axis) {
  return normalizeStringList(cases.map((goldenCase) => goldenCase.tags?.[axis]));
}

/**
 * @param {Record<string, any>[]} cases
 * @param {Record<string, string>[] | undefined} requiredCombinations
 */
function collectCombinationCoverageFailures(cases, requiredCombinations) {
  const required = normalizeRequiredCombinations(requiredCombinations);

  if (required.length === 0) {
    return [];
  }

  const actual = collectActualCombinations(cases, required);
  const actualKeys = new Set(actual.map((combination) => getCombinationKey(combination)));
  const missing = required.filter((combination) => !actualKeys.has(getCombinationKey(combination)));

  if (missing.length === 0) {
    return [];
  }

  return [
    {
      caseId: "__coverage__",
      metric: "coverage.combination",
      actual,
      expected: required,
      missing
    }
  ];
}

/**
 * @param {Record<string, any>[]} cases
 * @param {Record<string, string>[]} requiredCombinations
 * @returns {Record<string, string>[]}
 */
function collectActualCombinations(cases, requiredCombinations) {
  const combinations = requiredCombinations.flatMap((combination) => {
    const axes = Object.keys(combination).sort();
    return cases
      .map((goldenCase) => normalizeTagCombination(goldenCase.tags, axes))
      .filter(isCoverageCombination);
  });

  return uniqueSortedCombinations(combinations);
}

/**
 * @param {unknown} tags
 * @param {string[]} axes
 * @returns {Record<string, string> | null}
 */
function normalizeTagCombination(tags, axes) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    return null;
  }

  /** @type {Record<string, string>} */
  const combination = {};

  for (const axis of axes) {
    const value = normalizeNonEmptyString(/** @type {Record<string, unknown>} */ (tags)[axis]);

    if (value === null) {
      return null;
    }

    combination[axis] = value;
  }

  return combination;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string[]> | null}
 */
function normalizeRequiredCoverage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(/** @type {Record<string, unknown>} */ (value))
      .filter(([, values]) => Array.isArray(values))
      .map(([axis, values]) => [axis, normalizeStringList(/** @type {unknown[]} */ (values))])
  );
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>[]}
 */
function normalizeRequiredCombinations(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueSortedCombinations(
    value.map(normalizeCoverageCombination).filter(isCoverageCombination)
  );
}

/**
 * @param {unknown} value
 * @returns {Record<string, string> | null}
 */
function normalizeCoverageCombination(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .map(([axis, axisValue]) => [normalizeNonEmptyString(axis), normalizeNonEmptyString(axisValue)])
    .filter((entry) => entry[0] !== null && entry[1] !== null)
    .sort(([left], [right]) =>
      /** @type {string} */ (left).localeCompare(/** @type {string} */ (right))
    );

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

/**
 * @param {Record<string, string> | null} value
 * @returns {value is Record<string, string>}
 */
function isCoverageCombination(value) {
  return value !== null;
}

/**
 * @param {Record<string, string>[]} combinations
 * @returns {Record<string, string>[]}
 */
function uniqueSortedCombinations(combinations) {
  const byKey = new Map();

  for (const combination of combinations) {
    byKey.set(getCombinationKey(combination), combination);
  }

  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, combination]) => combination);
}

/**
 * @param {Record<string, string>} combination
 */
function getCombinationKey(combination) {
  return Object.entries(combination)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([axis, value]) => `${axis}=${value}`)
    .join("|");
}

/**
 * @param {unknown[]} values
 * @returns {string[]}
 */
function normalizeStringList(values) {
  return [
    ...new Set(values.map((value) => normalizeNonEmptyString(value)).filter(isStringValue))
  ].sort();
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

/**
 * @param {string | null} value
 * @returns {value is string}
 */
function isStringValue(value) {
  return value !== null;
}

/**
 * @param {{ passed: boolean, cases: Record<string, any>[], failures: Record<string, any>[] }} result
 */
export function formatMetricRegressionReport(result) {
  if (result.passed) {
    return `Metric regression passed: ${result.cases.length}/${result.cases.length} cases`;
  }

  const lines = [
    `Metric regression failed: ${result.failures.length} mismatch(es) in ${result.cases.length} case(s)`
  ];

  for (const failure of result.failures) {
    lines.push(
      `${failure.caseId}.${failure.metric}: actual=${formatNumber(failure.actual)}, expected=${formatExpectation(failure)}`
    );
  }

  return lines.join("\n");
}

/**
 * @param {Record<string, any>} goldenCase
 * @param {string} manifestDir
 */
async function runMetricRegressionCase(goldenCase, manifestDir) {
  ensureXmlDomGlobals();
  const filePath = resolveCaseFile(goldenCase, manifestDir);
  const mediaType = inferCaseMediaType(goldenCase, filePath);
  const parsed = applyCaseTerrainElevations(
    await parseTrackSource(
      readCaseSource(filePath, mediaType),
      getCaseFileName(goldenCase, filePath),
      {
        mediaType
      }
    ),
    goldenCase,
    manifestDir
  );
  const analysis = analyzeParsedTrack(parsed, { mode: goldenCase.mode });
  const metricFailures = [
    ...collectModeFailures(goldenCase, analysis),
    ...collectMetricFailures(goldenCase, analysis),
    ...collectObjectExpectationFailures(
      goldenCase.id,
      "provenance",
      goldenCase.expectedProvenance,
      analysis.provenance
    ),
    ...collectAuditExpectationFailures(
      goldenCase.id,
      goldenCase.expectedAudit,
      analysis.auditTrail
    ),
    ...collectDiagnosticExpectationFailures(
      goldenCase.id,
      goldenCase.expectedDiagnostics,
      analysis.diagnostics
    )
  ];

  return {
    id: goldenCase.id,
    requestedMode: goldenCase.mode,
    mode: analysis.mode,
    file: filePath,
    passed: metricFailures.length === 0,
    failures: metricFailures
  };
}

/**
 * @param {Record<string, any>} goldenCase
 * @param {string} filePath
 */
function getCaseFileName(goldenCase, filePath) {
  return String(goldenCase.file ?? goldenCase.path ?? filePath);
}

/**
 * @param {Record<string, any>} goldenCase
 * @param {string} filePath
 */
function inferCaseMediaType(goldenCase, filePath) {
  const explicitMediaType = normalizeNonEmptyString(goldenCase.mediaType);

  if (explicitMediaType) {
    return explicitMediaType;
  }

  switch (extname(filePath).toLowerCase()) {
    case ".fit":
      return "application/octet-stream";
    case ".tcx":
      return "application/vnd.garmin.tcx+xml";
    case ".xml":
      return "application/xml";
    case ".gpx":
    default:
      return "application/gpx+xml";
  }
}

/**
 * @param {string} filePath
 * @param {string} mediaType
 * @returns {string | ArrayBuffer}
 */
function readCaseSource(filePath, mediaType) {
  if (mediaType === "application/octet-stream" || extname(filePath).toLowerCase() === ".fit") {
    const bytes = readFileSync(filePath);
    const exactSlice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const arrayBuffer = new ArrayBuffer(exactSlice.byteLength);
    new Uint8Array(arrayBuffer).set(new Uint8Array(exactSlice));
    return arrayBuffer;
  }

  return readFileSync(filePath, "utf8");
}

/**
 * @param {string} caseId
 * @param {unknown} expected
 * @param {unknown} auditTrail
 */
function collectAuditExpectationFailures(caseId, expected, auditTrail) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return [];
  }

  const failures = [];

  for (const [path, expectedValue] of Object.entries(
    /** @type {Record<string, unknown>} */ (expected)
  )) {
    const actualValue = getAuditPathValue(auditTrail, path);
    failures.push(
      ...collectValueExpectationFailures(caseId, `audit.${path}`, expectedValue, actualValue)
    );
  }

  return failures;
}

/**
 * @param {unknown} auditTrail
 * @param {string} path
 */
function getAuditPathValue(auditTrail, path) {
  if (!Array.isArray(auditTrail)) {
    return undefined;
  }

  const parts = path.split(".");

  if (parts.length !== 2 || parts.some((part) => part === "")) {
    return undefined;
  }

  const [stageId, itemId] = parts;
  const stage = auditTrail.find((item) => isRecord(item) && item.id === stageId);

  if (!isRecord(stage)) {
    return undefined;
  }

  if (itemId === "status") {
    return stage.status;
  }

  const item = Array.isArray(stage.items)
    ? stage.items.find((entry) => isRecord(entry) && entry.id === itemId)
    : undefined;

  return isRecord(item) ? (item.rawValue ?? item.value) : undefined;
}

/**
 * @param {string} caseId
 * @param {unknown} expected
 * @param {unknown} diagnostics
 */
function collectDiagnosticExpectationFailures(caseId, expected, diagnostics) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return [];
  }

  const failures = [];

  for (const [key, expectedValue] of Object.entries(
    /** @type {Record<string, unknown>} */ (expected)
  )) {
    const path = DIAGNOSTIC_EXPECTATION_ALIASES[key] ?? key;
    const actualValue = getPathValue(diagnostics, path);
    failures.push(
      ...collectValueExpectationFailures(caseId, `diagnostics.${path}`, expectedValue, actualValue)
    );
  }

  return failures;
}

/**
 * @param {string} caseId
 * @param {string} prefix
 * @param {unknown} expected
 * @param {unknown} actual
 */
function collectObjectExpectationFailures(caseId, prefix, expected, actual) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return [];
  }

  const failures = [];
  const actualRecord =
    actual && typeof actual === "object" && !Array.isArray(actual)
      ? /** @type {Record<string, unknown>} */ (actual)
      : {};

  for (const [key, expectedValue] of Object.entries(
    /** @type {Record<string, unknown>} */ (expected)
  )) {
    const metric = `${prefix}.${key}`;
    const actualValue = actualRecord[key];

    failures.push(...collectValueExpectationFailures(caseId, metric, expectedValue, actualValue));
  }

  return failures;
}

/**
 * @param {string} caseId
 * @param {string} metric
 * @param {unknown} expectedValue
 * @param {unknown} actualValue
 */
function collectValueExpectationFailures(caseId, metric, expectedValue, actualValue) {
  if (Array.isArray(expectedValue)) {
    const actualValues = Array.isArray(actualValue) ? actualValue : [];
    const missingValues = expectedValue.filter((value) => !actualValues.includes(value));

    return missingValues.length > 0
      ? [
          {
            caseId,
            metric,
            actual: actualValues,
            expected: expectedValue,
            missing: missingValues
          }
        ]
      : [];
  }

  return actualValue !== expectedValue
    ? [
        {
          caseId,
          metric,
          actual: actualValue,
          expected: expectedValue
        }
      ]
    : [];
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function getPathValue(value, path) {
  return path.split(".").reduce((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return /** @type {Record<string, unknown>} */ (current)[key];
  }, value);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {import("../src/core/route-source.js").NormalizedRouteSource} parsed
 * @param {Record<string, any>} goldenCase
 * @param {string} manifestDir
 */
function applyCaseTerrainElevations(parsed, goldenCase, manifestDir) {
  const terrainElevations = resolveCaseTerrainElevations(goldenCase, manifestDir);
  return terrainElevations ? applyTerrainElevations(parsed, terrainElevations) : parsed;
}

/**
 * @param {Record<string, any>} goldenCase
 * @param {string} manifestDir
 * @returns {unknown[] | null}
 */
function resolveCaseTerrainElevations(goldenCase, manifestDir) {
  if (Array.isArray(goldenCase.terrainElevations)) {
    return goldenCase.terrainElevations;
  }

  const terrainElevationPath = goldenCase.terrainElevationPath;

  if (typeof terrainElevationPath !== "string" || terrainElevationPath.trim() === "") {
    return null;
  }

  const filePath = isAbsolute(terrainElevationPath)
    ? terrainElevationPath
    : resolve(manifestDir, terrainElevationPath);
  const payload = JSON.parse(readFileSync(filePath, "utf8"));

  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.elevations) ? payload.elevations : null;
}

/**
 * @param {Record<string, any>} goldenCase
 * @param {Record<string, any>} analysis
 */
function collectModeFailures(goldenCase, analysis) {
  if (!goldenCase.mode || analysis.mode === goldenCase.mode) {
    return [];
  }

  return [
    {
      caseId: goldenCase.id,
      metric: "mode",
      actual: analysis.mode,
      expected: goldenCase.mode
    }
  ];
}

/**
 * @param {Record<string, any>} goldenCase
 * @param {Record<string, any>} analysis
 */
function collectMetricFailures(goldenCase, analysis) {
  const failures = [];

  for (const [metric, expected] of Object.entries(goldenCase.expected ?? {})) {
    const actual = analysis[metric];

    if (expected === null) {
      if (actual !== null) {
        failures.push({
          caseId: goldenCase.id,
          metric,
          actual,
          expected,
          tolerance: null
        });
      }
      continue;
    }

    const actualNumber = finiteMetricNumber(actual);
    const expectedNumber = finiteMetricNumber(expected);
    const tolerance = finiteMetricNumber(goldenCase.tolerance?.[metric] ?? 0);

    if (
      actualNumber === null ||
      expectedNumber === null ||
      tolerance === null ||
      Math.abs(actualNumber - expectedNumber) > tolerance
    ) {
      failures.push({
        caseId: goldenCase.id,
        metric,
        actual,
        expected,
        tolerance
      });
    }
  }

  for (const [metric, range] of Object.entries(goldenCase.expectedRanges ?? {})) {
    const actual = analysis[metric];
    const actualNumber = finiteMetricNumber(actual);
    const min = finiteMetricNumber(range.min);
    const max = finiteMetricNumber(range.max);

    if (
      actualNumber === null ||
      min === null ||
      max === null ||
      actualNumber < min ||
      actualNumber > max
    ) {
      failures.push({
        caseId: goldenCase.id,
        metric,
        actual,
        min,
        max
      });
    }
  }

  return failures;
}

/**
 * @param {Record<string, any>} goldenCase
 * @param {string} manifestDir
 */
function resolveCaseFile(goldenCase, manifestDir) {
  const file = String(goldenCase.path ?? goldenCase.file ?? "");

  if (!file) {
    throw new Error(`Metric regression case ${goldenCase.id ?? "<unknown>"} does not define file`);
  }

  return isAbsolute(file) ? file : resolve(manifestDir, file);
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function finiteMetricNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * @param {Record<string, any>} failure
 */
function formatExpectation(failure) {
  if ("missing" in failure) {
    return `${formatNumber(failure.expected)}, missing=${formatNumber(failure.missing)}`;
  }

  if ("min" in failure || "max" in failure) {
    return `${formatNumber(failure.min)}..${formatNumber(failure.max)}`;
  }

  return "tolerance" in failure
    ? `${formatNumber(failure.expected)} +/- ${formatNumber(failure.tolerance)}`
    : formatNumber(failure.expected);
}

/**
 * @param {unknown} value
 */
function formatNumber(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatNumber(item)).join(", ")}]`;
  }

  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(3))
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}

if (isCliEntryPoint()) {
  const manifestPath = resolve(process.argv[2] ?? "tests/fixtures/filtered-golden.json");
  const manifest = loadMetricRegressionManifest(manifestPath);
  const result = await runMetricRegressionManifest(manifest, { manifestPath });

  console.log(formatMetricRegressionReport(result));
  process.exitCode = result.passed ? 0 : 1;
}

function isCliEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function ensureXmlDomGlobals() {
  if (
    typeof globalThis.DOMParser === "function" &&
    typeof globalThis.XMLSerializer === "function" &&
    typeof globalThis.Document === "function"
  ) {
    return;
  }

  const { window } = new JSDOM("");
  globalThis.DOMParser = window.DOMParser;
  globalThis.XMLSerializer = window.XMLSerializer;
  globalThis.Document = window.Document;
}
