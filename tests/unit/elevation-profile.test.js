import { describe, expect, it } from "vitest";
import { getElevationStats } from "../../src/core/elevation-profile.js";

const timedPoint = (index, elevation, overrides = {}) => ({
  latitude: 55 + index * 0.0001,
  longitude: 37,
  elevation,
  timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, 0) + index * 10_000),
  segmentIndex: 0,
  ...overrides
});

function makeShapePoints(elevations, pointsPerLeg = 1) {
  const points = [];

  for (let legIndex = 0; legIndex < elevations.length - 1; legIndex += 1) {
    const start = elevations[legIndex];
    const end = elevations[legIndex + 1];

    if (legIndex === 0) {
      points.push(timedPoint(legIndex, start));
    }

    for (let step = 1; step <= pointsPerLeg; step += 1) {
      const ratio = step / pointsPerLeg;
      points.push(timedPoint(legIndex + ratio, start + (end - start) * ratio));
    }
  }

  return points;
}

const requireValue = (value, name) => {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${name} to be available`);
  }

  return value;
};

function makeSparseLowTailPoints() {
  const lowIndexes = new Set([
    80, 81, 82, 83, 84, 85, 86, 87, 88, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229
  ]);
  const lowElevations = [
    -20.5, -21.2, -22.5, -24, -28, -23.5, -22, -21, -20, -20.2, -21.5, -22.4, -25, -27.5, -26, -23,
    -22.5, -21, -20.4
  ];
  let lowIndex = 0;

  return Array.from({ length: 420 }, (_, index) => {
    const baseElevation = 108 + Math.sin(index / 18) * 3 + (index / 420) * 4;
    const elevation = lowIndexes.has(index) ? lowElevations[lowIndex++] : baseElevation;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

function makeBroadReliefSparseLowTailPoints() {
  const lowIndexes = new Set([
    110, 111, 112, 113, 114, 115, 116, 117, 118, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369
  ]);
  const lowElevations = [
    -20.3, -21.6, -22.5, -24.2, -28.1, -25.4, -23.1, -21.8, -20.7, -20.1, -21.3, -22.4, -24.9,
    -28.4, -26.1, -23.7, -22.5, -21.2, -20.5
  ];
  let lowIndex = 0;

  return Array.from({ length: 560 }, (_, index) => {
    const wave = (Math.sin(index / 27) + 1) / 2;
    const trend = (index % 140) / 140;
    const baseElevation = 10 + wave * 52 + trend * 18;
    const elevation = lowIndexes.has(index) ? lowElevations[lowIndex++] : baseElevation;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

function makeBroadReliefSparseLowTailWithShouldersPoints() {
  const lowIndexes = new Set([
    120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 650, 651,
    652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666
  ]);
  const lowElevations = [
    -8.4, -10.2, -12.6, -15.4, -22.5, -25.2, -28.1, -23.8, -18.5, -14.9, -11.8, -9.3, -8.7, -10.6,
    -13.2, -15.3, -12.1, -8.2, -10.5, -12.4, -15.5, -22.2, -24.9, -28.4, -25.8, -20.6, -15.1, -12.7,
    -10.1, -8.9, -9.6, -12.2, -15.4, -13.5
  ];
  let lowIndex = 0;

  return Array.from({ length: 1000 }, (_, index) => {
    const wave = (Math.sin(index / 39) + 1) / 2;
    const ramp = (index % 180) / 180;
    const baseElevation = 10 + wave * 45 + ramp * 25;
    const elevation = lowIndexes.has(index) ? lowElevations[lowIndex++] : baseElevation;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

function makeSparseLowBasinWithSupportedRimPoints() {
  const basinElevations = [
    22, 20, 18, 14, 8, 2, -4, -12, -22.5, -28.4, -23, -14, -6, 2, 9, 15, 19, 21
  ];
  const basinStart = 190;

  return Array.from({ length: 720 }, (_, index) => {
    const baseElevation = 24 + Math.sin(index / 33) * 4 + (index / 720) * 12;
    const basinIndex = index - basinStart;
    const elevation =
      basinIndex >= 0 && basinIndex < basinElevations.length
        ? basinElevations[basinIndex]
        : baseElevation;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

function makeWideLowShoulderWithSparseNegativeCorePoints() {
  const shoulderStart = 360;
  const shoulderEnd = 430;
  const negativeCoreStart = 392;
  const negativeCoreEnd = 398;

  return Array.from({ length: 1000 }, (_item, index) => {
    const isShoulder = index >= shoulderStart && index < shoulderEnd;
    const isNegativeCore = index >= negativeCoreStart && index < negativeCoreEnd;
    const elevation = isNegativeCore
      ? -28 + Math.sin(index) * 0.4
      : isShoulder
        ? 2 + Math.sin(index / 3) * 0.3
        : 22 + Math.sin(index / 31) * 2;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

function makeSplitRunSparseLowRegimePoints() {
  return Array.from({ length: 1000 }, (_, index) => {
    const isSecondRun = index >= 800;
    const isLowRegime = index >= 900 && index < 950;
    const elevation = isLowRegime ? 3 + Math.sin(index / 3) * 2 : 32 + Math.sin(index / 25) * 3;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005,
      segmentIndex: isSecondRun ? 1 : 0
    });
  });
}

function makeShortPositiveLowRegimePoints() {
  return Array.from({ length: 1000 }, (_, index) => {
    const isLowRegime = index >= 420 && index < 460;
    const elevation = isLowRegime ? 2 + Math.sin(index / 3) * 0.5 : 39 + Math.sin(index / 25) * 2;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

function makeTimeGapHighSettlingTailPoints() {
  const breakIndex = 100;
  const highTailElevations = [
    160.8, 161.17, 161.69, 161.08, 157.37, 153.16, 148.98, 144.87, 141.04, 137.43, 133.83, 130.4,
    127.16, 123.99, 118.24, 113.09, 108.12, 103.94, 99.77, 95.73, 91.92, 88.5, 86.87, 82.19, 82.31,
    79.19, 76.07, 72.77, 69.49, 65.55, 62.44
  ];

  return Array.from({ length: 1200 }, (_, index) => {
    const isBeforeGap = index < breakIndex;
    const tailIndex = index - breakIndex;
    const isHighTail = tailIndex >= 0 && tailIndex < highTailElevations.length;
    const stableElevation = isBeforeGap ? 44 + Math.sin(index / 12) : 50 + Math.sin(index / 19) * 6;
    const elevation = isHighTail ? highTailElevations[tailIndex] : stableElevation;
    const latitude = isBeforeGap
      ? 55 + index * 0.0001
      : 55 + breakIndex * 0.0001 + Math.max(0, tailIndex) * 0.000001;

    return timedPoint(index, elevation, {
      latitude,
      timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, 0) + index * 10_000)
    });
  });
}

function makeSparseLowTailBeforePostGapSettlingAnchorPoints() {
  const candidateStart = 120;
  const candidateEnd = 127;
  const postGapAnchorIndex = candidateEnd + 1;
  const baseTime = Date.UTC(2024, 4, 25, 8, 0, 0);
  const negativeTailElevations = [-20.5, -21.6, -22.5, -24.2, -28.1, -25.4, -23.1, -20.7];
  const settlingElevations = [27.05, 23, 20, 17, 14, 13.2, 13.4];

  return Array.from({ length: 220 }, (_, index) => {
    const isCandidate = index >= candidateStart && index <= candidateEnd;
    const settlingIndex = index - postGapAnchorIndex;
    const isSettling = settlingIndex >= 0 && settlingIndex < settlingElevations.length;
    const distanceMeters =
      index <= candidateEnd
        ? index * 50
        : isSettling
          ? candidateEnd * 50 + 50 + settlingIndex * 2
          : candidateEnd * 50 + 50 + settlingElevations.length * 2 + (index - 135) * 50;
    const elevation = isCandidate
      ? negativeTailElevations[index - candidateStart]
      : isSettling
        ? settlingElevations[settlingIndex]
        : index < candidateStart
          ? 21.25 + Math.sin(index / 14) * 0.4
          : 14.2 + Math.sin(index / 11) * 0.5;
    const timestamp =
      index >= postGapAnchorIndex
        ? new Date(baseTime + index * 10_000 + 12 * 60 * 60 * 1000)
        : new Date(baseTime + index * 10_000);

    return timedPoint(index, elevation, {
      latitude: 55 + distanceMeters / 111_320,
      timestamp
    });
  });
}

function makeSparseLowTailBeforePostGapRampAnchorPoints() {
  const candidateStart = 120;
  const candidateEnd = 127;
  const postGapAnchorIndex = candidateEnd + 1;
  const baseTime = Date.UTC(2024, 4, 25, 8, 0, 0);
  const negativeTailElevations = [-20.5, -21.6, -22.5, -24.2, -28.1, -25.4, -23.1, -20.7];
  const rampElevations = [27, 23, 19, 15, 11, 7, 3];

  return Array.from({ length: 220 }, (_, index) => {
    const isCandidate = index >= candidateStart && index <= candidateEnd;
    const rampIndex = index - postGapAnchorIndex;
    const isRamp = rampIndex >= 0 && rampIndex < rampElevations.length;
    const distanceMeters =
      index <= candidateEnd
        ? index * 50
        : isRamp
          ? candidateEnd * 50 + 50 + rampIndex * 2
          : candidateEnd * 50 + 50 + rampElevations.length * 2 + (index - 135) * 50;
    const elevation = isCandidate
      ? negativeTailElevations[index - candidateStart]
      : isRamp
        ? rampElevations[rampIndex]
        : index < candidateStart
          ? 21.25 + Math.sin(index / 14) * 0.4
          : 3.5 + Math.sin(index / 11) * 0.5;
    const timestamp =
      index >= postGapAnchorIndex
        ? new Date(baseTime + index * 10_000 + 12 * 60 * 60 * 1000)
        : new Date(baseTime + index * 10_000);

    return timedPoint(index, elevation, {
      latitude: 55 + distanceMeters / 111_320,
      timestamp
    });
  });
}

function makeCrossTailDuplicateSettlingAnchorPoints() {
  const breakIndex = 4;
  const baseTime = Date.UTC(2024, 4, 25, 8, 0, 0);
  const prefixElevations = [160, 152, 144, 136, -22.5, -8, 2, 10, 13.8, 13.2, 13.4];

  return Array.from({ length: 240 }, (_, index) => {
    const isPrefix = index < prefixElevations.length;
    const distanceMeters = isPrefix ? index * 2 : prefixElevations.length * 2 + index * 50;
    const elevation = isPrefix ? prefixElevations[index] : 30 + Math.sin(index / 9) * 2;
    const timestamp =
      index >= breakIndex
        ? new Date(baseTime + index * 10_000 + 12 * 60 * 60 * 1000)
        : new Date(baseTime + index * 10_000);

    return timedPoint(index, elevation, {
      latitude: 55 + distanceMeters / 111_320,
      timestamp
    });
  });
}

function makePlausibleBoundaryHighReliefPoints() {
  const breakIndex = 100;

  return Array.from({ length: 1000 }, (_, index) => {
    const isBeforeGap = index < breakIndex;
    const isHighStart = index >= breakIndex && index < breakIndex + 20;
    const elevation = isHighStart ? 145 - (index - breakIndex) * 2 : 42 + Math.sin(index / 23) * 3;
    const latitude = isBeforeGap
      ? 55 + index * 0.0001
      : 55 + breakIndex * 0.0001 + (index - breakIndex) * 0.001;

    return timedPoint(index, elevation, {
      latitude,
      timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, 0) + index * 10_000)
    });
  });
}

function makeBoundaryAndInteriorSparseLowTailPoints() {
  const lowIndexes = new Set([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269
  ]);
  const lowElevations = [
    -20.4, -21.3, -22.5, -24.1, -28.2, -24.5, -22.8, -21.4, -20.2, -20.1, -21.2, -22.4, -24.8,
    -28.4, -26.2, -23.5, -22.1, -21.3, -20.4
  ];
  let lowIndex = 0;

  return Array.from({ length: 560 }, (_, index) => {
    const wave = (Math.sin(index / 31) + 1) / 2;
    const baseElevation = 42 + wave * 16 + (index / 560) * 8;
    const elevation = lowIndexes.has(index) ? lowElevations[lowIndex++] : baseElevation;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

function makeSupportedLowSegmentPoints() {
  return Array.from({ length: 160 }, (_, index) => {
    const isLowSegment = index >= 55 && index < 105;
    const elevation = isLowSegment ? -8 + Math.sin(index / 4) * 2 : 42 + Math.sin(index / 9) * 3;

    return timedPoint(index, elevation, {
      latitude: 55 + index * 0.00005
    });
  });
}

describe("getElevationStats", () => {
  it("returns model diagnostics and filtered extrema with raw extrema preserved", () => {
    const points = [100, 101, 102, 180, 103, 104, 105].map((elevation, index) =>
      timedPoint(index, elevation)
    );

    const result = getElevationStats(points);

    expect(result.diagnostics.modelVersion).toBe(1);
    expect(result.diagnostics.decisionTrace.map((entry) => entry.stage)).toEqual([
      "activity",
      "source",
      "fusion",
      "gain_loss"
    ]);
    expect(result.maxElevationMeters).toBeLessThan(120);
    expect(result.maxElevationMetersRaw).toBe(180);
    expect(result.minElevationMetersRaw).toBe(100);
  });

  it.each([
    {
      label: "segment breaks",
      points: [
        timedPoint(0, 100, { segmentIndex: 0 }),
        timedPoint(1, 1000, { segmentIndex: 1 }),
        timedPoint(2, 100, { segmentIndex: 2 })
      ],
      options: {}
    },
    {
      label: "source switches",
      points: [
        timedPoint(0, 100, { elevationSource: "gpx" }),
        timedPoint(1, 1000, { elevationSource: "barometric" }),
        timedPoint(2, 100, { elevationSource: "gpx" })
      ],
      options: {}
    },
    {
      label: "declared time gaps",
      points: [100, 1000, 100].map((elevation, index) => timedPoint(index, elevation)),
      options: { timeGapBreakIndexes: new Set([1, 2]) }
    },
    {
      label: "missing elevations",
      points: [
        timedPoint(0, 100),
        timedPoint(1, null),
        timedPoint(2, 1000),
        timedPoint(3, null),
        timedPoint(4, 100)
      ],
      options: {}
    }
  ])("preserves isolated extrema separated by $label", ({ points, options }) => {
    const result = getElevationStats(points, options);

    expect(result.maxElevationMeters).toBe(1000);
    expect(result.maxElevationMetersRaw).toBe(1000);
    expect(result.diagnostics.fusion.continuousRunCount).toBe(3);
  });

  it("keeps clamping a genuine isolated interior spike in one continuous run", () => {
    const result = getElevationStats(
      [100, 101, 102, 1000, 103, 104, 105].map((elevation, index) => timedPoint(index, elevation))
    );

    expect(result.diagnostics.fusion.continuousRunCount).toBe(1);
    expect(result.maxElevationMeters).toBeLessThan(120);
    expect(result.maxElevationMetersRaw).toBe(1000);
  });

  it("keeps a spaced three-point raw spike out of visible extrema", () => {
    const result = getElevationStats(
      [100, 1000, 100].map((elevation, index) =>
        timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
      )
    );
    const chartMax = Math.max(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.maxElevationMeters).toBeLessThan(200);
    expect(chartMax).toBeLessThan(200);
    expect(result.maxElevationMetersRaw).toBe(1000);
  });

  it("keeps a supported short hill visible with a trailing neighbor", () => {
    const result = getElevationStats(
      [100, 150, 100, 100].map((elevation, index) =>
        timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
      )
    );
    const chartMax = Math.max(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.elevationGainMeters).toBeGreaterThan(0);
    expect(result.elevationLossMeters).toBeGreaterThan(0);
    expect(result.maxElevationMeters).toBeGreaterThan(100);
    expect(chartMax).toBeGreaterThan(100);
  });

  it("keeps clamping a spaced isolated interior spike even when gain/loss confirms it", () => {
    const result = getElevationStats(
      [100, 101, 102, 1000, 103, 104, 105].map((elevation, index) =>
        timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
      )
    );
    const chartMax = Math.max(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.elevationGainMeters).toBeGreaterThan(0);
    expect(result.diagnostics.fusion.continuousRunCount).toBe(1);
    expect(result.maxElevationMeters).toBeLessThan(120);
    expect(chartMax).toBeLessThan(120);
    expect(result.maxElevationMetersRaw).toBe(1000);
  });

  it("removes a spaced isolated interior drop before counting gain or loss", () => {
    const result = getElevationStats(
      [100, 100, 100, -22.5, 100, 100, 100].map((elevation, index) =>
        timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
      )
    );
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMeters).toBeGreaterThan(90);
    expect(chartMin).toBeGreaterThan(90);
    expect(result.minElevationMetersRaw).toBe(-22.5);
    expect(result.elevationGainMeters).toBeLessThan(10);
    expect(result.elevationLossMeters).toBeLessThan(10);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_interior_outliers_replaced");
    expect(result.diagnostics.fusion.flags).not.toContain("endpoint_spikes_replaced");
    expect(result.diagnostics.fusion.endpointSpikeReplacementCount).toBe(0);
    expect(result.diagnostics.fusion.preResampleEndpointSpikeReplacementCount).toBe(0);
    expect(result.diagnostics.fusion.endpointSpikeReplacementSourceIndexes).toEqual([]);
    expect(result.diagnostics.fusion.preResampleInteriorOutlierReplacementCount).toBe(1);
    expect(
      (result.diagnostics.confidence.penalties ?? []).map((penalty) => penalty.code)
    ).not.toEqual(
      expect.arrayContaining(["endpoint_spike_replaced", "many_endpoint_spikes_replaced"])
    );
  });

  it("removes unsupported sparse low-tail clusters before visible extrema and gain/loss", () => {
    const points = makeSparseLowTailPoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBe(-28);
    expect(result.minElevationMeters).toBeGreaterThan(90);
    expect(chartMin).toBeGreaterThan(90);
    expect(result.elevationGainMeters).toBeLessThan(30);
    expect(result.elevationLossMeters).toBeLessThan(30);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(result.diagnostics.fusion.flags).not.toContain(
      "pre_resample_interior_outliers_replaced"
    );
    expect(result.diagnostics.fusion.preResampleInteriorOutlierReplacementCount).toBe(0);
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementCount).toBe(19);
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes).toEqual([
      80, 81, 82, 83, 84, 85, 86, 87, 88, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229
    ]);
  });

  it("removes unsupported sparse low-tail clusters from a broad-relief route", () => {
    const points = makeBroadReliefSparseLowTailPoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBe(-28.4);
    expect(result.minElevationMeters).toBeGreaterThan(5);
    expect(chartMin).toBeGreaterThan(5);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementCount).toBe(19);
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes).toEqual([
      110, 111, 112, 113, 114, 115, 116, 117, 118, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369
    ]);
  });

  it("removes unsupported sparse low-tail shoulders from a broad-relief route", () => {
    const points = makeBroadReliefSparseLowTailWithShouldersPoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBe(-28.4);
    expect(result.minElevationMeters).toBeGreaterThan(5);
    expect(chartMin).toBeGreaterThan(5);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementCount).toBe(34);
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes).toEqual([
      120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 650, 651,
      652, 653, 654, 655, 656, 657, 658, 659, 660, 661, 662, 663, 664, 665, 666
    ]);
  });

  it("expands an unsupported sparse low-tail basin to supported rim elevations", () => {
    const points = makeSparseLowBasinWithSupportedRimPoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBe(-28.4);
    expect(result.minElevationMeters).toBeGreaterThan(18);
    expect(chartMin).toBeGreaterThan(18);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes).toEqual(
      expect.arrayContaining([192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204])
    );
  });

  it("removes a sparse negative core when low-basin expansion is too broad", () => {
    const points = makeWideLowShoulderWithSparseNegativeCorePoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBeLessThan(-27);
    expect(result.minElevationMeters).toBeGreaterThan(0);
    expect(result.minElevationMeters).toBeLessThan(5);
    expect(chartMin).toBeGreaterThan(0);
    expect(chartMin).toBeLessThan(5);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementCount).toBe(6);
  });

  it("preserves supported low regimes inside a split run", () => {
    const points = makeSplitRunSparseLowRegimePoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBeLessThan(2);
    expect(result.minElevationMeters).toBeLessThan(5);
    expect(chartMin).toBeLessThan(5);
    expect(result.diagnostics.fusion.flags).not.toContain("pre_resample_sparse_tail_replaced");
  });

  it("preserves a short positive low regime around sea level", () => {
    const points = makeShortPositiveLowRegimePoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBeLessThan(3);
    expect(result.minElevationMeters).toBeLessThan(5);
    expect(chartMin).toBeLessThan(5);
    expect(result.diagnostics.fusion.flags).not.toContain("pre_resample_sparse_tail_replaced");
  });

  it("removes an unsupported sparse high-tail settling run after a time gap", () => {
    const points = makeTimeGapHighSettlingTailPoints();
    const result = getElevationStats(points, { timeGapBreakIndexes: new Set([100]) });
    const chartMax = Math.max(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.maxElevationMetersRaw).toBe(161.69);
    expect(result.maxElevationMeters).toBeLessThan(70);
    expect(chartMax).toBeLessThan(70);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
  });

  it("does not anchor sparse low-tail replacement to the first elevated post-gap settling sample", () => {
    const points = makeSparseLowTailBeforePostGapSettlingAnchorPoints();
    const result = getElevationStats(points);
    const replacedTailSamples = result.elevationSeries.filter(
      (sample) =>
        sample.distanceFromStartMeters >= 120 * 50 && sample.distanceFromStartMeters <= 127 * 50
    );

    expect(result.minElevationMetersRaw).toBe(-28.1);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes).toEqual([
      120, 121, 122, 123, 124, 125, 126, 127, 128
    ]);
    expect(replacedTailSamples.length).toBeGreaterThan(2);
    expect(replacedTailSamples.at(-1)?.elevation).toBeLessThanOrEqual(
      replacedTailSamples[0].elevation
    );
  });

  it("removes the unstable post-gap settling anchor after sparse low-tail cleanup", () => {
    const points = makeSparseLowTailBeforePostGapSettlingAnchorPoints();
    const result = getElevationStats(points);
    const postGapSamples = result.elevationSeries.filter(
      (sample) =>
        sample.distanceFromStartMeters > 127 * 50 && sample.distanceFromStartMeters <= 127 * 50 + 80
    );
    const settledSamples = result.elevationSeries.filter(
      (sample) =>
        sample.distanceFromStartMeters >= 127 * 50 + 60 &&
        sample.distanceFromStartMeters <= 127 * 50 + 120
    );
    const postGapMax = Math.max(...postGapSamples.map((sample) => sample.elevation));
    const settledMax = Math.max(...settledSamples.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBe(-28.1);
    expect(result.maxElevationMetersRaw).toBe(27.05);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(postGapSamples.length).toBeGreaterThan(2);
    expect(postGapMax).toBeLessThan(18);
    expect(postGapMax).toBeLessThanOrEqual(settledMax + 4);
  });

  it("does not skip a sparse low-tail anchor when post-gap samples keep ramping", () => {
    const points = makeSparseLowTailBeforePostGapRampAnchorPoints();
    const result = getElevationStats(points);
    const replacedTailSamples = result.elevationSeries.filter(
      (sample) =>
        sample.distanceFromStartMeters >= 120 * 50 && sample.distanceFromStartMeters <= 127 * 50
    );

    expect(result.minElevationMetersRaw).toBe(-28.1);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(replacedTailSamples.length).toBeGreaterThan(2);
    expect(replacedTailSamples.at(-1)?.elevation).toBeGreaterThan(replacedTailSamples[0].elevation);
  });

  it("reports each sparse-tail replacement source index once across tail passes", () => {
    const result = getElevationStats(makeCrossTailDuplicateSettlingAnchorPoints());
    const indexes = result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes;

    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(indexes).toEqual([...new Set(indexes)]);
  });

  it("preserves plausible sparse high relief at a run boundary", () => {
    const points = makePlausibleBoundaryHighReliefPoints();
    const result = getElevationStats(points, { timeGapBreakIndexes: new Set([100]) });

    expect(result.maxElevationMetersRaw).toBe(145);
    expect(result.maxElevationMeters).toBeGreaterThan(120);
    expect(result.diagnostics.fusion.flags).not.toContain("pre_resample_sparse_tail_replaced");
  });

  it("removes unsupported sparse low-tail clusters at run boundaries and interiors", () => {
    const points = makeBoundaryAndInteriorSparseLowTailPoints();
    const result = getElevationStats(points);
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMetersRaw).toBe(-28.4);
    expect(result.minElevationMeters).toBeGreaterThan(35);
    expect(chartMin).toBeGreaterThan(35);
    expect(result.diagnostics.fusion.flags).toContain("pre_resample_sparse_tail_replaced");
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementCount).toBe(19);
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269
    ]);
  });

  it("preserves a supported low segment with meaningful sample and distance share", () => {
    const result = getElevationStats(makeSupportedLowSegmentPoints());
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.minElevationMeters).toBeLessThan(0);
    expect(chartMin).toBeLessThan(0);
    expect(result.minElevationMetersRaw).toBeLessThan(0);
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementCount).toBe(0);
    expect(result.diagnostics.fusion.preResampleSparseTailReplacementSourceIndexes).toEqual([]);
    expect(result.diagnostics.fusion.flags).not.toContain("pre_resample_sparse_tail_replaced");
  });

  it("keeps visible extrema and chart aligned with confirmed gain on a short hill", () => {
    const result = getElevationStats(
      [100, 150, 100].map((elevation, index) =>
        timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
      )
    );
    const chartMax = Math.max(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.elevationGainMeters).toBeGreaterThan(0);
    expect(result.elevationLossMeters).toBeGreaterThan(0);
    expect(result.maxElevationMeters).toBeGreaterThan(100);
    expect(chartMax).toBe(result.maxElevationMeters);
  });

  it("keeps visible extrema and chart aligned with confirmed loss on a short trough", () => {
    const result = getElevationStats(
      [150, 100, 150].map((elevation, index) =>
        timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
      )
    );
    const chartMin = Math.min(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.elevationGainMeters).toBeGreaterThan(0);
    expect(result.elevationLossMeters).toBeGreaterThan(0);
    expect(result.minElevationMeters).toBeLessThan(150);
    expect(chartMin).toBeLessThan(150);
  });

  it("keeps a real confirmed hill visible when another run has an isolated spike", () => {
    const spikeRun = [100, 101, 102, 1000, 103, 104, 105].map((elevation, index) =>
      timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
    );
    const hillRun = [200, 250, 200].map((elevation, index) =>
      timedPoint(index + 8, elevation, {
        latitude: 55 + (index + 8) * 0.001,
        segmentIndex: 1
      })
    );
    const result = getElevationStats([...spikeRun, timedPoint(7, null), ...hillRun]);
    const chartMax = Math.max(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.elevationGainMeters).toBeGreaterThan(0);
    expect(result.diagnostics.fusion.continuousRunCount).toBe(2);
    expect(result.maxElevationMeters).toBeGreaterThan(200);
    expect(result.maxElevationMeters).toBeLessThan(300);
    expect(chartMax).toBe(result.maxElevationMeters);
    expect(result.maxElevationMetersRaw).toBe(1000);
  });

  it("keeps visible extrema confirmed exactly at the sustained-distance threshold", () => {
    const result = getElevationStats(
      [100, 150, 100].map((elevation, index) =>
        timedPoint(index, elevation, { latitude: 55 + index * 0.00018 })
      )
    );
    const chartMax = Math.max(...result.elevationSeries.map((sample) => sample.elevation));

    expect(result.elevationGainMeters).toBeGreaterThan(0);
    expect(result.diagnostics.gainModel.minSustainedDistanceMeters).toBe(20);
    expect(result.maxElevationMeters).toBeGreaterThan(100);
    expect(chartMax).toBe(result.maxElevationMeters);
  });

  it("keeps display distance separate from gain and loss confirmation", () => {
    const points = [100, 150, 100].map((elevation, index) =>
      timedPoint(index, elevation, { latitude: 55 + index * 0.001 })
    );
    const baseline = getElevationStats(points);
    const compressedDisplay = getElevationStats(points, {
      distanceFromStartMeters: [0, 0, 0]
    });

    expect(compressedDisplay.elevationGainMeters).toBeCloseTo(
      requireValue(baseline.elevationGainMeters, "baseline gain")
    );
    expect(compressedDisplay.elevationLossMeters).toBeCloseTo(
      requireValue(baseline.elevationLossMeters, "baseline loss")
    );
    expect(compressedDisplay.elevationSeries.at(-1)?.distanceFromStartMeters).toBe(0);
  });

  it("keeps subthreshold declared time gaps connected for raw envelope clamping", () => {
    const points = [100, 150, 100].map((elevation, index) => timedPoint(index, elevation));

    const result = getElevationStats(points, {
      timeGapBreakIndexes: new Set([1, 2])
    });

    expect(result.diagnostics.fusion.continuousRunCount).toBe(1);
    expect(result.maxElevationMeters).toBeLessThanOrEqual(100);
    expect(result.maxElevationMetersRaw).toBe(150);
  });

  it("keeps similar gain/loss for the same shape at different sampling density", () => {
    const sparse = getElevationStats(makeShapePoints([100, 130, 110, 150, 120]));
    const dense = getElevationStats(makeShapePoints([100, 130, 110, 150, 120], 8));

    expect(sparse.elevationGainMeters).not.toBeNull();
    expect(sparse.elevationLossMeters).not.toBeNull();
    expect(dense.elevationGainMeters).not.toBeNull();
    expect(dense.elevationLossMeters).not.toBeNull();

    if (
      sparse.elevationGainMeters === null ||
      sparse.elevationLossMeters === null ||
      dense.elevationGainMeters === null ||
      dense.elevationLossMeters === null
    ) {
      throw new Error("Expected elevation totals to be available");
    }

    expect(dense.elevationGainMeters).toBeCloseTo(sparse.elevationGainMeters, 0);
    expect(dense.elevationLossMeters).toBeCloseTo(sparse.elevationLossMeters, 0);
  });

  it("adds confidence levels and source trust values to diagnostics", () => {
    const points = makeShapePoints([100, 130, 110, 150, 120]);

    const result = getElevationStats(points);

    expect(result.diagnostics.confidence).toMatchObject({
      overall: expect.any(Number),
      gain: expect.any(Number),
      loss: expect.any(Number),
      extrema: expect.any(Number),
      level: expect.stringMatching(/^(high|medium|low)$/)
    });
    expect(result.diagnostics.fusion.cleanup).toMatchObject({
      method: "hampel_mad",
      outliersRemovedPct: result.diagnostics.fusion.outliersRemovedPct
    });
    expect(result.diagnostics.fusion.noise).toMatchObject({
      medianSigmaAfterCleanupMeters: expect.any(Number),
      p95SigmaAfterCleanupMeters: expect.any(Number),
      medianSigmaAfterSmoothingMeters: expect.any(Number),
      p95SigmaAfterSmoothingMeters: expect.any(Number)
    });

    expect(
      result.diagnostics.decisionTrace.find((entry) => entry.stage === "source")
    ).toMatchObject({
      primaryAbsoluteSource: expect.anything(),
      primaryRelativeSource: expect.anything(),
      trusts: expect.any(Object)
    });

    expect(
      result.diagnostics.decisionTrace.find((entry) => entry.stage === "activity")
    ).toMatchObject({
      activityCandidates: expect.any(Array)
    });
    expect(
      result.diagnostics.decisionTrace.find((entry) => entry.stage === "fusion")
    ).toMatchObject({
      resampleStepMeters: result.diagnostics.fusion.resampleStepMeters,
      cleanup: {
        outliersRemovedPct: result.diagnostics.fusion.outliersRemovedPct
      },
      noise: result.diagnostics.fusion.noise
    });
  });

  it("does not count gain across fused continuity breaks", () => {
    const points = [
      timedPoint(0, 100, { segmentIndex: 0 }),
      timedPoint(1, 105, { segmentIndex: 0 }),
      timedPoint(2, null, { segmentIndex: 0 }),
      timedPoint(3, 205, { segmentIndex: 1 }),
      timedPoint(4, 210, { segmentIndex: 1 })
    ];

    const result = getElevationStats(points);

    expect(result.elevationGainMeters).toBeLessThan(25);
    expect(result.diagnostics.fusion.continuousRunCount).toBeGreaterThan(1);
    expect(result.diagnostics.segmentation).toHaveLength(2);
    expect(
      result.diagnostics.decisionTrace.find((entry) => entry.stage === "fusion")
    ).toMatchObject({
      continuousRunCount: 2
    });
  });

  it("does not count gain or net change across declared time gap breaks", () => {
    const points = [100, 200, 205].map((elevation, index) => timedPoint(index, elevation));

    const result = getElevationStats(points, {
      timeGapBreakIndexes: new Set([1])
    });

    expect(result.elevationGainMeters).toBeLessThan(10);
    expect(result.elevationLossMeters).toBeCloseTo(0, 1);
    expect(result.netElevationChangeMeters).toBeCloseTo(5, 1);
    expect(result.diagnostics.fusion.continuousRunCount).toBe(2);
    expect(result.diagnostics.segmentation).toHaveLength(2);
    expect(
      result.diagnostics.decisionTrace.find((entry) => entry.stage === "fusion")
    ).toMatchObject({
      continuousRunCount: 2
    });
  });

  it("keeps plausible elevation changes across paused route gaps", () => {
    const points = [100, 130, 110, 150, 120].map((elevation, index) =>
      timedPoint(index, elevation, {
        latitude: 55 + index * 0.0008
      })
    );

    const result = getElevationStats(points, {
      timeGapBreakIndexes: new Set([1, 2, 3, 4])
    });

    expect(result.diagnostics.fusion.continuousRunCount).toBe(1);
    expect(result.elevationGainMeters).toBeGreaterThan(60);
    expect(result.elevationLossMeters).toBeGreaterThan(40);
  });

  it("raises the gain threshold for low-relief noisy GPS chatter", () => {
    const points = Array.from({ length: 360 }, (_item, index) => {
      const trend = 40 + Math.sin(index / 45) * 18;
      const chatter = index % 2 === 0 ? 2.4 : -2.4;
      return timedPoint(index, trend + chatter, {
        elevationSource: "gpx",
        latitude: 55 + index * 0.00022,
        timestamp: new Date(Date.UTC(2024, 4, 25, 8, 0, 0) + index * 8_000)
      });
    });

    const result = getElevationStats(points);

    expect(result.diagnostics.activityAssessment?.inferred).toBe("bike");
    expect(result.diagnostics.sourceAssessment?.assessments.gpx.reasonCodes).toContain(
      "gps_vertical_noise"
    );
    expect(result.diagnostics.gainModel.baseThresholdMeters).toBeGreaterThan(12);
  });

  it("removes endpoint spikes before resampling can turn them into slopes", () => {
    const highStart = getElevationStats(
      [180, 100, 101, 102].map((elevation, index) => timedPoint(index, elevation))
    );
    const lowStart = getElevationStats(
      [20, 100, 101, 102].map((elevation, index) => timedPoint(index, elevation))
    );
    const highEnd = getElevationStats(
      [100, 101, 102, 180].map((elevation, index) => timedPoint(index, elevation))
    );
    const lowEnd = getElevationStats(
      [100, 101, 102, 20].map((elevation, index) => timedPoint(index, elevation))
    );

    expect(highStart.maxElevationMeters).toBeLessThan(120);
    expect(highStart.elevationLossMeters).toBeLessThan(10);
    expect(highStart.diagnostics.fusion.flags).toContain("endpoint_spikes_replaced");
    expect(highStart.diagnostics.fusion.endpointSpikeReplacementCount).toBeGreaterThanOrEqual(1);

    expect(lowStart.minElevationMeters).toBeGreaterThan(90);
    expect(lowStart.elevationGainMeters).toBeLessThan(10);
    expect(lowStart.diagnostics.fusion.flags).toContain("endpoint_spikes_replaced");
    expect(lowStart.diagnostics.fusion.endpointSpikeReplacementCount).toBeGreaterThanOrEqual(1);

    expect(highEnd.maxElevationMeters).toBeLessThan(120);
    expect(highEnd.elevationGainMeters).toBeLessThan(10);
    expect(highEnd.diagnostics.fusion.flags).toContain("endpoint_spikes_replaced");

    expect(lowEnd.minElevationMeters).toBeGreaterThan(90);
    expect(lowEnd.elevationLossMeters).toBeLessThan(10);
    expect(lowEnd.diagnostics.fusion.flags).toContain("endpoint_spikes_replaced");
  });

  it("removes short-run endpoint spikes instead of counting them as gain or loss", () => {
    const cases = [
      { elevations: [180, 100, 101], gainMax: 10, lossMax: 10, min: 90, max: 120 },
      { elevations: [20, 100, 101], gainMax: 10, lossMax: 10, min: 90, max: 120 },
      { elevations: [100, 101, 180], gainMax: 10, lossMax: 10, min: 90, max: 120 },
      { elevations: [100, 101, 20], gainMax: 10, lossMax: 10, min: 90, max: 120 }
    ];

    for (const testCase of cases) {
      const result = getElevationStats(
        testCase.elevations.map((elevation, index) => timedPoint(index, elevation))
      );

      expect(result.elevationGainMeters).toBeLessThan(testCase.gainMax);
      expect(result.elevationLossMeters).toBeLessThan(testCase.lossMax);
      expect(result.minElevationMeters).toBeGreaterThan(testCase.min);
      expect(result.maxElevationMeters).toBeLessThan(testCase.max);
      expect(result.diagnostics.fusion.endpointSpikeReplacementCount).toBeGreaterThanOrEqual(1);
      expect(result.diagnostics.confidence.penalties).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "endpoint_spike_replaced" })])
      );
    }
  });

  it("does not score declared time-gap discontinuities as source noise", () => {
    const points = [100, 101, 102, 500, 501, 502].map((elevation, index) =>
      timedPoint(index, elevation, { elevationSource: "gpx" })
    );

    const result = getElevationStats(points, {
      timeGapBreakIndexes: new Set([3])
    });

    expect(result.diagnostics.fusion.continuousRunCount).toBe(2);
    expect(result.diagnostics.sourceAssessment?.assessments.gpx.reasonCodes).toContain(
      "gps_low_noise"
    );
    expect(result.diagnostics.sourceAssessment?.assessments.gpx.reasonCodes).not.toContain(
      "gps_vertical_noise"
    );
  });

  it("lowers confidence when elevation runs are fragmented by source switches", () => {
    const points = Array.from({ length: 12 }, (_item, index) =>
      timedPoint(index, 100 + index, {
        elevationSource: index % 2 === 0 ? "gpx" : "terrain"
      })
    );

    const result = getElevationStats(points);

    expect(result.diagnostics.confidence.penalties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "source_switch_fragmentation" }),
        expect.objectContaining({ code: "many_short_elevation_runs" })
      ])
    );
    expect(result.diagnostics.confidenceFlags).toEqual(
      expect.arrayContaining(["source_switch_fragmentation", "many_short_elevation_runs"])
    );
    expect(result.diagnostics.confidence.level).not.toBe("high");
  });

  it("returns model-compatible empty diagnostics for tracks without elevation", () => {
    const result = getElevationStats([
      timedPoint(0, null),
      timedPoint(1, undefined),
      timedPoint(2, Number.NaN)
    ]);

    expect(result).toMatchObject({
      elevationGainMeters: null,
      elevationLossMeters: null,
      minElevationMeters: null,
      maxElevationMeters: null,
      minElevationMetersRaw: null,
      maxElevationMetersRaw: null,
      diagnostics: {
        modelVersion: 1,
        decisionTrace: [],
        segmentation: [],
        confidence: {
          overall: 0,
          gain: 0,
          loss: 0,
          extrema: 0
        }
      }
    });
  });

  it("keeps raw elevation provenance in direct raw-mode empty diagnostics", () => {
    const result = getElevationStats(
      [timedPoint(0, null), timedPoint(1, undefined), timedPoint(2, Number.NaN)],
      { mode: "recomputed_raw" }
    );

    expect(result.diagnostics.filtersApplied).toEqual(["raw_elevation"]);
    expect(result.diagnostics.fusion.cleanup).toMatchObject({
      endpointSpikeReplacementCount: 0
    });
  });

  it("includes selected actual median and p95 thresholds in thresholdSweep", () => {
    const result = getElevationStats(makeShapePoints([100, 130, 110, 150, 120], 4));

    expect(result.diagnostics.thresholdSweep).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "selected_median_local_threshold",
          thresholdMeters: result.diagnostics.gainModel.medianThresholdMeters
        }),
        expect.objectContaining({
          kind: "selected_p95_local_threshold",
          thresholdMeters: result.diagnostics.gainModel.p95ThresholdMeters
        })
      ])
    );
  });
});
