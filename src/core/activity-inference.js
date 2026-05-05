import {
  hasTimeGapElevationDiscontinuity,
  normalizeElevationSegmentIndex
} from "./elevation-continuity.js";
import { haversineMeters } from "./haversine.js";
import { nearestRankPercentile } from "./statistics.js";
import { isLowSpeedXyJitterSegment } from "./track-calibration-constants.js";

// These defaults tune the elevation model, not a general sport classifier.
export const ELEVATION_ACTIVITY_DEFAULTS = Object.freeze({
  foot: Object.freeze({
    resampleStepMeters: 5,
    baseThresholdMeters: 3,
    minSustainedDistanceMeters: 20
  }),
  bike: Object.freeze({
    resampleStepMeters: 10,
    baseThresholdMeters: 4,
    minSustainedDistanceMeters: 30
  }),
  water: Object.freeze({
    resampleStepMeters: 10,
    baseThresholdMeters: 15,
    minSustainedDistanceMeters: 300
  }),
  motor: Object.freeze({
    resampleStepMeters: 20,
    baseThresholdMeters: 6,
    minSustainedDistanceMeters: 80
  }),
  route_plan: Object.freeze({
    resampleStepMeters: 10,
    baseThresholdMeters: 6,
    minSustainedDistanceMeters: 40
  }),
  unknown: Object.freeze({
    resampleStepMeters: 10,
    baseThresholdMeters: 5,
    minSustainedDistanceMeters: 40
  })
});
const EXPLICIT_ACTIVITY_TYPES = new Set(["bike", "foot", "water", "motor"]);
const EXPLICIT_ACTIVITY_SOURCES = new Set([
  "fit_session_sport",
  "fit_session_sub_sport",
  "tcx_activity_sport",
  "gpx_track_type",
  "gpx_route_type"
]);

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @param {TrackPoint[]} points
 * @param {{ timeGapBreakIndexes?: Set<number>, explicitActivity?: import("./route-types.js").RouteActivityProvenance | null }} [options]
 * @returns {{
 *   explicit: import("./route-types.js").RouteActivityProvenance | null,
 *   inferred: keyof typeof ELEVATION_ACTIVITY_DEFAULTS,
 *   confidence: number,
 *   defaults: typeof ELEVATION_ACTIVITY_DEFAULTS[keyof typeof ELEVATION_ACTIVITY_DEFAULTS],
 *   reasonCodes: string[],
 *   activityCandidates: {
 *     activity: keyof typeof ELEVATION_ACTIVITY_DEFAULTS,
 *     score: number,
 *     reasonCodes: string[]
 *   }[],
 *   features: {
 *     sampleCount: number,
 *     timedPointCount: number,
 *     medianSpeedKmh: number | null,
 *     p95SpeedKmh: number | null,
 *     netElevationChangeMeters: number | null,
 *     rawElevationChangeMeters: number | null,
 *     directionalElevationRatio: number | null,
 *     speedSupportedDescentMeters: number | null
 *   }
 * }}
 */
export function inferElevationActivity(points, options = {}) {
  if (isExplicitActivity(options.explicitActivity)) {
    const explicit = options.explicitActivity;
    const features = collectActivityFeatures(points, options);

    return {
      explicit,
      inferred: explicit.type,
      confidence: 0.95,
      defaults: ELEVATION_ACTIVITY_DEFAULTS[explicit.type],
      reasonCodes: ["explicit_activity"],
      activityCandidates: [
        { activity: explicit.type, score: 0.95, reasonCodes: ["explicit_activity"] }
      ],
      features
    };
  }

  const features = collectActivityFeatures(points, options);
  const reasonCodes = [];

  if (features.timedPointCount < 2) {
    reasonCodes.push("no_timestamps");
    return createAssessment("route_plan", 0.75, reasonCodes, features);
  }

  const medianSpeedKmh = features.medianSpeedKmh ?? 0;
  const p95SpeedKmh = features.p95SpeedKmh ?? medianSpeedKmh;
  const hasContinuousSpeedEvidence = features.medianSpeedKmh !== null;
  // River/kayak tracks are routed before generic speed classes so sustained
  // downstream trends use the more conservative water elevation defaults.
  const hasSustainedSlowDescent =
    hasContinuousSpeedEvidence &&
    features.netElevationChangeMeters !== null &&
    features.netElevationChangeMeters < -80 &&
    features.speedSupportedDescentMeters !== null &&
    features.speedSupportedDescentMeters > 80 &&
    medianSpeedKmh <= 8 &&
    p95SpeedKmh <= 18;

  if (
    hasSustainedSlowDescent &&
    features.directionalElevationRatio !== null &&
    features.directionalElevationRatio >= 0.75
  ) {
    reasonCodes.push("sustained_directional_descent");
    return createAssessment("water", 0.7, reasonCodes, features);
  }

  if (hasNoisySustainedDescent(features, hasSustainedSlowDescent)) {
    reasonCodes.push("noisy_sustained_descent");
    return createAssessment("water", 0.62, reasonCodes, features);
  }

  // Remaining speed checks are coarse routing for elevation sensitivity.
  if (medianSpeedKmh >= 35 || p95SpeedKmh >= 70) {
    reasonCodes.push("motor_speed");
    return createAssessment("motor", 0.72, reasonCodes, features);
  }

  if (medianSpeedKmh >= 8 || p95SpeedKmh >= 18) {
    reasonCodes.push("bike_speed");
    return createAssessment("bike", 0.68, reasonCodes, features);
  }

  if (medianSpeedKmh > 0) {
    reasonCodes.push("foot_speed");
    return createAssessment("foot", 0.66, reasonCodes, features);
  }

  reasonCodes.push("insufficient_motion_signal");
  return createAssessment("unknown", 0.35, reasonCodes, features);
}

/**
 * @param {unknown} value
 * @returns {value is import("./route-types.js").RouteActivityProvenance}
 */
function isExplicitActivity(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = /** @type {Record<string, unknown>} */ (value);

  return (
    typeof record.type === "string" &&
    EXPLICIT_ACTIVITY_TYPES.has(record.type) &&
    typeof record.source === "string" &&
    EXPLICIT_ACTIVITY_SOURCES.has(record.source) &&
    typeof record.raw === "string"
  );
}

/**
 * @param {ReturnType<typeof collectActivityFeatures>} features
 * @param {boolean} hasSustainedSlowDescent
 */
function hasNoisySustainedDescent(features, hasSustainedSlowDescent) {
  return (
    hasSustainedSlowDescent &&
    features.directionalElevationRatio !== null &&
    features.directionalElevationRatio < 0.75 &&
    features.rawElevationChangeMeters !== null &&
    features.netElevationChangeMeters !== null &&
    features.rawElevationChangeMeters >= Math.abs(features.netElevationChangeMeters) * 4
  );
}

/**
 * @param {keyof typeof ELEVATION_ACTIVITY_DEFAULTS} inferred
 * @param {number} confidence
 * @param {string[]} reasonCodes
 * @param {ReturnType<typeof collectActivityFeatures>} features
 */
function createAssessment(inferred, confidence, reasonCodes, features) {
  return {
    explicit: null,
    inferred,
    confidence,
    defaults: ELEVATION_ACTIVITY_DEFAULTS[inferred],
    reasonCodes,
    activityCandidates: buildActivityCandidates(inferred, confidence, reasonCodes, features),
    features
  };
}

/**
 * @param {keyof typeof ELEVATION_ACTIVITY_DEFAULTS} selected
 * @param {number} selectedScore
 * @param {string[]} selectedReasonCodes
 * @param {ReturnType<typeof collectActivityFeatures>} features
 */
function buildActivityCandidates(selected, selectedScore, selectedReasonCodes, features) {
  const candidates = [
    {
      activity: selected,
      score: selectedScore,
      reasonCodes: selectedReasonCodes
    }
  ];

  if (selected !== "foot" && (features.medianSpeedKmh ?? 0) > 0) {
    candidates.push({
      activity: "foot",
      score: selected === "bike" ? 0.48 : 0.35,
      reasonCodes: ["fallback_slow_motion_candidate"]
    });
  }

  if (
    selected !== "bike" &&
    ((features.medianSpeedKmh ?? 0) >= 6 || (features.p95SpeedKmh ?? 0) >= 16)
  ) {
    candidates.push({
      activity: "bike",
      score: selected === "foot" ? 0.48 : 0.4,
      reasonCodes: ["near_bike_speed_candidate"]
    });
  }

  if (
    selected !== "water" &&
    features.netElevationChangeMeters !== null &&
    features.netElevationChangeMeters < -80
  ) {
    candidates.push({
      activity: "water",
      score: 0.42,
      reasonCodes: ["sustained_descent_candidate"]
    });
  }

  // Flat kayak/lake movement should be visible as ambiguity, but not selected
  // as water without route context or an explicit downstream signal.
  if (selected !== "water" && isFlatLowSpeedWaterCandidate(features)) {
    candidates.push({
      activity: "water",
      score: selected === "foot" ? 0.42 : 0.35,
      reasonCodes: ["flat_low_speed_water_candidate"]
    });
  }

  return candidates.sort((left, right) => right.score - left.score);
}

/**
 * @param {ReturnType<typeof collectActivityFeatures>} features
 */
function isFlatLowSpeedWaterCandidate(features) {
  const medianSpeedKmh = features.medianSpeedKmh ?? 0;
  const p95SpeedKmh = features.p95SpeedKmh ?? medianSpeedKmh;
  if (
    features.timedPointCount < 6 ||
    medianSpeedKmh <= 0 ||
    medianSpeedKmh > 8 ||
    p95SpeedKmh > 18 ||
    features.netElevationChangeMeters === null ||
    features.rawElevationChangeMeters === null
  ) {
    return false;
  }

  return (
    Math.abs(features.netElevationChangeMeters) <= 20 &&
    (features.rawElevationChangeMeters <= 40 ||
      (features.directionalElevationRatio !== null && features.directionalElevationRatio <= 0.5))
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {{ timeGapBreakIndexes?: Set<number> }} [options]
 */
function collectActivityFeatures(points, options = {}) {
  const speeds = [];
  const elevationSegments = [];
  let timedPointCount = 0;
  let elevationRunId = 0;
  let xyAnchorPoint = points[0];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    const segmentIndex = normalizeElevationSegmentIndex(point.segmentIndex);
    const hasDeclaredTimeGapBeforePoint = options.timeGapBreakIndexes?.has(index) === true;
    const hasElevationBreakBeforePoint = hasTimeGapElevationDiscontinuity(
      index,
      options.timeGapBreakIndexes,
      previous,
      point
    );
    const isMotionBreakBeforePoint =
      index > 0 &&
      (hasDeclaredTimeGapBeforePoint ||
        normalizeElevationSegmentIndex(previous?.segmentIndex) !== segmentIndex);
    const continuousPairMotion =
      index > 0 && !isMotionBreakBeforePoint
        ? getContinuousPairMotion(xyAnchorPoint, previous, point)
        : { speedKmh: null, advancesAnchor: index === 0 };

    if (isMotionBreakBeforePoint) {
      xyAnchorPoint = point;
    } else if (continuousPairMotion.advancesAnchor) {
      xyAnchorPoint = point;
    }

    if (index > 0 && hasElevationBreakBeforePoint) {
      elevationRunId += 1;
    }

    if (isValidDate(point.timestamp)) {
      timedPointCount += 1;
    }
    if (Number.isFinite(point.elevation)) {
      const previousSegment = elevationSegments.at(-1);
      if (
        previousSegment &&
        previousSegment.segmentIndex === segmentIndex &&
        previousSegment.elevationRunId === elevationRunId
      ) {
        const elevation = Number(point.elevation);
        previousSegment.transitions.push({
          deltaMeters:
            elevation - previousSegment.elevations[previousSegment.elevations.length - 1],
          hasContinuousSpeedEvidence: continuousPairMotion.speedKmh !== null
        });
        previousSegment.elevations.push(elevation);
      } else {
        elevationSegments.push({
          segmentIndex,
          elevationRunId,
          elevations: [Number(point.elevation)],
          transitions: []
        });
      }
    } else {
      elevationRunId += 1;
    }
    if (continuousPairMotion.speedKmh !== null) {
      speeds.push(continuousPairMotion.speedKmh);
    }
  }

  const elevationChanges = collectElevationChanges(elevationSegments);
  const rawElevationChangeMeters = elevationChanges.rawElevationChangeMeters;
  const netElevationChangeMeters = elevationChanges.netElevationChangeMeters;
  const directionalElevationRatio =
    rawElevationChangeMeters !== null &&
    rawElevationChangeMeters > 0 &&
    netElevationChangeMeters !== null
      ? Math.abs(netElevationChangeMeters) / rawElevationChangeMeters
      : null;

  return {
    sampleCount: points.length,
    timedPointCount,
    medianSpeedKmh: nearestRankPercentile(speeds, 0.5),
    p95SpeedKmh: nearestRankPercentile(speeds, 0.95),
    netElevationChangeMeters,
    rawElevationChangeMeters,
    directionalElevationRatio,
    speedSupportedDescentMeters: elevationChanges.speedSupportedDescentMeters
  };
}

/**
 * @param {{ segmentIndex: number, elevationRunId: number, elevations: number[], transitions: { deltaMeters: number, hasContinuousSpeedEvidence: boolean }[] }[]} segments
 */
function collectElevationChanges(segments) {
  let rawElevationChangeMeters = 0;
  let netElevationChangeMeters = 0;
  let speedSupportedDescentMeters = 0;
  let hasElevationChange = false;

  for (const segment of segments) {
    if (segment.elevations.length < 2) {
      continue;
    }

    const segmentNetChange =
      segment.elevations[segment.elevations.length - 1] - segment.elevations[0];
    rawElevationChangeMeters += sumAbsoluteDeltas(segment.elevations);
    netElevationChangeMeters += segmentNetChange;
    speedSupportedDescentMeters += sumContinuousDescentMeters(segment.transitions);
    hasElevationChange = true;
  }

  return {
    rawElevationChangeMeters: hasElevationChange ? rawElevationChangeMeters : null,
    netElevationChangeMeters: hasElevationChange ? netElevationChangeMeters : null,
    speedSupportedDescentMeters: hasElevationChange ? speedSupportedDescentMeters : null
  };
}

/**
 * @param {{ deltaMeters: number, hasContinuousSpeedEvidence: boolean }[]} transitions
 */
function sumContinuousDescentMeters(transitions) {
  let descentMeters = 0;

  for (const transition of transitions) {
    if (transition.hasContinuousSpeedEvidence === true && transition.deltaMeters < 0) {
      descentMeters += Math.abs(transition.deltaMeters);
    }
  }

  return descentMeters;
}

/**
 * @param {TrackPoint | undefined} xyAnchorPoint
 * @param {TrackPoint | undefined} previous
 * @param {TrackPoint} point
 * @returns {{ speedKmh: number | null, advancesAnchor: boolean }}
 */
function getContinuousPairMotion(xyAnchorPoint, previous, point) {
  if (previous === undefined || !isValidDate(previous.timestamp) || !isValidDate(point.timestamp)) {
    return { speedKmh: null, advancesAnchor: true };
  }

  const durationSeconds = (point.timestamp.valueOf() - previous.timestamp.valueOf()) / 1000;
  if (durationSeconds <= 0) {
    return { speedKmh: null, advancesAnchor: true };
  }

  const distanceMeters = haversineMeters(previous, point);
  if (distanceMeters <= 0) {
    return { speedKmh: null, advancesAnchor: false };
  }

  const distanceFromAnchorMeters =
    xyAnchorPoint === undefined ? distanceMeters : haversineMeters(xyAnchorPoint, point);
  if (isLowSpeedXyJitterSegment(distanceFromAnchorMeters, distanceMeters, durationSeconds)) {
    return { speedKmh: null, advancesAnchor: false };
  }

  return { speedKmh: (distanceMeters / durationSeconds) * 3.6, advancesAnchor: true };
}

/**
 * @param {number[]} values
 */
function sumAbsoluteDeltas(values) {
  let total = 0;
  for (let index = 1; index < values.length; index += 1) {
    total += Math.abs(values[index] - values[index - 1]);
  }
  return total;
}

/**
 * @param {unknown} value
 * @returns {value is Date}
 */
function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.valueOf());
}
