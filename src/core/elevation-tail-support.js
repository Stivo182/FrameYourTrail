const SPARSE_TAIL_MAX_SAMPLE_SHARE = 0.05;
const SPARSE_TAIL_MAX_DISTANCE_SHARE = 0.08;
const SPARSE_TAIL_MAX_DURATION_SHARE = 0.08;

/**
 * @typedef {{ routeDistanceMeters: number, point: { timestamp?: Date | null } }} TailSupportObservation
 */

/**
 * @param {TailSupportObservation[]} observations
 * @param {number[]} candidateIndexes
 */
export function getTailSupport(observations, candidateIndexes) {
  const groups = groupContiguousIndexes(candidateIndexes);
  const totalDistance =
    observations[observations.length - 1].routeDistanceMeters - observations[0].routeDistanceMeters;
  const candidateDistance = groups.reduce((total, group) => {
    const first = observations[group[0]];
    const last = observations[group[group.length - 1]];
    return total + Math.max(0, last.routeDistanceMeters - first.routeDistanceMeters);
  }, 0);

  const totalDuration = getObservationDurationSeconds(
    observations[0],
    observations[observations.length - 1]
  );
  const candidateDuration = groups.reduce((total, group) => {
    const duration = getObservationDurationSeconds(
      observations[group[0]],
      observations[group[group.length - 1]]
    );
    return duration === null ? total : total + duration;
  }, 0);

  return {
    sampleShare: candidateIndexes.length / observations.length,
    distanceShare: totalDistance > 0 ? candidateDistance / totalDistance : null,
    durationShare:
      totalDuration !== null && totalDuration > 0 ? candidateDuration / totalDuration : null
  };
}

/**
 * @param {TailSupportObservation[]} observations
 * @param {number[]} candidateIndexes
 */
export function isUnsupportedSparseTailGroup(observations, candidateIndexes) {
  if (candidateIndexes.length === 0) {
    return false;
  }

  const support = getTailSupport(observations, candidateIndexes);
  if (support.sampleShare > SPARSE_TAIL_MAX_SAMPLE_SHARE) {
    return false;
  }

  if (support.distanceShare !== null && support.distanceShare > SPARSE_TAIL_MAX_DISTANCE_SHARE) {
    return false;
  }

  return !(
    support.durationShare !== null && support.durationShare > SPARSE_TAIL_MAX_DURATION_SHARE
  );
}

/**
 * @param {number[]} indexes
 */
export function groupContiguousIndexes(indexes) {
  const groups = [];

  for (const index of indexes) {
    const current = groups[groups.length - 1];
    if (current && current[current.length - 1] === index - 1) {
      current.push(index);
    } else {
      groups.push([index]);
    }
  }

  return groups;
}

/**
 * @param {TailSupportObservation} first
 * @param {TailSupportObservation} last
 */
function getObservationDurationSeconds(first, last) {
  if (!(first.point.timestamp instanceof Date) || !(last.point.timestamp instanceof Date)) {
    return null;
  }

  return Math.max(0, (last.point.timestamp.valueOf() - first.point.timestamp.valueOf()) / 1000);
}
