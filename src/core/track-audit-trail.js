import {
  formatRoundedCount,
  formatRoundedMeters,
  formatRoundedSeconds
} from "./analysis-summary-formatters.js";

/**
 * @param {string} id
 * @param {string} label
 * @param {string} valueType
 * @param {unknown} rawValue
 * @param {string} value
 */
export function createAuditItem(id, label, valueType, rawValue, value) {
  return { id, label, valueType, rawValue, value };
}

/**
 * @param {{ summary: Record<string, unknown>, diagnostics: Record<string, any>, confidenceFlags: string[] }} input
 */
export function createAuditTrail(input) {
  const diagnostics = input.diagnostics;
  const cleaning = diagnostics.cleaning ?? {};
  const continuity = diagnostics.continuity ?? {};
  const elevation = diagnostics.elevation ?? {};
  const moving = diagnostics.moving ?? {};
  const sampling = diagnostics.sampling ?? {};
  const temporal = diagnostics.temporal ?? {};
  const elevationThreshold = elevation.thresholds?.turnThresholdMeters ?? null;
  const thresholdSweep = getThresholdSweepRange(elevation.thresholdSweep);

  return [
    {
      id: "input",
      label: "Input",
      status: "ok",
      items: [
        createAuditItem(
          "inputPoints",
          "Points",
          "count",
          cleaning.inputPointCount,
          formatRoundedCount(cleaning.inputPointCount)
        ),
        createAuditItem(
          "mode",
          "Mode",
          "analysisMode",
          input.summary.mode ?? "unknown",
          String(input.summary.mode ?? "unknown")
        )
      ]
    },
    {
      id: "cleaning",
      label: "Cleaning",
      status: Number(cleaning.pointsRemoved ?? 0) > 0 ? "changed" : "ok",
      items: [
        createAuditItem(
          "keptPoints",
          "Points",
          "keptCount",
          cleaning.outputPointCount,
          `${formatRoundedCount(cleaning.outputPointCount)} kept`
        ),
        createAuditItem(
          "removedPoints",
          "Removed",
          "count",
          cleaning.pointsRemoved,
          formatRoundedCount(cleaning.pointsRemoved)
        )
      ]
    },
    {
      id: "continuity",
      label: "Continuity",
      status:
        Number(continuity.timeGapBreakCount ?? 0) > 0 ||
        Number(continuity.xyJitterSegmentCount ?? 0) > 0
          ? "changed"
          : "ok",
      items: [
        createAuditItem(
          "timeGaps",
          "Time gaps",
          "count",
          continuity.timeGapBreakCount,
          formatRoundedCount(continuity.timeGapBreakCount)
        ),
        createAuditItem(
          "xyJitter",
          "XY jitter",
          "count",
          continuity.xyJitterSegmentCount,
          formatRoundedCount(continuity.xyJitterSegmentCount)
        )
      ]
    },
    {
      id: "elevation",
      label: "Elevation",
      status: elevationThreshold !== null ? "changed" : "ok",
      items: [
        createAuditItem(
          "elevationSource",
          "Source",
          "elevationSource",
          input.summary.elevationSource ?? "none",
          String(input.summary.elevationSource ?? "none")
        ),
        createAuditItem(
          "threshold",
          "Threshold",
          "meters",
          elevationThreshold,
          formatRoundedMeters(elevationThreshold)
        ),
        createAuditItem(
          "thresholdSweep",
          "Sweep",
          "thresholdSweep",
          thresholdSweep,
          formatThresholdSweep(elevation.thresholdSweep)
        )
      ]
    },
    {
      id: "movement",
      label: "Movement",
      status: "changed",
      items: [
        createAuditItem(
          "movingTime",
          "Moving time",
          "seconds",
          input.summary.movingDurationSeconds,
          formatRoundedSeconds(input.summary.movingDurationSeconds)
        ),
        createAuditItem(
          "startSpeed",
          "Start speed",
          "kmh",
          moving.thresholds?.onSpeedKmh ?? null,
          `${formatNumber(moving.thresholds?.onSpeedKmh)} km/h`
        )
      ]
    },
    {
      id: "sampling",
      label: "Sampling",
      status:
        sampling.recordingMode === "smart" || sampling.recordingMode === "sparse"
          ? "warning"
          : "ok",
      items: [
        createAuditItem(
          "recording",
          "Recording",
          "recordingMode",
          sampling.recordingMode ?? "unknown",
          String(sampling.recordingMode ?? "unknown")
        ),
        createAuditItem(
          "interval",
          "Interval",
          "seconds",
          sampling.nominalIntervalSeconds,
          formatRoundedSeconds(sampling.nominalIntervalSeconds)
        )
      ]
    },
    {
      id: "summary",
      label: "Summary",
      status: input.confidenceFlags.length > 0 ? "warning" : "ok",
      items: [
        createAuditItem(
          "distance",
          "Distance",
          "meters",
          input.summary.totalDistanceMeters,
          formatRoundedMeters(input.summary.totalDistanceMeters)
        ),
        createAuditItem(
          "elevationGain",
          "Elevation gain",
          "meters",
          input.summary.elevationGainMeters,
          formatRoundedMeters(input.summary.elevationGainMeters)
        ),
        createAuditItem(
          "flags",
          "Flags",
          "count",
          input.confidenceFlags.length,
          formatRoundedCount(input.confidenceFlags.length)
        ),
        createAuditItem(
          "timeZone",
          "Time zone",
          "timeZoneConfidence",
          temporal.timeZoneConfidence ?? "unknown",
          String(temporal.timeZoneConfidence ?? "unknown")
        )
      ]
    }
  ];
}

/**
 * @param {unknown} value
 */
function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "n/a";
}

/**
 * @param {unknown} sweep
 */
function formatThresholdSweep(sweep) {
  const range = getThresholdSweepRange(sweep);

  if (!range) {
    return "n/a";
  }

  if (range.firstKind === range.lastKind) {
    return `${range.firstKind}: ${formatRoundedMeters(range.firstThresholdMeters)}`;
  }

  return `${range.firstKind}: ${formatRoundedMeters(range.firstThresholdMeters)} / ${range.lastKind}: ${formatRoundedMeters(range.lastThresholdMeters)}`;
}

/**
 * @param {unknown} sweep
 */
function getThresholdSweepRange(sweep) {
  if (!Array.isArray(sweep) || sweep.length === 0) {
    return null;
  }

  const first = sweep[0];
  const last = sweep.at(-1);

  if (!first || !last || typeof first !== "object" || typeof last !== "object") {
    return null;
  }

  const firstRecord = /** @type {Record<string, unknown>} */ (first);
  const lastRecord = /** @type {Record<string, unknown>} */ (last);

  return {
    firstKind: formatThresholdSweepKind(firstRecord.kind),
    lastKind: formatThresholdSweepKind(lastRecord.kind),
    firstThresholdMeters: firstRecord.thresholdMeters,
    lastThresholdMeters: lastRecord.thresholdMeters
  };
}

/**
 * @param {unknown} kind
 */
function formatThresholdSweepKind(kind) {
  if (kind === "selected_median_local_threshold") {
    return "median";
  }

  if (kind === "selected_p95_local_threshold") {
    return "p95";
  }

  return "threshold";
}
