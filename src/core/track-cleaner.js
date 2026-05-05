import { haversineMeters } from "./haversine.js";
import { HARD_SPEED_CEILING_MPS, SPEED_PROFILE_CEILINGS_MPS } from "./speed-calibration.js";
import { classifyMotionSpeedProfile } from "./speed-profile.js";
import {
  TRACK_CLEANING_THRESHOLDS,
  assessFixQuality,
  hasValidCoordinates,
  isDuplicatePoint,
  isImpossibleJump,
  isIsolatedZeroCoordinateFix,
  isNonMonotonicTime,
  isShortHeadingFlipJitter
} from "./track-cleaning-rules.js";
import { getSegmentIndex } from "./track-continuity.js";
import {
  PROFILE_OUTLIER_CORRIDOR_THRESHOLDS,
  getProfileOutlierCorridorIndexes
} from "./track-profile-outlier-corridor.js";
import { secondsBetween } from "./track-time.js";

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 * @typedef {ReturnType<typeof classifyMotionSpeedProfile>} MotionSpeedProfile
 * @typedef {MotionSpeedProfile["speedSignals"]} MotionSpeedSignals
 */

/**
 * @param {TrackPoint[]} points
 * @param {{ enabled?: boolean, speedProfile?: string }} [options]
 */
export function cleanTrackPoints(points, options = {}) {
  const speedProfile = resolveSpeedProfile(points, options.speedProfile);
  const { adaptiveSpeedCeilingMps } = speedProfile;
  const profileOutlierCorridorIndexes = getProfileOutlierCorridorIndexes(points, speedProfile);

  if (options.enabled === false) {
    return {
      points,
      diagnostics: createDiagnostics(points.length, points.length, speedProfile)
    };
  }

  const cleaned = [];
  const diagnostics = createDiagnostics(points.length, 0, speedProfile);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = cleaned.at(-1);
    const next = points[index + 1];

    if (!hasValidCoordinates(point)) {
      recordRemoval(diagnostics, "invalid_coordinates", point);
      continue;
    }

    const fixQuality = assessFixQuality(point);

    if (fixQuality.rejected) {
      recordRemoval(diagnostics, "bad_fix", point);
      continue;
    }

    if (fixQuality.warningReasons.length > 0) {
      recordQualityWarning(diagnostics, point, fixQuality.warningReasons);
    }

    if (previous && next && isIsolatedZeroCoordinateFix(previous, point, next)) {
      recordRemoval(diagnostics, "null_island", point);
      continue;
    }

    if (previous && isDuplicatePoint(previous, point)) {
      recordRemoval(diagnostics, "duplicate_points", point);
      continue;
    }

    if (previous && isNonMonotonicTime(previous, point)) {
      recordRemoval(diagnostics, "time_order", point);
      continue;
    }

    if (previous && next && isShortHeadingFlipJitter(previous, point, next)) {
      recordRemoval(diagnostics, "heading_flip_jitter", point);
      continue;
    }

    if (previous) {
      const isProfileOutlierCorridor =
        profileOutlierCorridorIndexes.has(index) &&
        previous === points[index - 1] &&
        !isImpossibleJump(previous, point, HARD_SPEED_CEILING_MPS);

      if (!isProfileOutlierCorridor && isImpossibleJump(previous, point, adaptiveSpeedCeilingMps)) {
        recordRemoval(diagnostics, "gps_jump", point);
        continue;
      }
    }

    cleaned.push(point);
  }

  diagnostics.outputPointCount = cleaned.length;
  diagnostics.pointsRemoved = diagnostics.inputPointCount - diagnostics.outputPointCount;
  return { points: cleaned, diagnostics };
}

/**
 * @param {number} inputPointCount
 * @param {number} outputPointCount
 * @param {{
 *   speedProfile: string,
 *   speedProfileSource: string,
 *   speedProfileConfidence: string,
 *   speedSignals: MotionSpeedSignals,
 *   adaptiveSpeedCeilingMps: number
 * }} options
 */
function createDiagnostics(inputPointCount, outputPointCount, options) {
  return {
    inputPointCount,
    outputPointCount,
    pointsRemoved: inputPointCount - outputPointCount,
    filtersApplied: /** @type {string[]} */ ([]),
    confidenceFlags: /** @type {string[]} */ ([]),
    thresholds: {
      ...TRACK_CLEANING_THRESHOLDS,
      speedProfile: options.speedProfile,
      speedProfileSource: options.speedProfileSource,
      speedProfileConfidence: options.speedProfileConfidence,
      speedSignals: options.speedSignals,
      adaptiveSpeedCeilingMps: options.adaptiveSpeedCeilingMps,
      hardSpeedCeilingMps: HARD_SPEED_CEILING_MPS,
      speedProfileCeilingsMps: SPEED_PROFILE_CEILINGS_MPS,
      ...PROFILE_OUTLIER_CORRIDOR_THRESHOLDS
    },
    qualityWarnings:
      /** @type {{ reason: string, latitude: number, longitude: number, timestamp: string | null }[]} */ ([]),
    removedPoints:
      /** @type {{ reason: string, latitude: number, longitude: number, timestamp: string | null }[]} */ ([])
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {unknown} requestedSpeedProfile
 */
function resolveSpeedProfile(points, requestedSpeedProfile) {
  return classifyMotionSpeedProfile(collectSpeedSamplesMps(points), requestedSpeedProfile);
}

/**
 * @param {TrackPoint[]} points
 */
function collectSpeedSamplesMps(points) {
  const speeds = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];

    if (
      !hasValidCoordinates(previous) ||
      !hasValidCoordinates(point) ||
      getSegmentIndex(previous) !== getSegmentIndex(point)
    ) {
      continue;
    }

    const seconds = secondsBetween(previous, point);

    if (seconds === null || seconds <= 0) {
      continue;
    }

    const speedMps = haversineMeters(previous, point) / seconds;

    if (Number.isFinite(speedMps)) {
      speeds.push(speedMps);
    }
  }

  return speeds;
}

/**
 * @param {ReturnType<typeof createDiagnostics>} diagnostics
 * @param {string} reason
 * @param {TrackPoint} point
 */
function recordRemoval(diagnostics, reason, point) {
  addUnique(diagnostics.filtersApplied, reason);
  diagnostics.removedPoints.push({
    reason,
    latitude: point.latitude,
    longitude: point.longitude,
    timestamp: point.timestamp?.toISOString?.() ?? null
  });
}

/**
 * @param {ReturnType<typeof createDiagnostics>} diagnostics
 * @param {TrackPoint} point
 * @param {string[]} warningReasons
 */
function recordQualityWarning(diagnostics, point, warningReasons) {
  addUnique(diagnostics.confidenceFlags, "gnss_quality_soft_warning");

  for (const reason of warningReasons) {
    diagnostics.qualityWarnings.push({
      reason,
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: point.timestamp?.toISOString?.() ?? null
    });
  }
}

/**
 * @param {string[]} values
 * @param {string} value
 */
function addUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}
