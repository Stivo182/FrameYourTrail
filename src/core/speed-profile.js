import {
  HARD_SPEED_CEILING_MPS,
  SPEED_PROFILE_CEILINGS_MPS,
  getSpeedProfileCeilingMps,
  getSpeedReliabilityCeilingMps,
  hasSpeedProfile,
  nullableSpeedMpsToKmh
} from "./speed-calibration.js";
import { lowerRankPercentile, median } from "./statistics.js";

// Cleaner-side motion profile inference needs enough non-drift samples before
// selecting a slow/moderate/fast ceiling automatically.
const SPEED_PROFILE_INFERENCE_MIN_SPEED_SAMPLES = 5;

// Speeds below this floor are treated as stationary drift for profile inference.
const SPEED_PROFILE_INFERENCE_MIN_MOVING_SPEED_MPS = 0.3;

// A candidate motion profile is rejected if too much of the track exceeds its
// point-cleaning ceiling; this keeps one fast section from being over-pruned.
const SPEED_PROFILE_INFERENCE_MAX_OUTLIER_SHARE = 0.25;

// Lower rank means a stricter reliability profile. Unknown and unrestricted are
// intentionally least conservative so distribution evidence can tighten them.
const SPEED_RELIABILITY_PROFILE_RANK = Object.freeze({
  slow: 0,
  moderate: 1,
  fast: 2,
  unrestricted: 3,
  unknown: 3
});

// Reliability distribution inference is disabled for very small samples because
// percentiles are unstable with only a few point pairs.
const SPEED_RELIABILITY_DISTRIBUTION_MIN_SAMPLES = 8;

// Slow reliability requires a walking-like low tail and median, while still
// allowing some compressed high-speed samples to be rejected later.
const SPEED_RELIABILITY_SLOW_P10_MAX_KMH = 5;
const SPEED_RELIABILITY_SLOW_P25_MAX_KMH = 8;
const SPEED_RELIABILITY_SLOW_P50_MAX_KMH = 24;

// Moderate reliability catches mixed outdoor tracks that are faster than hikes
// but still should not accept large compressed one-second jumps.
const SPEED_RELIABILITY_MODERATE_P25_MAX_KMH = 15;
const SPEED_RELIABILITY_MODERATE_P50_MAX_KMH = 30;

// Do not infer a stricter reliability profile if that profile would discard the
// majority of available speed samples.
const SPEED_RELIABILITY_MAX_REJECTED_SHARE = 0.5;

/**
 * @param {number[]} speedsMps
 * @param {unknown} requestedSpeedProfile
 */
export function classifyMotionSpeedProfile(speedsMps, requestedSpeedProfile) {
  const hasRequestedSpeedProfile =
    typeof requestedSpeedProfile === "string" && requestedSpeedProfile.trim() !== "";
  const speedSignals = createMotionSpeedSignals(speedsMps);
  const requestedProfile = normalizeSpeedProfile(requestedSpeedProfile);

  if (hasRequestedSpeedProfile && requestedProfile !== "unknown") {
    return createMotionSpeedProfile(requestedProfile, "explicit", "high", speedSignals);
  }

  if (!hasRequestedSpeedProfile) {
    const inferred = inferMotionSpeedProfile(speedSignals);

    if (inferred.speedProfile !== "unknown") {
      return createMotionSpeedProfile(
        inferred.speedProfile,
        "inferred",
        inferred.speedProfileConfidence,
        speedSignals
      );
    }
  }

  return createMotionSpeedProfile(
    "unknown",
    hasRequestedSpeedProfile ? "explicit" : "default",
    "low",
    speedSignals
  );
}

/**
 * @param {number[]} speedsKmh
 * @param {{ requestedProfile?: unknown, fallbackProfile?: unknown }} [options]
 */
export function classifySpeedReliabilityProfile(speedsKmh, options = {}) {
  const speeds = speedsKmh
    .filter((speed) => Number.isFinite(speed))
    .sort((left, right) => left - right);
  const signals = createSpeedReliabilitySignals(speeds);
  const rejectedShareGuardByProfile = createRejectedShareByProfile(speeds, { rounded: false });
  const rejectedShareByProfile = createRejectedShareByProfile(speeds);
  const warnings = [];
  const distributionProfile = inferSpeedReliabilityProfileFromDistribution(
    signals,
    rejectedShareGuardByProfile,
    warnings
  );
  const requestedProfile = normalizeSpeedReliabilityProfile(options.requestedProfile);

  if (requestedProfile !== null) {
    return createSpeedReliabilityProfile(
      requestedProfile,
      "explicit",
      signals,
      rejectedShareByProfile,
      warnings
    );
  }

  const fallbackProfile = normalizeSpeedReliabilityProfile(options.fallbackProfile);
  const currentProfile = fallbackProfile ?? "unknown";

  if (
    distributionProfile !== null &&
    isMoreConservativeSpeedReliabilityProfile(distributionProfile, currentProfile)
  ) {
    return createSpeedReliabilityProfile(
      distributionProfile,
      "speed_distribution",
      signals,
      rejectedShareByProfile,
      warnings
    );
  }

  return createSpeedReliabilityProfile(
    currentProfile,
    fallbackProfile === null ? "default" : "cleaning_profile",
    signals,
    rejectedShareByProfile,
    warnings
  );
}

/**
 * @param {unknown} speedProfile
 */
export function normalizeSpeedProfile(speedProfile) {
  return typeof speedProfile === "string" && hasSpeedProfile(speedProfile)
    ? speedProfile
    : "unknown";
}

/**
 * @param {string} speedProfile
 * @param {string} speedProfileSource
 * @param {string} speedProfileConfidence
 * @param {ReturnType<typeof createMotionSpeedSignals>} speedSignals
 */
function createMotionSpeedProfile(
  speedProfile,
  speedProfileSource,
  speedProfileConfidence,
  speedSignals
) {
  return {
    speedProfile,
    speedProfileSource,
    speedProfileConfidence,
    speedSignals,
    adaptiveSpeedCeilingMps: getSpeedProfileCeilingMps(speedProfile)
  };
}

/**
 * @param {number[]} speedsMps
 */
function createMotionSpeedSignals(speedsMps) {
  const sortedSpeeds = speedsMps
    .filter(
      (speedMps) =>
        Number.isFinite(speedMps) &&
        speedMps >= SPEED_PROFILE_INFERENCE_MIN_MOVING_SPEED_MPS &&
        speedMps <= HARD_SPEED_CEILING_MPS
    )
    .sort((left, right) => left - right);

  return {
    speedSampleCount: sortedSpeeds.length,
    medianSpeedMps: roundSignal(lowerRankPercentile(sortedSpeeds, 0.5)),
    p75SpeedMps: roundSignal(lowerRankPercentile(sortedSpeeds, 0.75)),
    p90SpeedMps: roundSignal(lowerRankPercentile(sortedSpeeds, 0.9)),
    slowOutlierShare: roundNumber(getOutlierShare(sortedSpeeds, SPEED_PROFILE_CEILINGS_MPS.slow)),
    moderateOutlierShare: roundNumber(
      getOutlierShare(sortedSpeeds, SPEED_PROFILE_CEILINGS_MPS.moderate)
    ),
    fastOutlierShare: roundNumber(getOutlierShare(sortedSpeeds, SPEED_PROFILE_CEILINGS_MPS.fast))
  };
}

/**
 * @param {ReturnType<typeof createMotionSpeedSignals>} signals
 */
function inferMotionSpeedProfile(signals) {
  if (
    signals.speedSampleCount < SPEED_PROFILE_INFERENCE_MIN_SPEED_SAMPLES ||
    signals.medianSpeedMps === null ||
    signals.p75SpeedMps === null
  ) {
    return { speedProfile: "unknown", speedProfileConfidence: "low" };
  }

  if (
    signals.medianSpeedMps <= 2.2 &&
    signals.p75SpeedMps <= 3.2 &&
    signals.slowOutlierShare <= SPEED_PROFILE_INFERENCE_MAX_OUTLIER_SHARE
  ) {
    return { speedProfile: "slow", speedProfileConfidence: "high" };
  }

  if (
    signals.medianSpeedMps <= 4.5 &&
    signals.p75SpeedMps <= 7.5 &&
    signals.moderateOutlierShare <= SPEED_PROFILE_INFERENCE_MAX_OUTLIER_SHARE
  ) {
    return { speedProfile: "moderate", speedProfileConfidence: "high" };
  }

  if (
    signals.medianSpeedMps <= 12 &&
    signals.p75SpeedMps <= 20 &&
    signals.fastOutlierShare <= SPEED_PROFILE_INFERENCE_MAX_OUTLIER_SHARE
  ) {
    return { speedProfile: "fast", speedProfileConfidence: "high" };
  }

  return { speedProfile: "unknown", speedProfileConfidence: "low" };
}

/**
 * @param {number[]} sortedSpeeds
 */
function createSpeedReliabilitySignals(sortedSpeeds) {
  return {
    speedSampleCount: sortedSpeeds.length,
    p10SpeedKmh: roundSignal(lowerRankPercentile(sortedSpeeds, 0.1)),
    p25SpeedKmh: roundSignal(lowerRankPercentile(sortedSpeeds, 0.25)),
    p50SpeedKmh: roundSignal(median(sortedSpeeds)),
    p75SpeedKmh: roundSignal(lowerRankPercentile(sortedSpeeds, 0.75)),
    p90SpeedKmh: roundSignal(lowerRankPercentile(sortedSpeeds, 0.9)),
    minSampleCount: SPEED_RELIABILITY_DISTRIBUTION_MIN_SAMPLES,
    slowP10MaxKmh: SPEED_RELIABILITY_SLOW_P10_MAX_KMH,
    slowP25MaxKmh: SPEED_RELIABILITY_SLOW_P25_MAX_KMH,
    slowP50MaxKmh: SPEED_RELIABILITY_SLOW_P50_MAX_KMH,
    moderateP25MaxKmh: SPEED_RELIABILITY_MODERATE_P25_MAX_KMH,
    moderateP50MaxKmh: SPEED_RELIABILITY_MODERATE_P50_MAX_KMH
  };
}

/**
 * @param {ReturnType<typeof createSpeedReliabilitySignals>} signals
 * @param {Record<string, number>} rejectedShareByProfile
 * @param {string[]} warnings
 */
function inferSpeedReliabilityProfileFromDistribution(signals, rejectedShareByProfile, warnings) {
  if (passesSlowReliabilityPercentileGates(signals)) {
    if (rejectedShareByProfile.slow <= SPEED_RELIABILITY_MAX_REJECTED_SHARE) {
      return "slow";
    }

    warnings.push("slow_rejected_share_too_high");
  }

  if (
    passesModerateReliabilityPercentileGates(signals) &&
    rejectedShareByProfile.moderate <= SPEED_RELIABILITY_MAX_REJECTED_SHARE
  ) {
    return "moderate";
  }

  return null;
}

/**
 * @param {ReturnType<typeof createSpeedReliabilitySignals>} signals
 */
function passesSlowReliabilityPercentileGates(signals) {
  return (
    signals.speedSampleCount >= SPEED_RELIABILITY_DISTRIBUTION_MIN_SAMPLES &&
    signals.p10SpeedKmh !== null &&
    signals.p25SpeedKmh !== null &&
    signals.p50SpeedKmh !== null &&
    signals.p10SpeedKmh <= SPEED_RELIABILITY_SLOW_P10_MAX_KMH &&
    signals.p25SpeedKmh <= SPEED_RELIABILITY_SLOW_P25_MAX_KMH &&
    signals.p50SpeedKmh <= SPEED_RELIABILITY_SLOW_P50_MAX_KMH
  );
}

/**
 * @param {ReturnType<typeof createSpeedReliabilitySignals>} signals
 */
function passesModerateReliabilityPercentileGates(signals) {
  return (
    signals.speedSampleCount >= SPEED_RELIABILITY_DISTRIBUTION_MIN_SAMPLES &&
    signals.p25SpeedKmh !== null &&
    signals.p50SpeedKmh !== null &&
    signals.p25SpeedKmh <= SPEED_RELIABILITY_MODERATE_P25_MAX_KMH &&
    signals.p50SpeedKmh <= SPEED_RELIABILITY_MODERATE_P50_MAX_KMH
  );
}

/**
 * @param {string} profile
 * @param {string} source
 * @param {ReturnType<typeof createSpeedReliabilitySignals>} signals
 * @param {Record<string, number>} rejectedShareByProfile
 * @param {string[]} warnings
 */
function createSpeedReliabilityProfile(profile, source, signals, rejectedShareByProfile, warnings) {
  const maxReliableSpeedMps = getSpeedReliabilityCeilingMps(profile);

  return {
    profile,
    source,
    signals,
    maxReliableSpeedMps,
    maxReliableSpeedKmh: nullableSpeedMpsToKmh(maxReliableSpeedMps),
    rejectedShareByProfile,
    warnings
  };
}

/**
 * @param {unknown} profile
 */
function normalizeSpeedReliabilityProfile(profile) {
  return typeof profile === "string" && hasSpeedProfile(profile) ? profile : null;
}

/**
 * @param {number[]} sortedSpeeds
 * @param {{ rounded?: boolean }} [options]
 */
function createRejectedShareByProfile(sortedSpeeds, options = {}) {
  const shouldRound = options.rounded ?? true;

  return Object.fromEntries(
    Object.keys(SPEED_PROFILE_CEILINGS_MPS).map((profile) => {
      const ceilingMps = getSpeedReliabilityCeilingMps(profile);
      const ceilingKmh = nullableSpeedMpsToKmh(ceilingMps);
      const rejectedShare = getReliableRejectedShare(sortedSpeeds, ceilingKmh);
      return [profile, shouldRound ? roundNumber(rejectedShare) : rejectedShare];
    })
  );
}

/**
 * @param {number[]} sortedSpeeds
 * @param {number | null} ceilingKmh
 */
function getReliableRejectedShare(sortedSpeeds, ceilingKmh) {
  if (sortedSpeeds.length === 0 || ceilingKmh === null) {
    return 0;
  }

  return sortedSpeeds.filter((speed) => speed > ceilingKmh).length / sortedSpeeds.length;
}

/**
 * @param {string} candidateProfile
 * @param {string} currentProfile
 */
function isMoreConservativeSpeedReliabilityProfile(candidateProfile, currentProfile) {
  return (
    getSpeedReliabilityProfileRank(candidateProfile) <
    getSpeedReliabilityProfileRank(currentProfile)
  );
}

/**
 * @param {string} profile
 */
function getSpeedReliabilityProfileRank(profile) {
  return Object.prototype.hasOwnProperty.call(SPEED_RELIABILITY_PROFILE_RANK, profile)
    ? SPEED_RELIABILITY_PROFILE_RANK[profile]
    : SPEED_RELIABILITY_PROFILE_RANK.unknown;
}

/**
 * @param {number[]} sortedValues
 * @param {number} ceiling
 */
function getOutlierShare(sortedValues, ceiling) {
  if (sortedValues.length === 0) {
    return 0;
  }

  return sortedValues.filter((speed) => speed > ceiling).length / sortedValues.length;
}

/**
 * @param {number | null} value
 */
function roundSignal(value) {
  return value === null ? null : roundNumber(value);
}

/**
 * @param {number} value
 */
function roundNumber(value) {
  return Math.round(value * 100) / 100;
}
