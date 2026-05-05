// Unit conversion for source speeds stored in meters per second.
export const KMH_PER_MPS = 3.6;

// Absolute safety ceiling for point-to-point speed before profile-specific caps.
export const HARD_SPEED_CEILING_MPS = 50;

// Shared speed-profile ceilings. Point cleaning treats values above these caps
// as impossible jumps; analyzer reliability uses the same caps for speed samples.
export const SPEED_PROFILE_CEILINGS_MPS = Object.freeze({
  slow: 6,
  moderate: 10,
  fast: 25,
  unrestricted: HARD_SPEED_CEILING_MPS,
  unknown: HARD_SPEED_CEILING_MPS
});

/**
 * @param {unknown} speedProfile
 */
export function hasSpeedProfile(speedProfile) {
  return (
    typeof speedProfile === "string" &&
    Object.prototype.hasOwnProperty.call(SPEED_PROFILE_CEILINGS_MPS, speedProfile)
  );
}

/**
 * @param {string} speedProfile
 */
export function getSpeedProfileCeilingMps(speedProfile) {
  const speedCeiling = hasSpeedProfile(speedProfile)
    ? SPEED_PROFILE_CEILINGS_MPS[speedProfile]
    : HARD_SPEED_CEILING_MPS;
  return Math.min(speedCeiling, HARD_SPEED_CEILING_MPS);
}

/**
 * @param {string} speedProfile
 */
export function getSpeedReliabilityCeilingMps(speedProfile) {
  return speedProfile === "unknown" || speedProfile === "unrestricted"
    ? null
    : getSpeedProfileCeilingMps(speedProfile);
}

/**
 * @param {number} speedMps
 */
export function speedMpsToKmh(speedMps) {
  return speedMps * KMH_PER_MPS;
}

/**
 * @param {number | null} speedMps
 */
export function nullableSpeedMpsToKmh(speedMps) {
  return speedMps === null ? null : speedMpsToKmh(speedMps);
}
