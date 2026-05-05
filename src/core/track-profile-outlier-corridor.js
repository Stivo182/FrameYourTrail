import { haversineMeters } from "./haversine.js";
import { HARD_SPEED_CEILING_MPS } from "./speed-calibration.js";
import {
  assessFixQuality,
  getTurnDegrees,
  hasValidCoordinates,
  isDuplicatePoint,
  isIsolatedZeroCoordinateFix,
  isNonMonotonicTime,
  isShortHeadingFlipJitter
} from "./track-cleaning-rules.js";
import { getSegmentIndex } from "./track-continuity.js";
import { secondsBetween } from "./track-time.js";

const PROFILE_OUTLIER_CORRIDOR_MIN_PAIR_COUNT = 4;
const PROFILE_OUTLIER_CORRIDOR_MIN_FAST_PAIR_COUNT = 3;
const PROFILE_OUTLIER_CORRIDOR_NEAR_SPEED_RATIO = 0.7;
const PROFILE_OUTLIER_CORRIDOR_BRIDGE_MIN_SPEED_RATIO = 0.5;
const PROFILE_OUTLIER_CORRIDOR_MAX_BRIDGE_PAIR_COUNT = 1;
const PROFILE_OUTLIER_CORRIDOR_MIN_DIRECTNESS = 0.35;
const PROFILE_OUTLIER_CORRIDOR_MAX_TURN_DEGREES = 75;

export const PROFILE_OUTLIER_CORRIDOR_THRESHOLDS = Object.freeze({
  profileOutlierCorridorMinPairCount: PROFILE_OUTLIER_CORRIDOR_MIN_PAIR_COUNT,
  profileOutlierCorridorMinFastPairCount: PROFILE_OUTLIER_CORRIDOR_MIN_FAST_PAIR_COUNT,
  profileOutlierCorridorNearSpeedRatio: PROFILE_OUTLIER_CORRIDOR_NEAR_SPEED_RATIO,
  profileOutlierCorridorBridgeMinSpeedRatio: PROFILE_OUTLIER_CORRIDOR_BRIDGE_MIN_SPEED_RATIO,
  profileOutlierCorridorMaxBridgePairCount: PROFILE_OUTLIER_CORRIDOR_MAX_BRIDGE_PAIR_COUNT,
  profileOutlierCorridorMinDirectness: PROFILE_OUTLIER_CORRIDOR_MIN_DIRECTNESS,
  profileOutlierCorridorMaxTurnDegrees: PROFILE_OUTLIER_CORRIDOR_MAX_TURN_DEGREES
});

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 * @typedef {{
 *   index: number,
 *   distanceMeters: number,
 *   speedMps: number,
 *   isFast: boolean,
 *   isBridge: boolean
 * }} ProfileCorridorPair
 */

/**
 * Inferred slow motion profiles are conservative by design. Keep coherent fast
 * corridors as route geometry, while still dropping isolated profile outliers
 * and any pair above the hard safety ceiling.
 * @param {TrackPoint[]} points
 * @param {{ speedProfile: string, speedProfileSource: string, adaptiveSpeedCeilingMps: number }} speedProfile
 * @returns {Set<number>}
 */
export function getProfileOutlierCorridorIndexes(points, speedProfile) {
  const indexes = new Set();
  const ceilingMps = speedProfile.adaptiveSpeedCeilingMps;

  if (
    speedProfile.speedProfileSource !== "inferred" ||
    speedProfile.speedProfile !== "slow" ||
    !Number.isFinite(ceilingMps) ||
    ceilingMps >= HARD_SPEED_CEILING_MPS
  ) {
    return indexes;
  }

  /** @type {ProfileCorridorPair[]} */
  let corridor = [];
  let bridgePairCount = 0;
  const flushCorridor = () => {
    if (isCoherentProfileOutlierCorridor(points, corridor)) {
      for (const sample of corridor) {
        if (sample.isFast) {
          indexes.add(sample.index);
        }
      }
    }

    corridor = [];
    bridgePairCount = 0;
  };

  for (let index = 1; index < points.length; index += 1) {
    const sample = getProfileCorridorPair(points, index, ceilingMps);

    if (sample) {
      corridor.push(sample);
    } else {
      const bridgeSample = getProfileCorridorBridgePair(points, index, ceilingMps);
      const nextSample = getProfileCorridorPair(points, index + 1, ceilingMps);

      if (
        bridgeSample &&
        nextSample &&
        corridor.length > 0 &&
        bridgePairCount < PROFILE_OUTLIER_CORRIDOR_MAX_BRIDGE_PAIR_COUNT
      ) {
        corridor.push(bridgeSample);
        bridgePairCount += 1;
        continue;
      }

      flushCorridor();
    }
  }

  flushCorridor();
  return indexes;
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 * @param {number} ceilingMps
 * @returns {ProfileCorridorPair | null}
 */
function getProfileCorridorPair(points, index, ceilingMps) {
  const sample = getProfileCorridorPairCandidate(points, index, ceilingMps);

  if (!sample) {
    return null;
  }

  const isNearFast = sample.speedMps >= ceilingMps * PROFILE_OUTLIER_CORRIDOR_NEAR_SPEED_RATIO;

  return isNearFast ? sample : null;
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 * @param {number} ceilingMps
 * @returns {ProfileCorridorPair | null}
 */
function getProfileCorridorBridgePair(points, index, ceilingMps) {
  const sample = getProfileCorridorPairCandidate(points, index, ceilingMps);

  if (!sample) {
    return null;
  }

  const bridgeMinSpeedMps = ceilingMps * PROFILE_OUTLIER_CORRIDOR_BRIDGE_MIN_SPEED_RATIO;
  const nearFastSpeedMps = ceilingMps * PROFILE_OUTLIER_CORRIDOR_NEAR_SPEED_RATIO;

  if (sample.speedMps < bridgeMinSpeedMps || sample.speedMps >= nearFastSpeedMps) {
    return null;
  }

  return {
    ...sample,
    isBridge: true
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {number} index
 * @param {number} ceilingMps
 * @returns {ProfileCorridorPair | null}
 */
function getProfileCorridorPairCandidate(points, index, ceilingMps) {
  const previousPrevious = points[index - 2];
  const previous = points[index - 1];
  const point = points[index];
  const next = points[index + 1];

  if (!previous || !point) {
    return null;
  }

  if (
    wouldEarlyCleaningRejectPairPoint(previousPrevious, previous, point) ||
    wouldEarlyCleaningRejectPairPoint(previous, point, next)
  ) {
    return null;
  }

  if (
    !hasValidCoordinates(previous) ||
    !hasValidCoordinates(point) ||
    getSegmentIndex(previous) !== getSegmentIndex(point)
  ) {
    return null;
  }

  const seconds = secondsBetween(previous, point);

  if (seconds === null || seconds <= 0) {
    return null;
  }

  const distanceMeters = haversineMeters(previous, point);
  const speedMps = distanceMeters / seconds;
  const isFast = speedMps > ceilingMps;

  if (!Number.isFinite(speedMps) || speedMps > HARD_SPEED_CEILING_MPS) {
    return null;
  }

  return {
    index,
    distanceMeters,
    speedMps,
    isFast,
    isBridge: false
  };
}

/**
 * The corridor pass is computed before the destructive cleaning loop. Keep it
 * aligned with earlier point-level filters so a point that will be rejected
 * anyway cannot make a later cleaned bridge look coherent.
 * @param {TrackPoint | undefined} previous
 * @param {TrackPoint} point
 * @param {TrackPoint | undefined} next
 */
function wouldEarlyCleaningRejectPairPoint(previous, point, next) {
  if (!hasValidCoordinates(point)) {
    return true;
  }

  if (assessFixQuality(point).rejected) {
    return true;
  }

  if (previous && next && isIsolatedZeroCoordinateFix(previous, point, next)) {
    return true;
  }

  if (previous && isDuplicatePoint(previous, point)) {
    return true;
  }

  if (previous && isNonMonotonicTime(previous, point)) {
    return true;
  }

  return Boolean(previous && next && isShortHeadingFlipJitter(previous, point, next));
}

/**
 * @param {TrackPoint[]} points
 * @param {ProfileCorridorPair[]} corridor
 */
function isCoherentProfileOutlierCorridor(points, corridor) {
  if (corridor.length < PROFILE_OUTLIER_CORRIDOR_MIN_PAIR_COUNT) {
    return false;
  }

  const fastPairCount = corridor.reduce((count, sample) => count + (sample.isFast ? 1 : 0), 0);

  if (fastPairCount < PROFILE_OUTLIER_CORRIDOR_MIN_FAST_PAIR_COUNT) {
    return false;
  }

  const first = corridor[0];
  const last = corridor.at(-1);

  if (!first || !last) {
    return false;
  }

  const pathDistanceMeters = corridor.reduce(
    (distance, sample) => distance + sample.distanceMeters,
    0
  );

  if (pathDistanceMeters <= 0) {
    return false;
  }

  const directDistanceMeters = haversineMeters(points[first.index - 1], points[last.index]);
  const directness = directDistanceMeters / pathDistanceMeters;

  if (directness < PROFILE_OUTLIER_CORRIDOR_MIN_DIRECTNESS) {
    return false;
  }

  return getMaxCorridorTurnDegrees(points, corridor) <= PROFILE_OUTLIER_CORRIDOR_MAX_TURN_DEGREES;
}

/**
 * @param {TrackPoint[]} points
 * @param {ProfileCorridorPair[]} corridor
 */
function getMaxCorridorTurnDegrees(points, corridor) {
  let maxTurnDegrees = 0;

  for (let index = 1; index < corridor.length; index += 1) {
    const previousSample = corridor[index - 1];
    const sample = corridor[index];

    if (previousSample.index + 1 !== sample.index) {
      continue;
    }

    const turnDegrees = getTurnDegrees(
      points[previousSample.index - 1],
      points[previousSample.index],
      points[sample.index]
    );
    maxTurnDegrees = Math.max(maxTurnDegrees, turnDegrees);
  }

  return maxTurnDegrees;
}
