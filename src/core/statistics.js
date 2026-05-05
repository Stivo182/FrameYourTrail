/**
 * @param {number[]} values
 * @param {number} percentileValue
 */
export function nearestRankPercentile(values, percentileValue) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index];
}

/**
 * @param {number[]} values
 * @param {number} percentileValue
 */
export function interpolatedPercentile(values, percentileValue) {
  const finiteValues = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!finiteValues.length) {
    return null;
  }

  const index = (finiteValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return finiteValues[lower];
  }

  const fraction = index - lower;
  return finiteValues[lower] + (finiteValues[upper] - finiteValues[lower]) * fraction;
}

/**
 * @param {number[]} sortedValues
 * @param {number} percentileValue
 */
export function lowerRankPercentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.floor((sortedValues.length - 1) * percentileValue);
  return sortedValues[index];
}

/**
 * @param {number[]} values
 */
export function lowerRankMedian(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return lowerRankPercentile(sorted, 0.5);
}

/**
 * @param {number[]} values
 * @param {number} percentileValue
 */
export function upperRankPercentile(values, percentileValue) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((sorted.length - 1) * percentileValue)];
}

/**
 * @param {number[]} values
 */
export function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
