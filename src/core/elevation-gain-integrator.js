import { upperRankPercentile } from "./statistics.js";

/**
 * @typedef {{
 *   distanceMeters: number,
 *   elevation: number,
 *   sigmaRelMeters?: number,
 *   continuousRunId?: number
 * }} ElevationGainSample
 */

/**
 * @param {ElevationGainSample[]} samples
 * @param {{ baseThresholdMeters: number, minSustainedDistanceMeters: number, alpha?: number }} options
 */
export function integrateConfirmedElevationGainLoss(samples, options) {
  // Confirmed-turn hysteresis prevents small oscillations around an anchor from
  // becoming alternating gain/loss. Calibration lives in docs/elevation-calibration.md.
  const alpha = options.alpha ?? 3;
  const thresholds = samples.map((sample) =>
    localThreshold(sample, options.baseThresholdMeters, alpha)
  );

  if (samples.length <= 1) {
    return createResult(0, 0, samples, options, thresholds);
  }

  const profile = [];
  let runStart = 0;

  for (let index = 1; index <= samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (index === samples.length || isRunBoundary(previous, current)) {
      appendRunProfile(profile, samples, thresholds, runStart, index, options);
      runStart = index;
    }
  }

  const totals = sumProfile(profile);
  return createResult(totals.gain, totals.loss, profile, options, thresholds);
}

/**
 * @param {ElevationGainSample[]} profile
 * @param {ElevationGainSample[]} samples
 * @param {number[]} thresholds
 * @param {number} start
 * @param {number} end
 * @param {{ minSustainedDistanceMeters: number }} options
 */
function appendRunProfile(profile, samples, thresholds, start, end, options) {
  if (start >= end) {
    return;
  }

  const anchor = samples[start];
  appendDistinctSample(profile, anchor);

  if (end - start === 1) {
    return;
  }

  let direction = 0;
  let extreme = anchor;

  for (let index = start + 1; index < end; index += 1) {
    const sample = samples[index];
    const threshold = thresholds[index];

    if (direction === 0) {
      const deltaFromAnchor = sample.elevation - anchor.elevation;
      if (
        Math.abs(deltaFromAnchor) >= threshold &&
        sample.distanceMeters - anchor.distanceMeters >= options.minSustainedDistanceMeters
      ) {
        direction = deltaFromAnchor > 0 ? 1 : -1;
        extreme = sample;
      }
      continue;
    }

    if (direction > 0) {
      if (sample.elevation >= extreme.elevation) {
        extreme = sample;
      } else if (
        isConfirmedReversal(extreme, sample, threshold, options.minSustainedDistanceMeters)
      ) {
        appendDistinctSample(profile, extreme);
        direction = -1;
        extreme = sample;
      }
      continue;
    }

    if (sample.elevation <= extreme.elevation) {
      extreme = sample;
    } else if (
      isConfirmedReversal(sample, extreme, threshold, options.minSustainedDistanceMeters)
    ) {
      appendDistinctSample(profile, extreme);
      direction = 1;
      extreme = sample;
    }
  }

  if (direction !== 0) {
    appendDistinctSample(profile, extreme);
  }
}

/**
 * @param {ElevationGainSample} high
 * @param {ElevationGainSample} low
 * @param {number} threshold
 * @param {number} minSustainedDistanceMeters
 */
function isConfirmedReversal(high, low, threshold, minSustainedDistanceMeters) {
  return (
    high.elevation - low.elevation >= threshold &&
    Math.abs(high.distanceMeters - low.distanceMeters) >= minSustainedDistanceMeters
  );
}

/**
 * @param {ElevationGainSample[]} profile
 */
function sumProfile(profile) {
  let gain = 0;
  let loss = 0;

  for (let index = 1; index < profile.length; index += 1) {
    const previous = profile[index - 1];
    const sample = profile[index];

    if (isRunBoundary(previous, sample)) {
      continue;
    }

    const delta = sample.elevation - previous.elevation;
    if (delta > 0) {
      gain += delta;
    } else {
      loss += Math.abs(delta);
    }
  }

  return { gain, loss };
}

/**
 * @param {ElevationGainSample} sample
 * @param {number} baseThresholdMeters
 * @param {number} alpha
 */
function localThreshold(sample, baseThresholdMeters, alpha) {
  return Math.max(baseThresholdMeters, (sample.sigmaRelMeters ?? 0) * alpha);
}

/**
 * @param {number} gain
 * @param {number} loss
 * @param {ElevationGainSample[]} profile
 * @param {{ baseThresholdMeters: number, minSustainedDistanceMeters: number }} options
 * @param {number[]} thresholds
 */
function createResult(gain, loss, profile, options, thresholds) {
  return {
    gain,
    loss,
    profile,
    thresholds: {
      baseThresholdMeters: options.baseThresholdMeters,
      medianThresholdMeters: upperRankPercentile(thresholds, 0.5) ?? options.baseThresholdMeters,
      p95ThresholdMeters: upperRankPercentile(thresholds, 0.95) ?? options.baseThresholdMeters,
      minSustainedDistanceMeters: options.minSustainedDistanceMeters
    }
  };
}

/**
 * @param {ElevationGainSample | undefined} previous
 * @param {ElevationGainSample | undefined} current
 */
function isRunBoundary(previous, current) {
  return (
    previous !== undefined &&
    current !== undefined &&
    previous.continuousRunId !== undefined &&
    current.continuousRunId !== undefined &&
    previous.continuousRunId !== current.continuousRunId
  );
}

/**
 * @param {ElevationGainSample[]} values
 * @param {ElevationGainSample} sample
 */
function appendDistinctSample(values, sample) {
  if (values.at(-1) !== sample) {
    values.push(sample);
  }
}
