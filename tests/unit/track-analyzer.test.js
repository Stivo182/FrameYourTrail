import { describe, expect, it } from "vitest";
import { haversineMeters } from "../../src/core/geo.js";
import { analyzeTrack } from "../../src/core/track-analyzer.js";

/**
 * @param {number} latitude
 * @param {number} longitude
 * @param {number | null} [elevation]
 * @param {Date | null} [timestamp]
 */
const point = (latitude, longitude, elevation = null, timestamp = null) => ({
  latitude,
  longitude,
  elevation,
  timestamp,
  segmentIndex: 0
});

const timedPoint = (latitude, longitude, elevation, secondsFromStart) =>
  point(latitude, longitude, elevation, new Date(Date.UTC(2024, 4, 25, 8, 0, secondsFromStart)));

const timedPointAtMeters = (distanceMeters, secondsFromStart) =>
  point(
    0,
    distanceMeters / 111319.49079327357,
    10,
    new Date(Date.UTC(2024, 4, 25, 8, 0, secondsFromStart))
  );

const timedPointAtOffsetMeters = (eastMeters, northMeters, secondsFromStart) =>
  point(
    northMeters / 111319.49079327357,
    eastMeters / 111319.49079327357,
    10,
    new Date(Date.UTC(2024, 4, 25, 8, 0, secondsFromStart))
  );

/**
 * @template T
 * @param {T | null | undefined} value
 * @param {string} name
 * @returns {T}
 */
const requireValue = (value, name) => {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${name} to be available`);
  }

  return value;
};

const barometricPoint = (latitude, longitude, elevation, secondsFromStart) => ({
  ...timedPoint(latitude, longitude, elevation, secondsFromStart),
  elevationSource: /** @type {const} */ ("barometric")
});

const noisyElevationSeries = (profile) => {
  const series = [profile[0]];

  for (let index = 1; index < profile.length; index += 1) {
    const elevation = profile[index];
    const noiseDirection = elevation >= profile[index - 1] ? -1 : 1;
    series.push(elevation);

    for (let noiseIndex = 0; noiseIndex < 5; noiseIndex += 1) {
      series.push(elevation + noiseDirection * 4.2);
      series.push(elevation);
    }
  }

  return series;
};

const moderateNoiseWithTailSpikes = (profile) => {
  const series = [profile[0]];
  const addNoise = (baseElevation) => {
    for (let index = 0; index < 100; index += 1) {
      series.push(baseElevation + 0.7, baseElevation);
    }

    for (let index = 0; index < 20; index += 1) {
      series.push(baseElevation + 1.8, baseElevation);
    }

    for (let index = 0; index < 10; index += 1) {
      series.push(baseElevation + 3.5, baseElevation);
    }

    series.push(
      baseElevation + 4.2,
      baseElevation + 8.4,
      baseElevation + 12.6,
      baseElevation + 8.4,
      baseElevation + 4.2,
      baseElevation
    );

    for (let index = 0; index < 2; index += 1) {
      series.push(baseElevation + 9.1, baseElevation);
    }
  };

  for (let index = 1; index < profile.length; index += 1) {
    series.push(profile[index]);
    addNoise(profile[index]);
  }

  return series;
};

const directionalDescentSeries = () => {
  const profile = [319.04, 259.65, 265.63, 259.66, 267.4, 181.38, 198.35, 159.5, 170.15];
  const indexes = [0, 51, 52, 54, 55, 296, 297, 542, 621];
  const series = [];

  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    const segmentPoints = indexes[profileIndex + 1] - indexes[profileIndex];

    for (let index = 0; index < segmentPoints; index += 1) {
      let elevation =
        profile[profileIndex] +
        ((profile[profileIndex + 1] - profile[profileIndex]) * index) / segmentPoints;

      if (index % 37 === 7) {
        elevation += 0.5;
      }

      if (index % 41 === 9) {
        elevation -= 0.5;
      }

      series.push(Number(elevation.toFixed(2)));
    }
  }

  series.push(profile.at(-1));
  return series;
};

const directionalDescentWithCounterSpike = () => {
  const series = [];

  for (let index = 0; index < 60; index += 1) {
    series.push(100 - (50 * index) / 59);
  }

  series.push(60);

  for (let index = 1; index <= 60; index += 1) {
    series.push(60 - (20 * index) / 60);
  }

  return series;
};

const compactLowReliefLoopSeries = (scale = 1) => {
  const anchors = [158.63, 153, 160, 144, 151, 161, 145, 154, 142, 150, 151.84];
  const indexes = [0, 40, 80, 120, 170, 220, 270, 320, 370, 420, 453];
  const series = [];

  for (let profileIndex = 0; profileIndex < anchors.length - 1; profileIndex += 1) {
    const segmentPoints = indexes[profileIndex + 1] - indexes[profileIndex];

    for (let index = 0; index < segmentPoints; index += 1) {
      const absoluteIndex = indexes[profileIndex] + index;
      let elevation =
        anchors[profileIndex] +
        ((anchors[profileIndex + 1] - anchors[profileIndex]) * index) / segmentPoints;
      elevation += Math.sin(absoluteIndex / 3) * 0.7;

      if (absoluteIndex % 53 === 5) {
        elevation += 3.5;
      }

      if (absoluteIndex % 71 === 9) {
        elevation -= 3;
      }

      series.push(Number(elevation.toFixed(2)));
    }
  }

  series.push(Number(anchors.at(-1)));
  const startElevation = Number(series[0]);
  return series.map((elevation) => startElevation + (elevation - startElevation) * scale);
};

const longLowNoiseRiverSeries = () => {
  const anchors = [62, 120, 70, 140, 80, 160, 90, 125, 70, 115, 60, 68, 18];
  const pointsPerSegment = 250;
  const series = [];

  for (let profileIndex = 0; profileIndex < anchors.length - 1; profileIndex += 1) {
    for (let index = 0; index < pointsPerSegment; index += 1) {
      const absoluteIndex = profileIndex * pointsPerSegment + index;
      let elevation =
        anchors[profileIndex] +
        ((anchors[profileIndex + 1] - anchors[profileIndex]) * index) / pointsPerSegment;
      elevation += Math.sin(absoluteIndex / 3) * 0.2;

      if (absoluteIndex % 97 === 11) {
        elevation += 1;
      }

      if (absoluteIndex % 89 === 19) {
        elevation -= 0.9;
      }

      series.push(Number(elevation.toFixed(2)));
    }
  }

  series.push(Number(anchors.at(-1)));
  return series;
};

const longLowReliefNoisyTouringSeries = () => {
  const anchors = [36, 124, -7];
  let currentElevation = -7;

  for (let index = 0; index < 25; index += 1) {
    currentElevation += 50;
    anchors.push(currentElevation);
    currentElevation -= 49;
    anchors.push(currentElevation);
  }

  currentElevation += 54;
  anchors.push(currentElevation);
  currentElevation -= 55;
  anchors.push(currentElevation);

  const pointsPerSegment = 250;
  const series = [];

  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
    const start = anchors[anchorIndex];
    const end = anchors[anchorIndex + 1];

    for (let index = 0; index < pointsPerSegment; index += 1) {
      const absoluteIndex = anchorIndex * pointsPerSegment + index;
      let elevation = start + ((end - start) * index) / pointsPerSegment;
      elevation += Math.sin(absoluteIndex / 2.7) * 2.6;

      if (absoluteIndex % 173 === 23) {
        elevation += 2.2;
      }

      if (absoluteIndex % 191 === 47) {
        elevation -= 2.1;
      }

      series.push(Number(elevation.toFixed(3)));
    }
  }

  series.push(Number(anchors.at(-1)));
  return series;
};

const noisyDirectionalDescentSeries = () => {
  const anchors = [920, 850, 780, 710, 640, 570, 500, 430, 360, 290];
  const pointsPerSegment = 50;
  const series = [];

  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
    const start = anchors[anchorIndex];
    const end = anchors[anchorIndex + 1];

    for (let index = 0; index < pointsPerSegment; index += 1) {
      const absoluteIndex = anchorIndex * pointsPerSegment + index;
      let elevation = start + ((end - start) * index) / pointsPerSegment;
      elevation += Math.sin(absoluteIndex / 2.5) * 0.5;

      if (absoluteIndex % 137 === 23) {
        elevation += 1.2;
      }

      if (absoluteIndex % 149 === 47) {
        elevation -= 1.1;
      }

      series.push(Number(elevation.toFixed(3)));
    }
  }

  series.push(Number(anchors.at(-1)));
  return series;
};

describe("haversineMeters", () => {
  it("returns zero for identical coordinates", () => {
    expect(haversineMeters(point(43.1, 42.1), point(43.1, 42.1))).toBe(0);
  });

  it("measures nearby coordinates in meters", () => {
    const distance = haversineMeters(point(43.1, 42.1), point(43.101, 42.102));

    expect(distance).toBeGreaterThan(190);
    expect(distance).toBeLessThan(210);
  });

  it("uses WGS84 ellipsoid distances at northern latitudes", () => {
    const distance = haversineMeters(point(58, 33), point(58.01, 33.01));

    expect(distance).toBeGreaterThan(1260);
    expect(distance).toBeLessThan(1262);
  });
});

describe("analyzeTrack", () => {
  it("does not pass large analyzer speed arrays to Math extrema", () => {
    const originalMax = Math.max;
    const originalMin = Math.min;
    const maxArgCounts = [];
    const minArgCounts = [];
    const points = Array.from({ length: 160 }, (_item, index) =>
      timedPoint(43.1 + index * 0.0001, 42.1, null, index * 10)
    );

    Math.max = function patchedMax(...args) {
      maxArgCounts.push(args.length);
      if (args.length > 8) {
        throw new Error(`Math.max spread budget exceeded with ${args.length} arguments`);
      }

      return originalMax.apply(this, args);
    };
    Math.min = function patchedMin(...args) {
      minArgCounts.push(args.length);
      if (args.length > 8) {
        throw new Error(`Math.min spread budget exceeded with ${args.length} arguments`);
      }

      return originalMin.apply(this, args);
    };

    try {
      const result = analyzeTrack(points);

      expect(result.diagnostics.sampling.intervalCount).toBeGreaterThan(128);
      expect(result.speedSeries.length).toBeGreaterThan(128);
      expect(result.minElevationMeters).toBeNull();
      expect(result.maxElevationMeters).toBeNull();
    } finally {
      Math.max = originalMax;
      Math.min = originalMin;
    }

    expect(maxArgCounts.every((count) => count <= 8)).toBe(true);
    expect(minArgCounts.every((count) => count <= 8)).toBe(true);
  });

  it("does not allocate large slices while smoothing speed samples", () => {
    const originalSlice = Array.prototype.slice;
    let largeSeriesSlices = 0;
    const points = Array.from({ length: 180 }, (_item, index) =>
      timedPoint(43.1 + index * 0.0001, 42.1, null, index * 10)
    );

    Array.prototype.slice = function patchedSlice(...args) {
      if (this.length >= 128) {
        largeSeriesSlices += 1;
      }

      return Reflect.apply(originalSlice, this, args);
    };

    try {
      const result = analyzeTrack(points);

      expect(result.speedSeries.length).toBeGreaterThan(128);
    } finally {
      Array.prototype.slice = originalSlice;
    }

    expect(largeSeriesSlices).toBe(0);
  });

  it("uses model source diagnostics for explicit barometric elevation", () => {
    const result = analyzeTrack([
      barometricPoint(55, 37, 100, 0),
      barometricPoint(55.0001, 37, 102.5, 60),
      barometricPoint(55.0002, 37, 100, 120)
    ]);

    expect(result.summary.elevationSource).toBe("barometric");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    const sourceAssessment = requireValue(
      result.diagnostics.elevation.sourceAssessment,
      "sourceAssessment"
    );
    expect(sourceAssessment.primaryAbsoluteSource).toBe("barometric");
    expect(sourceAssessment.primaryRelativeSource).toBe("barometric");
    expect(result.diagnostics.elevation.filtersApplied).toContain("distance_domain_fusion");
    expect(result.diagnostics.elevation.filtersApplied).toContain("confirmed_elevation_turns");
    expect(result.elevationGainMeters).toBeLessThan(5);
    expect(result.elevationLossMeters).toBeLessThan(5);
  });

  it("keeps suspicious low-relief barometric oscillation bounded with model fusion", () => {
    const result = analyzeTrack(
      Array.from({ length: 9 }, (_item, index) =>
        barometricPoint(55 + index * 0.0001, 37, index % 2 === 0 ? 100 : 102.6, index * 60)
      )
    );

    expect(result.summary.elevationSource).toBe("barometric");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    const sourceAssessment = requireValue(
      result.diagnostics.elevation.sourceAssessment,
      "sourceAssessment"
    );
    expect(sourceAssessment.primaryRelativeSource).toBe("barometric");
    expect(result.diagnostics.elevation.gainModel.minSustainedDistanceMeters).toBeGreaterThan(0);
    expect(result.elevationGainMeters).toBeLessThan(15);
    expect(result.elevationLossMeters).toBeLessThan(15);
    expect(result.diagnostics.elevation.barometricSanity).toMatchObject({
      evaluated: false,
      trusted: false,
      reason: null
    });
  });

  it("uses barometric source confidence when sufficient-sample barometric elevation is smooth", () => {
    const result = analyzeTrack(
      [100, 102.5, 105, 105.5, 106].map((elevation, index) =>
        barometricPoint(55 + index * 0.0001, 37, elevation, index * 60)
      )
    );

    expect(result.summary.elevationSource).toBe("barometric");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    const sourceAssessment = requireValue(
      result.diagnostics.elevation.sourceAssessment,
      "sourceAssessment"
    );
    expect(sourceAssessment.primaryRelativeSource).toBe("barometric");
    expect(sourceAssessment.assessments.barometric.relTrust).toBeGreaterThan(0.5);
    expect(sourceAssessment.assessments.barometric.absTrust).toBeGreaterThan(0.3);
    expect(result.elevationGainMeters).toBeGreaterThan(0);
    expect(result.elevationGainMeters).toBeLessThan(10);
    expect(result.elevationLossMeters).toBeCloseTo(0);
  });

  it("does not count gain across gaps in barometric elevation runs", () => {
    const points = [];

    for (let index = 0; index < 9; index += 1) {
      const secondsFromStart = index * 120;

      points.push(
        barometricPoint(55 + index * 0.0001, 37, index % 2 === 0 ? 100 : 102.6, secondsFromStart)
      );

      if (index < 8) {
        points.push(
          barometricPoint(55 + index * 0.0001 + 0.00005, 37, null, secondsFromStart + 60)
        );
      }
    }

    const result = analyzeTrack(points);

    expect(result.summary.elevationSource).toBe("barometric");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.fusion.continuousRunCount).toBeGreaterThan(1);
    const sourceAssessment = requireValue(
      result.diagnostics.elevation.sourceAssessment,
      "sourceAssessment"
    );
    expect(sourceAssessment.assessments.barometric.sampleCount).toBe(9);
    expect(result.elevationGainMeters).toBeLessThan(15);
    expect(result.elevationLossMeters).toBeLessThan(15);
  });

  it("keeps model diagnostics in raw recompute mode", () => {
    const result = analyzeTrack(
      Array.from({ length: 9 }, (_item, index) =>
        barometricPoint(55 + index * 0.0001, 37, index % 2 === 0 ? 100 : 102.6, index * 60)
      ),
      { mode: "recomputed_raw" }
    );

    expect(result.mode).toBe("recomputed_raw");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    const sourceAssessment = requireValue(
      result.diagnostics.elevation.sourceAssessment,
      "sourceAssessment"
    );
    expect(sourceAssessment.primaryRelativeSource).toBe("barometric");
    expect(result.diagnostics.elevation.filtersApplied).toContain("distance_domain_fusion");
    expect(result.diagnostics.elevation.filtersApplied).toContain("confirmed_elevation_turns");
  });

  it("filters a single-point barometric spike through model fusion", () => {
    const result = analyzeTrack(
      [100, 101, 126, 100.5, 101].map((elevation, index) =>
        barometricPoint(55 + index * 0.0001, 37, elevation, index * 60)
      )
    );

    expect(result.summary.elevationSource).toBe("barometric");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.maxElevationMeters).toBeLessThan(120);
    expect(result.maxElevationMetersRaw).toBe(126);
    expect(result.elevationRangeMeters).toBeLessThan(20);
    expect(result.diagnostics.elevation.filtersApplied).toContain("distance_domain_fusion");
  });

  it("filters a three-point single-point barometric spike through model fusion", () => {
    const result = analyzeTrack([
      barometricPoint(55, 37, 100, 0),
      barometricPoint(55.0001, 37, 130, 60),
      barometricPoint(55.0002, 37, 100, 120)
    ]);

    expect(result.summary.elevationSource).toBe("barometric");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.maxElevationMeters).toBeLessThan(125);
    expect(result.maxElevationMetersRaw).toBe(130);
    expect(result.elevationRangeMeters).toBeLessThan(
      requireValue(result.maxElevationMetersRaw, "maxElevationMetersRaw") -
        requireValue(result.minElevationMetersRaw, "minElevationMetersRaw")
    );
  });

  it.each([
    {
      label: "interior",
      elevations: [100, 101, 126, 100.5, 101]
    },
    {
      label: "endpoint",
      elevations: [180, 100, 101, 100.5, 101]
    }
  ])("exposes a filtered elevation chart series for a removed $label spike", ({ elevations }) => {
    const result = analyzeTrack(
      elevations.map((elevation, index) =>
        barometricPoint(55 + index * 0.0001, 37, elevation, index * 60)
      )
    );

    expect(Math.max(...result.distanceSeries.map((sample) => Number(sample.elevation)))).toBe(
      Math.max(...elevations)
    );
    expect(result.maxElevationMeters).toBeLessThan(120);
    expect(result.elevationSeries.length).toBeGreaterThan(1);
    expect(Math.max(...result.elevationSeries.map((sample) => sample.elevation))).toBeCloseTo(
      requireValue(result.maxElevationMeters, "maxElevationMeters")
    );
    expect(Math.max(...result.elevationSeries.map((sample) => sample.elevation))).toBeLessThan(120);
  });

  it("keeps elevation chart continuity boundaries for missing elevation gaps", () => {
    const result = analyzeTrack([
      barometricPoint(55, 37, 100, 0),
      barometricPoint(55.0001, 37, 105, 60),
      barometricPoint(55.0002, 37, null, 120),
      barometricPoint(55.0003, 37, 500, 180),
      barometricPoint(55.0004, 37, 505, 240)
    ]);
    const runIds = [...new Set(result.elevationSeries.map((sample) => sample.continuousRunId))];

    expect(result.diagnostics.elevation.fusion.continuousRunCount).toBe(2);
    expect(runIds).toEqual([0, 1]);
  });

  it("calculates distance, timing, elevation, and series for timed elevated points", () => {
    const result = analyzeTrack([
      point(43.1, 42.1, 620, new Date("2024-05-25T08:00:00.000Z")),
      point(43.102, 42.102, 650, new Date("2024-05-25T08:05:00.000Z")),
      point(43.104, 42.104, 700, new Date("2024-05-25T08:12:00.000Z")),
      point(43.106, 42.106, 690, new Date("2024-05-25T08:20:00.000Z"))
    ]);

    expect(result.totalDistanceMeters).toBeGreaterThan(760);
    expect(result.totalDurationSeconds).toBe(1200);
    expect(result.movingDurationSeconds).toBe(1200);
    expect(result.elevationGainMeters).toBeCloseTo(80, 0);
    expect(result.elevationLossMeters).toBeCloseTo(10, 0);
    expect(result.minElevationMeters).toBeCloseTo(620, 0);
    expect(result.maxElevationMeters).toBeCloseTo(700, 0);
    expect(result.minElevationMetersRaw).toBe(620);
    expect(result.maxElevationMetersRaw).toBe(700);
    expect(result.elevationRangeMeters).toBeCloseTo(
      requireValue(result.maxElevationMeters, "maxElevationMeters") -
        requireValue(result.minElevationMeters, "minElevationMeters")
    );
    expect(result.summary.elevationRangeMeters).toBe(result.elevationRangeMeters);
    expect(result.distanceSeries).toHaveLength(4);
    expect(result.speedSeries.length).toBeGreaterThan(0);
    expect(result.slopeSeries.length).toBeGreaterThan(0);
  });

  it("builds slope samples without reverse-scanning the distance series for every point", () => {
    const originalFind = Array.prototype.find;
    const originalFindLast = Array.prototype.findLast;
    let forwardScans = 0;
    let reverseScans = 0;

    Array.prototype.find = function find(predicate, thisArg) {
      forwardScans += 1;
      return originalFind.call(this, predicate, thisArg);
    };
    Array.prototype.findLast = function findLast(predicate, thisArg) {
      reverseScans += 1;
      return originalFindLast.call(this, predicate, thisArg);
    };

    try {
      const points = Array.from({ length: 24 }, (_item, index) =>
        timedPoint(43.1 + index * 0.001, 42.1, 100 + index, index * 60)
      );

      const result = analyzeTrack(points);

      expect(result.slopeSeries.length).toBeGreaterThan(0);
    } finally {
      Array.prototype.find = originalFind;
      Array.prototype.findLast = originalFindLast;
    }

    expect(forwardScans).toBeLessThanOrEqual(1);
    expect(reverseScans).toBeLessThanOrEqual(1);
  });

  it("returns named summaries, provenance, diagnostics, and confidence flags", () => {
    const result = analyzeTrack([
      timedPoint(43.1, 42.1, 100, 0),
      timedPoint(43.101, 42.101, 103, 60),
      timedPoint(43.102, 42.102, 101, 120),
      timedPoint(43.103, 42.103, 108, 180)
    ]);

    expect(result.mode).toBe("recomputed_filtered");
    expect(result.summary).toMatchObject({
      mode: "recomputed_filtered",
      elevationSource: "gpx"
    });
    expect(result.elevationSeries).toEqual(expect.any(Array));
    expect(result.summary).not.toHaveProperty("elevationSeries");
    expect(result.provenance).toMatchObject({
      mode: "recomputed_filtered",
      inputPointCount: 4,
      outputPointCount: 4,
      pointsRemoved: 0,
      elevationSource: "gpx"
    });
    expect(result.provenance.filtersApplied).toContain("distance_domain_fusion");
    expect(result.provenance.filtersApplied).toContain("confirmed_elevation_turns");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    const activityAssessment = requireValue(
      result.diagnostics.elevation.activityAssessment,
      "activityAssessment"
    );
    expect(["foot", "bike"]).toContain(activityAssessment.inferred);
    expect(result.diagnostics.elevation.fusion.method).toBe("distance_domain_filtered_profile");
    expect(result.diagnostics.elevation.fusion.noise).toMatchObject({
      medianSigmaAfterCleanupMeters: expect.any(Number),
      p95SigmaAfterCleanupMeters: expect.any(Number),
      medianSigmaAfterSmoothingMeters: expect.any(Number),
      p95SigmaAfterSmoothingMeters: expect.any(Number)
    });
    expect(result.diagnostics.elevation.thresholds.turnThresholdMeters).toBeGreaterThan(0);
    expect(result.diagnostics.elevation.thresholdSweep.map((item) => item.thresholdMeters)).toEqual(
      expect.arrayContaining([
        result.diagnostics.elevation.gainModel.medianThresholdMeters,
        result.diagnostics.elevation.gainModel.p95ThresholdMeters
      ])
    );
    expect(
      result.auditTrail
        .find((stage) => stage.id === "elevation")
        ?.items.find((item) => item.id === "thresholdSweep")
    ).toMatchObject({
      value: expect.stringContaining("p95")
    });
    expect(result.auditTrail.map((stage) => stage.id)).toEqual([
      "input",
      "cleaning",
      "continuity",
      "elevation",
      "movement",
      "sampling",
      "summary"
    ]);
    expect(result.auditTrail.find((stage) => stage.id === "summary")).toMatchObject({
      label: "Summary",
      items: expect.arrayContaining([
        expect.objectContaining({
          id: "distance",
          label: "Distance",
          value: expect.stringMatching(/m$/),
          valueType: "meters",
          rawValue: expect.any(Number)
        }),
        expect.objectContaining({
          id: "elevationGain",
          label: "Elevation gain",
          value: expect.stringMatching(/m$/),
          valueType: "meters",
          rawValue: expect.any(Number)
        })
      ])
    });
    expect(result.confidenceFlags).toContain("moving_time_heuristic");
  });

  it("supports a raw recompute mode without timed elevation filtering", () => {
    const result = analyzeTrack(
      [
        timedPoint(43.1, 42.1, 100, 0),
        timedPoint(43.101, 42.101, 101, 60),
        timedPoint(43.102, 42.102, 100, 120),
        timedPoint(43.103, 42.103, 101, 180),
        timedPoint(43.104, 42.104, 100, 240)
      ],
      { mode: "recomputed_raw" }
    );

    expect(result.mode).toBe("recomputed_raw");
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.elevationGainMeters).toBeLessThanOrEqual(2);
    expect(result.elevationLossMeters).toBeLessThanOrEqual(2);
    expect(result.provenance.filtersApplied).toContain("distance_domain_fusion");
    expect(result.provenance.filtersApplied).not.toContain("elevation_threshold");
  });

  it("does not bridge explicit GPX segment breaks", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z")),
      {
        ...point(1, 1, 20, new Date("2024-05-25T09:00:00.000Z")),
        segmentIndex: 1
      },
      {
        ...point(1, 1.001, 22, new Date("2024-05-25T09:01:00.000Z")),
        segmentIndex: 1
      }
    ]);

    expect(result.totalDistanceMeters).toBeGreaterThan(200);
    expect(result.totalDistanceMeters).toBeLessThan(230);
    expect(result.speedSeries).toHaveLength(2);
    expect(result.provenance.confidenceFlags).toContain("segment_breaks_preserved");
  });

  it("sums elapsed duration across explicit GPX segment spans", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z")),
      {
        ...point(1, 1, 20, new Date("2024-05-25T09:00:00.000Z")),
        segmentIndex: 1
      },
      {
        ...point(1, 1.001, 22, new Date("2024-05-25T09:01:00.000Z")),
        segmentIndex: 1
      }
    ]);

    expect(result.totalDurationSeconds).toBe(120);
    expect(result.stoppedDurationSeconds).toBe(0);
    expect(result.diagnostics.continuity.continuousSegmentCount).toBe(2);
  });

  it("does not stitch distance or speed across explicit FIT segment boundaries", () => {
    const result = analyzeTrack([
      timedPoint(0, 0, 10, 0),
      timedPoint(0, 0.0001, 12, 60),
      {
        ...timedPoint(1, 1, 20, 120),
        segmentIndex: 1
      },
      {
        ...timedPoint(1, 1.0001, 22, 180),
        segmentIndex: 1
      }
    ]);

    expect(result.totalDistanceMeters).toBeLessThan(40);
    expect(result.maxSpeedKmh).toBeLessThan(2);
    expect(result.speedSeries).toHaveLength(2);
    expect(result.provenance.confidenceFlags).toContain("segment_breaks_preserved");
  });

  it("keeps route distance across large time gaps while splitting speed continuity", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.001, 12, new Date("2024-05-25T08:00:10.000Z")),
      point(0, 0.101, 40, new Date("2024-05-25T09:00:00.000Z")),
      point(0, 0.102, 42, new Date("2024-05-25T09:00:10.000Z"))
    ]);

    expect(result.totalDistanceMeters).toBeGreaterThan(11350);
    expect(result.totalDistanceMeters).toBeLessThan(11360);
    expect(result.speedSeries).toHaveLength(2);
    expect(result.provenance.filtersApplied).toContain("time_gap_segmentation");
    expect(result.provenance.confidenceFlags).toContain("time_gap_segments_preserved");
    expect(result.diagnostics.continuity.timeGapBreakCount).toBe(1);
  });

  it("rejects tracks that have fewer than two usable points after cleaning", () => {
    expect(() =>
      analyzeTrack([
        {
          ...point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
          fix: "none"
        },
        {
          ...point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z")),
          fix: "none"
        }
      ])
    ).toThrow("At least two usable points are required for analysis");
  });

  it("rejects tracks that have only one usable point after cleaning", () => {
    expect(() =>
      analyzeTrack([
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        {
          ...point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z")),
          fix: "none"
        }
      ])
    ).toThrow("At least two usable points are required for analysis");
  });

  it("keeps elapsed duration across recording gaps inside a source segment", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.001, 12, new Date("2024-05-25T08:00:10.000Z")),
      point(0, 0.101, 40, new Date("2024-05-25T09:00:00.000Z")),
      point(0, 0.102, 42, new Date("2024-05-25T09:00:10.000Z"))
    ]);

    expect(result.totalDurationSeconds).toBe(3610);
    expect(result.summary.totalDurationSeconds).toBe(3610);
    expect(result.stoppedDurationSeconds).toBe(3590);
    expect(result.averageSpeedKmh).toBeCloseTo((result.totalDistanceMeters / 3610) * 3.6);
    expect(result.averageSpeedKmh).toBe(result.overallAverageSpeedKmh);
    expect(result.movingAverageSpeedKmh).toBeGreaterThan(result.averageSpeedKmh ?? 0);
    expect(result.diagnostics.continuity.continuousSegmentCount).toBe(2);
    expect(result.diagnostics.continuity.continuousSegments).toEqual([
      {
        index: 0,
        startIndex: 0,
        endIndex: 1,
        pointCount: 2,
        durationSeconds: 10
      },
      {
        index: 1,
        startIndex: 2,
        endIndex: 3,
        pointCount: 2,
        durationSeconds: 10
      }
    ]);
  });

  it("counts plausible sparse time-gap intervals as movement", () => {
    const points = [
      timedPointAtMeters(0, 0),
      timedPointAtMeters(1200, 60),
      timedPointAtMeters(2400, 120),
      timedPointAtMeters(3600, 180),
      timedPointAtMeters(4800, 240),
      timedPointAtMeters(6000, 300),
      timedPointAtMeters(36000, 1800),
      timedPointAtMeters(37200, 1860),
      timedPointAtMeters(38400, 1920),
      timedPointAtMeters(39600, 1980)
    ];

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.timeGapBreakCount).toBe(1);
    expect(result.diagnostics.continuity.movingTimeGapBridgeCount).toBe(1);
    expect(result.movingDurationSeconds).toBe(1980);
    expect(result.movingAverageSpeedKmh).toBeCloseTo(72);
  });

  it("keeps short low-speed XY jitter in route distance but not moving distance", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.00002, 10, new Date("2024-05-25T08:00:20.000Z")),
      point(0, -0.00002, 10, new Date("2024-05-25T08:00:40.000Z")),
      point(0, 0.000018, 10, new Date("2024-05-25T08:01:00.000Z")),
      point(0, -0.000018, 10, new Date("2024-05-25T08:01:20.000Z")),
      point(0, 0.001, 10, new Date("2024-05-25T08:01:25.000Z"))
    ]);

    expect(result.totalDistanceMeters).toBeGreaterThan(128);
    expect(result.totalDistanceMeters).toBeLessThan(129);
    expect(result.distanceSeries[4].distanceFromStartMeters).toBeGreaterThan(14);
    expect(result.speedSeries.slice(0, 4).every((sample) => sample.distanceMeters === 0)).toBe(
      true
    );
    expect(result.provenance.filtersApplied).toContain("xy_jitter_distance_threshold");
    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBe(4);
    expect(result.diagnostics.continuity.routeXyJitterSegmentCount).toBe(0);
    expect(result.diagnostics.continuity.thresholds.xyJitterDistanceMeters).toBe(5);
    expect(result.diagnostics.continuity.thresholds.routeXyJitterMinPairCount).toBe(25);
  });

  it("keeps elevation profile distance aligned with filtered route distance", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.00002, 10, new Date("2024-05-25T08:00:20.000Z")),
      point(0, -0.00002, 10, new Date("2024-05-25T08:00:40.000Z")),
      point(0, 0.000018, 10, new Date("2024-05-25T08:01:00.000Z")),
      point(0, -0.000018, 10, new Date("2024-05-25T08:01:20.000Z")),
      point(0, 0.001, 10, new Date("2024-05-25T08:01:25.000Z"))
    ]);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBe(4);
    expect(result.elevationSeries.at(-1)?.distanceFromStartMeters).toBeCloseTo(
      result.totalDistanceMeters
    );
  });

  it("reports zero 3D distance when all timed movement is low-speed XY jitter", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.00002, 14, new Date("2024-05-25T08:00:20.000Z")),
      point(0, -0.00002, 9, new Date("2024-05-25T08:00:40.000Z"))
    ]);

    expect(result.totalDistanceMeters).toBe(0);
    expect(result.totalDistance3dMeters).toBe(0);
    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBe(2);
    expect(result.diagnostics.continuity.routeXyJitterSegmentCount).toBe(2);
  });

  it("keeps short high-speed samples as route movement", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.00002, 10, new Date("2024-05-25T08:00:01.000Z")),
      point(0, 0.00004, 10, new Date("2024-05-25T08:00:02.000Z")),
      point(0, 0.00006, 10, new Date("2024-05-25T08:00:03.000Z")),
      point(0, 0.00008, 10, new Date("2024-05-25T08:00:04.000Z")),
      point(0, 0.0001, 10, new Date("2024-05-25T08:00:05.000Z"))
    ]);

    expect(result.totalDistanceMeters).toBeGreaterThan(11);
    expect(result.totalDistanceMeters).toBeLessThan(12);
    expect(result.movingDurationSeconds).toBe(5);
    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBe(0);
  });

  it("does not include zeroed XY jitter samples in segment timing", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.00002, 10, new Date("2024-05-25T08:00:20.000Z")),
      point(0, -0.00002, 10, new Date("2024-05-25T08:00:40.000Z")),
      point(0, 0.0009, 10, new Date("2024-05-25T08:01:40.000Z"))
    ]);

    expect(result.speedSeries.slice(0, 2).every((sample) => sample.distanceMeters === 0)).toBe(
      true
    );
    expect(result.segments[0].durationSeconds).toBe(60);
  });

  it("keeps 3D distance as an alternate metric without changing canonical 2D distance", () => {
    const result = analyzeTrack([
      point(0, 0, 100, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0, 200, new Date("2024-05-25T08:01:00.000Z"))
    ]);

    expect(result.totalDistanceMeters).toBe(0);
    expect(result.totalDistance3dMeters).toBeCloseTo(100);
    expect(result.summary.totalDistanceMeters).toBe(0);
    expect(result.summary.totalDistance3dMeters).toBeCloseTo(100);
  });

  it("drops short heading-flip jitter before it becomes false movement", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.00006, 10, new Date("2024-05-25T08:00:04.000Z")),
      point(0, 0.000002, 10, new Date("2024-05-25T08:00:08.000Z")),
      point(0, 0.001, 10, new Date("2024-05-25T08:01:00.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("heading_flip_jitter");
    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      headingFlipMaxDurationSeconds: 5,
      headingFlipMinLegMeters: 5,
      headingFlipMaxLegMeters: 10,
      headingFlipReturnDistanceMeters: 5,
      headingFlipMinTurnDegrees: 120
    });
    expect(result.distanceSeries).toHaveLength(3);
    expect(result.totalDistanceMeters).toBeGreaterThan(110);
    expect(result.totalDistanceMeters).toBeLessThan(112);
  });

  it("drops obvious duplicate and impossible jump points before filtered metrics", () => {
    const result = analyzeTrack([
      timedPoint(0, 0, 10, 0),
      timedPoint(0, 0, 10, 0),
      timedPoint(0, 0.001, 12, 60),
      timedPoint(0, 0.101, 50, 61),
      timedPoint(0, 0.002, 14, 120)
    ]);

    expect(result.provenance.pointsRemoved).toBe(2);
    expect(result.provenance.filtersApplied).toContain("duplicate_points");
    expect(result.provenance.filtersApplied).toContain("gps_jump");
    expect(result.distanceSeries).toHaveLength(3);
    expect(result.totalDistanceMeters).toBeGreaterThan(220);
    expect(result.totalDistanceMeters).toBeLessThan(225);
  });

  it("still applies conservative cleaning in recomputed raw mode", () => {
    const result = analyzeTrack(
      [
        timedPoint(0, 0, 10, 0),
        timedPoint(0, 0, 10, 0),
        timedPoint(0, 0.001, 12, 60),
        timedPoint(0, 0.002, 14, 90)
      ],
      { mode: "recomputed_raw" }
    );

    expect(result.mode).toBe("recomputed_raw");
    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("duplicate_points");
    expect(result.routePoints).toHaveLength(3);
  });

  it("exposes the cleaned route points used by distance and speed samples", () => {
    const result = analyzeTrack([
      timedPoint(0, 0, 10, 0),
      timedPoint(0, 0, 10, 0),
      timedPoint(0, 0.001, 12, 60),
      timedPoint(0, 0.002, 14, 90)
    ]);

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.routePoints).toHaveLength(3);
    expect(result.routePoints.map((point) => point.longitude)).toEqual([0, 0.001, 0.002]);
    expect(result.speedSeries.map((sample) => result.routePoints[sample.index]?.longitude)).toEqual(
      [0.001, 0.002]
    );
  });

  it("uses an explicit speed profile ceiling when provided", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.0002, 50, new Date("2024-05-25T08:00:01.000Z")),
        point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z"))
      ],
      { speedProfile: "slow" }
    );

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("gps_jump");
    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "explicit",
      adaptiveSpeedCeilingMps: 6,
      hardSpeedCeilingMps: 50
    });
    expect(result.distanceSeries).toHaveLength(2);
    expect(result.speedSeries).toHaveLength(1);
  });

  it("infers a slow speed profile from steady low-speed samples", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.0001, 12, new Date("2024-05-25T08:00:10.000Z")),
      point(0, 0.0002, 11, new Date("2024-05-25T08:00:20.000Z")),
      point(0, 0.0003, 13, new Date("2024-05-25T08:00:30.000Z")),
      point(0, 0.0004, 12, new Date("2024-05-25T08:00:40.000Z")),
      point(0, 0.0006, 48, new Date("2024-05-25T08:00:41.000Z")),
      point(0, 0.0005, 11, new Date("2024-05-25T08:00:50.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("gps_jump");
    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred",
      speedProfileConfidence: "high",
      adaptiveSpeedCeilingMps: 6
    });
    expect(result.distanceSeries).toHaveLength(6);
    expect(result.speedSeries).toHaveLength(5);
  });

  it("keeps sustained fast movement in inferred slow tracks as route geometry", () => {
    const points = [];

    for (let index = 0; index <= 40; index += 1) {
      points.push(timedPointAtMeters(index * 5, index * 10));
    }

    for (let index = 1; index <= 8; index += 1) {
      points.push(timedPointAtMeters(200 + index * 20, 400 + index * 2));
    }

    points.push(timedPointAtMeters(365, 500));

    const result = analyzeTrack(points);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred",
      adaptiveSpeedCeilingMps: 6
    });
    expect(result.provenance.filtersApplied).not.toContain("gps_jump");
    expect(result.routePoints).toHaveLength(points.length);
    expect(result.totalDistanceMeters).toBeCloseTo(365, 1);
  });

  it("keeps a coherent fast corridor with short below-ceiling dips in inferred slow tracks", () => {
    const points = [];

    for (let index = 0; index <= 40; index += 1) {
      points.push(timedPointAtMeters(index * 5, index * 10));
    }

    let distanceMeters = 200;
    let secondsFromStart = 400;
    const speedsKmh = [28.5, 23.3, 23, 19.7, 27.2, 15.1, 19.9, 19.5];

    for (const speedKmh of speedsKmh) {
      distanceMeters += (speedKmh / 3.6) * 2;
      secondsFromStart += 2;
      points.push(timedPointAtMeters(distanceMeters, secondsFromStart));
    }

    distanceMeters += 5;
    secondsFromStart += 20;
    points.push(timedPointAtMeters(distanceMeters, secondsFromStart));

    const result = analyzeTrack(points);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred",
      adaptiveSpeedCeilingMps: 6
    });
    expect(result.provenance.filtersApplied).not.toContain("gps_jump");
    expect(result.routePoints).toHaveLength(points.length);
    expect(result.totalDistanceMeters).toBeCloseTo(distanceMeters, 1);
  });

  it("keeps a smooth fast trajectory when one short dip falls below the near-fast threshold", () => {
    const points = [];

    for (let index = 0; index <= 40; index += 1) {
      points.push(timedPointAtMeters(index * 5, index * 10));
    }

    let distanceMeters = 200;
    let secondsFromStart = 400;
    const speedsKmh = [22.45, 22.32, 20.19, 14.47, 21.96, 35.73, 37.53];

    for (const speedKmh of speedsKmh) {
      distanceMeters += (speedKmh / 3.6) * 2;
      secondsFromStart += 2;
      points.push(timedPointAtMeters(distanceMeters, secondsFromStart));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred",
      adaptiveSpeedCeilingMps: 6
    });
    expect(result.provenance.filtersApplied).not.toContain("gps_jump");
    expect(result.routePoints).toHaveLength(points.length);
    expect(result.totalDistanceMeters).toBeCloseTo(distanceMeters, 1);
  });

  it("does not let an early-rejected raw point seed a protected fast corridor", () => {
    const points = [];

    for (let index = 0; index <= 40; index += 1) {
      points.push(timedPointAtMeters(index * 5, index * 10));
    }

    points.push({
      ...timedPointAtMeters(210, 402),
      fix: "none"
    });

    const fastPoints = [];

    for (const [distanceMeters, secondsFromStart] of [
      [225, 404],
      [240, 406],
      [255, 408],
      [270, 410],
      [285, 412]
    ]) {
      const fastPoint = timedPointAtMeters(distanceMeters, secondsFromStart);
      fastPoints.push(fastPoint);
      points.push(fastPoint);
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred",
      adaptiveSpeedCeilingMps: 6
    });
    expect(result.provenance.filtersApplied).toContain("bad_fix");
    expect(result.provenance.filtersApplied).toContain("gps_jump");
    expect(result.provenance.pointsRemoved).toBe(6);
    expect(result.routePoints).toHaveLength(points.length - 6);
    expect(fastPoints.every((fastPoint) => !result.routePoints.includes(fastPoint))).toBe(true);
  });

  it("does not protect jumpy fast corridors in inferred slow tracks", () => {
    const points = [];

    for (let index = 0; index <= 40; index += 1) {
      points.push(timedPointAtMeters(index * 5, index * 10));
    }

    const offsetsMeters = [220, 200, 220, 200, 220, 200];

    for (let index = 0; index < offsetsMeters.length; index += 1) {
      points.push(timedPointAtMeters(offsetsMeters[index], 402 + index * 2));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred",
      adaptiveSpeedCeilingMps: 6
    });
    expect(result.provenance.filtersApplied).toContain("gps_jump");
    expect(result.provenance.pointsRemoved).toBe(3);
    expect(result.routePoints).toHaveLength(points.length - 3);
  });

  it("does not protect progressive zigzag fast corridors in inferred slow tracks", () => {
    const points = [];

    for (let index = 0; index <= 40; index += 1) {
      points.push(timedPointAtMeters(index * 5, index * 10));
    }

    [
      [220, 20],
      [240, 0],
      [260, 20],
      [280, 0],
      [300, 20],
      [320, 0]
    ].forEach(([eastMeters, northMeters], index) => {
      points.push(timedPointAtOffsetMeters(eastMeters, northMeters, 402 + index * 2));
    });

    const result = analyzeTrack(points);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred",
      adaptiveSpeedCeilingMps: 6
    });
    expect(result.provenance.filtersApplied).toContain("gps_jump");
    expect(result.provenance.pointsRemoved).toBe(6);
    expect(result.routePoints).toHaveLength(points.length - 6);
  });

  it("uses the shared motion speed classifier for fast compressed tracks", () => {
    const result = analyzeTrack([
      timedPointAtMeters(0, 0),
      timedPointAtMeters(6, 1),
      timedPointAtMeters(12, 2),
      timedPointAtMeters(22, 3),
      timedPointAtMeters(32, 4),
      timedPointAtMeters(44, 5),
      timedPointAtMeters(56, 6)
    ]);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "fast",
      speedProfileSource: "inferred",
      adaptiveSpeedCeilingMps: 25
    });
  });

  it.each([
    { speedProfile: "moderate", cruiseSpeedMps: 4, jumpSpeedMps: 12, ceilingMps: 10 },
    { speedProfile: "fast", cruiseSpeedMps: 10, jumpSpeedMps: 30, ceilingMps: 25 }
  ])(
    "does not apply smooth-corridor protection to inferred $speedProfile tracks",
    ({ speedProfile, cruiseSpeedMps, jumpSpeedMps, ceilingMps }) => {
      const points = [timedPointAtMeters(0, 0)];
      let distanceMeters = 0;
      let secondsFromStart = 0;

      for (let index = 1; index <= 20; index += 1) {
        distanceMeters += cruiseSpeedMps;
        secondsFromStart += 1;
        points.push(timedPointAtMeters(distanceMeters, secondsFromStart));
      }

      for (let index = 1; index <= 4; index += 1) {
        distanceMeters += jumpSpeedMps;
        secondsFromStart += 1;
        points.push(timedPointAtMeters(distanceMeters, secondsFromStart));
      }

      const result = analyzeTrack(points);

      expect(result.diagnostics.cleaning.thresholds).toMatchObject({
        speedProfile,
        speedProfileSource: "inferred",
        adaptiveSpeedCeilingMps: ceilingMps
      });
      expect(result.provenance.filtersApplied).toContain("gps_jump");
      expect(result.provenance.pointsRemoved).toBe(4);
      expect(result.routePoints).toHaveLength(points.length - 4);
    }
  );

  it("filters profile-incompatible speed samples without deleting route points", () => {
    const result = analyzeTrack(
      [
        timedPointAtMeters(0, 0),
        timedPointAtMeters(5, 10),
        timedPointAtMeters(29.7, 11),
        timedPointAtMeters(34.7, 20)
      ],
      { speedReliabilityProfile: "slow" }
    );

    expect(result.routePoints).toHaveLength(4);
    expect(result.totalDistanceMeters).toBeCloseTo(34.7, 1);
    expect(result.speedSeries).toHaveLength(2);
    expect(result.maxSpeedKmh).toBeLessThan(3);
    expect(result.averageSpeedKmh).toBeCloseTo((10 / 20) * 3.6);
    expect(result.overallAverageSpeedKmh).toBe(result.averageSpeedKmh);
    expect(result.movingDurationSeconds).toBe(19);
    expect(result.movingAverageSpeedKmh).toBeLessThanOrEqual(
      requireValue(result.maxSpeedKmh, "maxSpeedKmh")
    );
    expect(result.movingAverageSpeedKmh).toBeCloseTo((10 / 19) * 3.6);
    expect(result.segments[0]).toMatchObject({
      durationSeconds: 19,
      averageSpeedKmh: expect.closeTo((10 / 19) * 3.6)
    });
    expect(result.provenance.filtersApplied).toContain("speed_outlier");
    expect(result.diagnostics.speed).toMatchObject({
      rawSampleCount: 3,
      reliableSampleCount: 2,
      speedOutlierCount: 1
    });
    expect(result.diagnostics.speed.speedOutlierSamples[0]).toMatchObject({
      index: 2
    });
  });

  it("infers conservative speed reliability from mixed low-speed and compressed samples", () => {
    const result = analyzeTrack([
      timedPointAtMeters(0, 0),
      timedPointAtMeters(1.25, 1),
      timedPointAtMeters(2.75, 2),
      timedPointAtMeters(4.75, 3),
      timedPointAtMeters(6.85, 4),
      timedPointAtMeters(9.05, 5),
      timedPointAtMeters(15.05, 6),
      timedPointAtMeters(21.15, 7),
      timedPointAtMeters(45.85, 8),
      timedPointAtMeters(57.85, 9),
      timedPointAtMeters(68.35, 10)
    ]);

    expect(result.routePoints).toHaveLength(11);
    expect(result.provenance.pointsRemoved).toBe(0);
    expect(result.maxSpeedKmh).toBeLessThanOrEqual(21.6);
    expect(result.averageSpeedKmh).toBeCloseTo((15.05 / 10) * 3.6);
    expect(result.movingAverageSpeedKmh).toBeLessThanOrEqual(
      requireValue(result.maxSpeedKmh, "maxSpeedKmh")
    );
    expect(result.provenance.filtersApplied).toContain("speed_outlier");
    expect(result.diagnostics.speed.thresholds).toMatchObject({
      speedReliabilityProfile: "slow",
      speedReliabilityProfileSource: "speed_distribution",
      maxReliableSpeedMps: 6,
      maxReliableSpeedKmh: 21.6
    });
    expect(result.diagnostics.speed.speedOutlierCount).toBe(4);
  });

  it("does not infer slow reliability when slow would reject most samples", () => {
    const speedsMps = [
      ...Array(218).fill(4.58 / 3.6),
      ...Array(326).fill(7.24 / 3.6),
      ...Array(545).fill(22.66 / 3.6),
      ...Array(543).fill(37.77 / 3.6),
      ...Array(544).fill(46.26 / 3.6)
    ];
    let distanceMeters = 0;
    const points = [timedPointAtMeters(distanceMeters, 0)];

    speedsMps.forEach((speedMps, index) => {
      distanceMeters += speedMps;
      points.push(timedPointAtMeters(distanceMeters, index + 1));
    });

    const result = analyzeTrack(points, { speedProfile: "fast" });

    expect(result.diagnostics.speed.thresholds).toMatchObject({
      speedReliabilityProfile: "moderate",
      speedReliabilityProfileSource: "speed_distribution",
      maxReliableSpeedKmh: 36
    });
    expect(
      result.diagnostics.speed.thresholds.speedReliabilitySignals.rejectedShareByProfile.slow
    ).toBeGreaterThan(0.5);
    expect(result.diagnostics.speed.thresholds.speedReliabilityWarnings).toContain(
      "slow_rejected_share_too_high"
    );
    expect(result.movingAverageSpeedKmh).toBeGreaterThan(result.overallAverageSpeedKmh ?? 0);
  });

  it("reports unavailable speed metrics when every speed sample is unreliable", () => {
    const result = analyzeTrack(
      [timedPointAtMeters(0, 0), timedPointAtMeters(24, 1), timedPointAtMeters(48, 2)],
      { speedReliabilityProfile: "slow" }
    );

    expect(result.routePoints).toHaveLength(3);
    expect(result.speedSeries).toHaveLength(0);
    expect(result.maxSpeedKmh).toBeNull();
    expect(result.movingDurationSeconds).toBeNull();
    expect(result.movingAverageSpeedKmh).toBeNull();
    expect(result.diagnostics.speed.speedOutlierCount).toBe(2);
  });

  it("uses reliable speed distance for timer-event moving average when samples are filtered", () => {
    const result = analyzeTrack(
      [timedPointAtMeters(0, 0), timedPointAtMeters(5, 10), timedPointAtMeters(29.7, 11)],
      {
        speedReliabilityProfile: "slow",
        timerEvents: [
          { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
          { timestamp: "2024-05-25T08:00:11.000Z", eventType: "stop_all" }
        ]
      }
    );

    expect(result.speedSeries).toHaveLength(1);
    expect(result.maxSpeedKmh).toBeLessThan(3);
    expect(result.movingDurationSeconds).toBe(11);
    expect(result.movingAverageSpeedKmh).toBeLessThanOrEqual(
      requireValue(result.maxSpeedKmh, "maxSpeedKmh")
    );
    expect(result.movingAverageSpeedKmh).toBeCloseTo((5 / 11) * 3.6);
    expect(result.provenance.filtersApplied).toContain("speed_outlier");
    expect(result.provenance.filtersApplied).toContain("moving_time_timer_events");
    expect(result.diagnostics.moving.source).toBe("timer_events");
  });

  it("uses timer-clipped reliable distance for inferred speed-distribution outliers", () => {
    const result = analyzeTrack(
      [
        timedPointAtMeters(0, 0),
        timedPointAtMeters(1.25, 1),
        timedPointAtMeters(2.75, 2),
        timedPointAtMeters(4.75, 3),
        timedPointAtMeters(6.85, 4),
        timedPointAtMeters(9.05, 5),
        timedPointAtMeters(15.05, 6),
        timedPointAtMeters(21.15, 7),
        timedPointAtMeters(45.85, 8),
        timedPointAtMeters(57.85, 9),
        timedPointAtMeters(68.35, 10)
      ],
      {
        timerEvents: [
          { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
          { timestamp: "2024-05-25T08:00:05.000Z", eventType: "stop_all" }
        ]
      }
    );

    expect(result.diagnostics.speed.thresholds).toMatchObject({
      speedReliabilityProfile: "slow",
      speedReliabilityProfileSource: "speed_distribution"
    });
    expect(result.diagnostics.speed.speedOutlierCount).toBeGreaterThan(0);
    expect(result.diagnostics.moving.source).toBe("timer_events");
    expect(result.movingDurationSeconds).toBe(5);
    expect(result.overallAverageSpeedKmh).toBeCloseTo((15.05 / 10) * 3.6);
    expect(result.movingAverageSpeedKmh).toBeCloseTo((9.05 / 5) * 3.6);
    expect(result.movingAverageSpeedKmh).toBeGreaterThan(result.overallAverageSpeedKmh ?? 0);
  });

  it("clips reliable timer-event moving distance to running intervals", () => {
    const result = analyzeTrack(
      [
        timedPointAtMeters(0, 0),
        timedPointAtMeters(5, 10),
        timedPointAtMeters(10, 20),
        timedPointAtMeters(15, 30),
        timedPointAtMeters(39.7, 31)
      ],
      {
        speedReliabilityProfile: "slow",
        timerEvents: [
          { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
          { timestamp: "2024-05-25T08:00:10.000Z", eventType: "stop_all" },
          { timestamp: "2024-05-25T08:00:20.000Z", eventType: "start" },
          { timestamp: "2024-05-25T08:00:30.000Z", eventType: "stop_all" }
        ]
      }
    );

    expect(result.speedSeries).toHaveLength(3);
    expect(result.maxSpeedKmh).toBeCloseTo(1.8);
    expect(result.movingDurationSeconds).toBe(20);
    expect(result.movingAverageSpeedKmh).toBeCloseTo((10 / 20) * 3.6);
    expect(result.provenance.filtersApplied).toContain("speed_outlier");
    expect(result.provenance.filtersApplied).toContain("moving_time_timer_events");
  });

  it("keeps sustained fast speed when no slow reliability profile is inferred", () => {
    const result = analyzeTrack([
      timedPointAtMeters(0, 0),
      timedPointAtMeters(22, 1),
      timedPointAtMeters(44, 2),
      timedPointAtMeters(66, 3)
    ]);

    expect(result.speedSeries).toHaveLength(3);
    expect(result.maxSpeedKmh).toBeGreaterThan(75);
    expect(result.provenance.filtersApplied).not.toContain("speed_outlier");
    expect(result.diagnostics.speed.speedOutlierCount).toBe(0);
    expect(result.diagnostics.speed.thresholds).toMatchObject({
      speedReliabilityProfile: "unknown",
      speedReliabilityProfileSource: "cleaning_profile",
      maxReliableSpeedKmh: null
    });
  });

  it("keeps sustained fast speed after a slow start", () => {
    const result = analyzeTrack([
      timedPointAtMeters(0, 0),
      timedPointAtMeters(1, 1),
      timedPointAtMeters(2, 2),
      timedPointAtMeters(24, 3),
      timedPointAtMeters(46, 4),
      timedPointAtMeters(68, 5),
      timedPointAtMeters(90, 6),
      timedPointAtMeters(112, 7),
      timedPointAtMeters(134, 8)
    ]);

    expect(result.speedSeries).toHaveLength(8);
    expect(result.maxSpeedKmh).toBeGreaterThan(75);
    expect(result.provenance.filtersApplied).not.toContain("speed_outlier");
    expect(result.diagnostics.speed).toMatchObject({
      speedOutlierCount: 0,
      thresholds: {
        speedReliabilityProfile: "unknown",
        speedReliabilityProfileSource: "cleaning_profile",
        maxReliableSpeedKmh: null
      }
    });
  });

  it("keeps sustained fast speed when slow and fast samples split the distribution", () => {
    const speedsMps = [...Array(10).fill(1), ...Array(10).fill(22)];
    let distanceMeters = 0;
    const points = [timedPointAtMeters(distanceMeters, 0)];

    speedsMps.forEach((speedMps, index) => {
      distanceMeters += speedMps;
      points.push(timedPointAtMeters(distanceMeters, index + 1));
    });

    const result = analyzeTrack(points);

    expect(result.speedSeries).toHaveLength(20);
    expect(result.maxSpeedKmh).toBeGreaterThan(75);
    expect(result.provenance.filtersApplied).not.toContain("speed_outlier");
    expect(result.diagnostics.speed).toMatchObject({
      speedOutlierCount: 0,
      thresholds: {
        speedReliabilityProfile: "unknown",
        speedReliabilityProfileSource: "cleaning_profile",
        maxReliableSpeedKmh: null
      }
    });
  });

  it("falls back from invalid speed reliability profiles without filtering sustained fast samples", () => {
    const result = analyzeTrack(
      [
        timedPointAtMeters(0, 0),
        timedPointAtMeters(22, 1),
        timedPointAtMeters(44, 2),
        timedPointAtMeters(66, 3)
      ],
      { speedReliabilityProfile: "toString" }
    );

    expect(result.speedSeries).toHaveLength(3);
    expect(result.maxSpeedKmh).toBeGreaterThan(75);
    expect(result.provenance.filtersApplied).not.toContain("speed_outlier");
    expect(result.diagnostics.speed).toMatchObject({
      speedOutlierCount: 0,
      thresholds: {
        speedReliabilityProfile: "unknown",
        speedReliabilityProfileSource: "cleaning_profile",
        maxReliableSpeedKmh: null
      }
    });
  });

  it("drops points whose timestamps move backwards inside one segment", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z")),
      point(1, 1, 50, new Date("2024-05-25T08:00:30.000Z")),
      point(0, 0.002, 14, new Date("2024-05-25T08:02:00.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("time_order");
    expect(result.provenance.filtersApplied).not.toContain("gps_jump");
    expect(result.distanceSeries).toHaveLength(3);
    expect(result.totalDistanceMeters).toBeGreaterThan(220);
    expect(result.totalDistanceMeters).toBeLessThan(225);
  });

  it("drops coordinate conflicts with the same timestamp before jump filtering", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z")),
      point(1, 1, 50, new Date("2024-05-25T08:01:00.000Z")),
      point(0, 0.002, 14, new Date("2024-05-25T08:02:00.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("time_order");
    expect(result.provenance.filtersApplied).not.toContain("gps_jump");
    expect(result.distanceSeries).toHaveLength(3);
    expect(result.speedSeries).toHaveLength(2);
    expect(result.totalDistanceMeters).toBeGreaterThan(220);
    expect(result.totalDistanceMeters).toBeLessThan(225);
  });

  it("drops points with coordinates outside geographic bounds before metrics", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(91, 0.001, 99, new Date("2024-05-25T08:01:00.000Z")),
      point(0, 0.002, 12, new Date("2024-05-25T08:02:00.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("invalid_coordinates");
    expect(result.distanceSeries).toHaveLength(2);
    expect(result.totalDistanceMeters).toBeGreaterThan(220);
    expect(result.totalDistanceMeters).toBeLessThan(225);
    expect(result.maxSpeedKmh).toBeLessThan(7);
  });

  it("drops isolated zero-coordinate fixes without treating the next point as a jump", () => {
    const result = analyzeTrack([
      point(55, 37, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0, 99, new Date("2024-05-25T08:01:00.000Z")),
      point(55.001, 37.001, 12, new Date("2024-05-25T08:02:00.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(1);
    expect(result.provenance.filtersApplied).toContain("null_island");
    expect(result.provenance.filtersApplied).not.toContain("gps_jump");
    expect(result.distanceSeries).toHaveLength(2);
    expect(result.totalDistanceMeters).toBeGreaterThan(125);
    expect(result.totalDistanceMeters).toBeLessThan(130);
  });

  it("drops low-quality GNSS points and reports quality thresholds", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      {
        ...point(0, 0.001, 50, new Date("2024-05-25T08:01:00.000Z")),
        satellites: 2
      },
      {
        ...point(0, 0.002, 12, new Date("2024-05-25T08:02:00.000Z")),
        hdop: 9
      },
      point(0, 0.003, 14, new Date("2024-05-25T08:03:00.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(2);
    expect(result.provenance.filtersApplied).toContain("bad_fix");
    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      minSatellites: 4,
      hardMinSatellites: 3,
      maxPdop: 6,
      maxHdop: 5,
      hardMaxHdop: 8,
      maxVdop: 8,
      hardSpeedCeilingMps: 50
    });
    expect(result.distanceSeries).toHaveLength(2);
    expect(result.totalDistanceMeters).toBeGreaterThan(330);
    expect(result.totalDistanceMeters).toBeLessThan(335);
  });

  it("keeps soft GNSS quality fallback points and reports warnings", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      {
        ...point(0, 0.001, 50, new Date("2024-05-25T08:01:00.000Z")),
        satellites: 3
      },
      {
        ...point(0, 0.002, 12, new Date("2024-05-25T08:02:00.000Z")),
        hdop: 6
      },
      point(0, 0.003, 14, new Date("2024-05-25T08:03:00.000Z"))
    ]);

    expect(result.provenance.pointsRemoved).toBe(0);
    expect(result.provenance.filtersApplied).not.toContain("bad_fix");
    expect(result.provenance.confidenceFlags).toContain("gnss_quality_soft_warning");
    expect(result.diagnostics.cleaning.qualityWarnings).toHaveLength(2);
    expect(result.diagnostics.cleaning.qualityWarnings.map((warning) => warning.reason)).toEqual([
      "low_satellites",
      "high_hdop"
    ]);
    expect(result.distanceSeries).toHaveLength(4);
  });

  it("handles tracks without elevation or time", () => {
    const result = analyzeTrack([point(43.1, 42.1), point(43.101, 42.102)]);

    expect(result.totalDistanceMeters).toBeGreaterThan(190);
    expect(result.totalDurationSeconds).toBeNull();
    expect(result.averageSpeedKmh).toBeNull();
    expect(result.elevationGainMeters).toBeNull();
    expect(result.elevationLossMeters).toBeNull();
    expect(result.minElevationMetersRaw).toBeNull();
    expect(result.maxElevationMetersRaw).toBeNull();
    expect(result.summary.minElevationMetersRaw).toBeNull();
    expect(result.summary.maxElevationMetersRaw).toBeNull();
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.confidence.level).toBe("low");
    expect(result.diagnostics.elevation.fusion).toMatchObject({
      cleanup: {
        endpointSpikeReplacementCount: 0
      },
      endpointSpikeReplacementCount: 0,
      preResampleEndpointSpikeReplacementCount: 0,
      postResampleEndpointSpikeReplacementCount: 0,
      endpointSpikeReplacementSourceIndexes: []
    });
  });

  it("keeps raw elevation provenance for raw-mode tracks without elevation", () => {
    const result = analyzeTrack([point(43.1, 42.1), point(43.101, 42.102)], {
      mode: "recomputed_raw"
    });

    expect(result.diagnostics.elevation.filtersApplied).toEqual(["raw_elevation"]);
    expect(result.provenance.filtersApplied).toContain("raw_elevation");
    expect(result.diagnostics.elevation.fusion.cleanup).toMatchObject({
      endpointSpikeReplacementCount: 0
    });
  });

  it("uses route-plan model thresholds for untimed planned routes", () => {
    const result = analyzeTrack([
      point(43.1, 42.1, 100),
      point(43.101, 42.101, 100.25),
      point(43.102, 42.102, 100),
      point(43.103, 42.103, 100.25),
      point(43.104, 42.104, 100)
    ]);

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    const activityAssessment = requireValue(
      result.diagnostics.elevation.activityAssessment,
      "activityAssessment"
    );
    expect(activityAssessment.inferred).toBe("route_plan");
    expect(activityAssessment.reasonCodes).toContain("no_timestamps");
    expect(result.elevationGainMeters).toBeLessThanOrEqual(0.5);
    expect(result.elevationLossMeters).toBeLessThanOrEqual(0.5);
    expect(result.minElevationMetersRaw).toBe(100);
    expect(result.maxElevationMetersRaw).toBe(100.25);
  });

  it("surfaces model filtered extrema and raw extrema from elevation analysis", () => {
    const result = analyzeTrack(
      [100, 101, 102, 180, 103, 104, 105].map((elevation, index) =>
        timedPoint(55 + index * 0.0001, 37, elevation, index * 10)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.maxElevationMeters).toBeLessThan(120);
    expect(result.maxElevationMetersRaw).toBe(180);
    expect(result.summary.maxElevationMetersRaw).toBe(180);
    expect(result.elevationRangeMeters).toBeCloseTo(
      requireValue(result.maxElevationMeters, "maxElevationMeters") -
        requireValue(result.minElevationMeters, "minElevationMeters")
    );
  });

  it("filters elevation noise using confirmed elevation turns", () => {
    const result = analyzeTrack([
      timedPoint(43.1, 42.1, 100, 0),
      timedPoint(43.101, 42.101, 97, 60),
      timedPoint(43.102, 42.102, 95, 120),
      timedPoint(43.103, 42.103, 92, 180),
      timedPoint(43.104, 42.104, 96.2, 240),
      timedPoint(43.105, 42.105, 93, 300),
      timedPoint(43.106, 42.106, 89, 360),
      timedPoint(43.107, 42.107, 93, 420),
      timedPoint(43.108, 42.108, 88, 480),
      timedPoint(43.109, 42.109, 80, 540)
    ]);

    if (result.elevationGainMeters === null || result.elevationLossMeters === null) {
      throw new Error("Expected elevation totals to be available");
    }

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.filtersApplied).toContain("confirmed_elevation_turns");
    expect(result.elevationGainMeters).toBeLessThan(10);
    expect(result.elevationLossMeters).toBeGreaterThan(15);
    expect(result.elevationGainMeters - result.elevationLossMeters).toBeCloseTo(-20, 0);
  });

  it("bounds noisy GPS altitude with gain model thresholds", () => {
    const filteredProfile = [
      142.85, 126.67, 141.71, 121.72, 138.93, 106.78, 125.39, 96.06, 117.51, 67.39, 84.15, 75.91
    ];
    const result = analyzeTrack(
      noisyElevationSeries(filteredProfile).map((elevation, index) =>
        timedPoint(43.1 + index * 0.0001, 42.1, elevation, index * 30)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.gainModel.medianThresholdMeters).toBeGreaterThan(0);
    expect(result.elevationGainMeters).toBeLessThan(100);
    expect(result.elevationLossMeters).toBeGreaterThan(120);
  });

  it("keeps moderate GPS noise with rare spikes near the user-facing elevation shape", () => {
    const result = analyzeTrack(
      moderateNoiseWithTailSpikes([100, 140, 110, 160, 120]).map((elevation, index) =>
        timedPoint(43.1 + index * 0.00001, 42.1, elevation, index * 10)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.filtersApplied).toContain("distance_domain_fusion");
    expect(result.elevationGainMeters).toBeGreaterThan(80);
    expect(result.elevationGainMeters).toBeLessThan(115);
    expect(result.elevationLossMeters).toBeGreaterThan(60);
    expect(result.elevationLossMeters).toBeLessThan(85);
  });

  it("keeps strongly directional low-noise descents loss-dominant", () => {
    const result = analyzeTrack(
      directionalDescentSeries().map((elevation, index) =>
        timedPoint(55 + index * 0.0001, 37, elevation, index * 10)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.elevationGainMeters).toBeLessThan(50);
    expect(result.elevationLossMeters).toBeGreaterThan(150);
  });

  it("uses smoothed directional totals when they reduce counter-direction chatter", () => {
    const result = analyzeTrack(
      directionalDescentWithCounterSpike().map((elevation, index) =>
        timedPoint(55 + index * 0.0001, 37, elevation, index * 10)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.elevationGainMeters).toBeLessThan(15);
    expect(result.elevationLossMeters).toBeGreaterThan(55);
  });

  it("smooths compact low-relief loop tracks before counting elevation turns", () => {
    const result = analyzeTrack(
      compactLowReliefLoopSeries().map((elevation, index) =>
        timedPoint(55 + index * 0.0001, 37, elevation, index * 10)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.elevationGainMeters).toBeGreaterThan(40);
    expect(result.elevationGainMeters).toBeLessThan(55);
    expect(result.elevationLossMeters).toBeGreaterThan(45);
    expect(result.elevationLossMeters).toBeLessThan(65);
  });

  it("uses a wider smoothing window for wider compact low-relief loops", () => {
    const result = analyzeTrack(
      compactLowReliefLoopSeries(1.4).map((elevation, index) =>
        timedPoint(55 + index * 0.0001, 37, elevation, index * 10)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.elevationGainMeters).toBeGreaterThan(55);
    expect(result.elevationGainMeters).toBeLessThan(80);
    expect(result.elevationLossMeters).toBeGreaterThan(65);
    expect(result.elevationLossMeters).toBeLessThan(90);
  });

  it("keeps isolated altitude spikes on long low-noise river profiles bounded", () => {
    const result = analyzeTrack(
      longLowNoiseRiverSeries().map((elevation, index) =>
        timedPoint(55 + index * 0.00001, 37, elevation, index * 10)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.filtersApplied).toContain("distance_domain_fusion");
    expect(result.elevationGainMeters).toBeLessThan(350);
    expect(result.elevationLossMeters).toBeLessThan(400);
  });

  it("keeps low-relief GPS altitude chatter on long touring tracks bounded", () => {
    const result = analyzeTrack(
      longLowReliefNoisyTouringSeries().map((elevation, index) =>
        timedPoint(45 + index * 0.00001, 36, elevation, index * 5)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.filtersApplied).toContain("confirmed_elevation_turns");
    expect(result.diagnostics.elevation.gainModel.minSustainedDistanceMeters).toBeGreaterThan(0);
    expect(result.elevationGainMeters).toBeLessThan(1700);
    expect(result.elevationLossMeters).toBeLessThan(1700);
  });

  it("keeps water-like noisy descent from becoming thousands of meters of ascent", () => {
    const result = analyzeTrack(
      noisyDirectionalDescentSeries().map((elevation, index) =>
        timedPoint(55 + index * 0.00001, 37, elevation, index * 3)
      )
    );

    const activityAssessment = requireValue(
      result.diagnostics.elevation.activityAssessment,
      "activityAssessment"
    );
    expect(activityAssessment.inferred).toBe("water");
    expect(result.diagnostics.elevation.gainModel.minSustainedDistanceMeters).toBe(300);
    expect(result.elevationGainMeters).toBeLessThan(500);
    expect(result.elevationLossMeters).toBeGreaterThan(500);
  });

  it("keeps high-relief paused hikes continuous in model diagnostics", () => {
    const anchors = [100, 180, 140, 230, 170, 260, 210];
    const points = [];
    let secondsFromStart = 0;
    let pointIndex = 0;

    for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
      const start = anchors[anchorIndex];
      const end = anchors[anchorIndex + 1];

      for (let offset = 0; offset < 50; offset += 1) {
        const elevation = start + ((end - start) * offset) / 50;

        points.push(timedPoint(55 + pointIndex * 0.00001, 37, elevation, secondsFromStart));
        secondsFromStart += 10;
        pointIndex += 1;

        if (pointIndex % 10 === 0) {
          secondsFromStart += 80;
        }
      }
    }

    points.push(timedPoint(55 + pointIndex * 0.00001, 37, anchors.at(-1), secondsFromStart));

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.timeGapBreakCount).toBeGreaterThanOrEqual(20);
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.fusion.continuousRunCount).toBe(1);
    expect(
      requireValue(result.maxElevationMetersRaw, "maxElevationMetersRaw") -
        requireValue(result.minElevationMetersRaw, "minElevationMetersRaw")
    ).toBeGreaterThan(150);
    expect(result.elevationGainMeters).toBeGreaterThan(200);
    expect(result.elevationLossMeters).toBeGreaterThan(100);
  });

  it("keeps plausible fragmented time gaps in one elevation model run", () => {
    const points = [];
    let secondsFromStart = 0;
    let pointIndex = 0;

    for (let blockIndex = 0; blockIndex < 25; blockIndex += 1) {
      const baseElevation = 100 + blockIndex * 2;

      for (const elevation of [
        baseElevation,
        baseElevation + 11,
        baseElevation + 10,
        baseElevation - 1,
        baseElevation
      ]) {
        points.push(timedPoint(55 + pointIndex * 0.00001, 37, elevation, secondsFromStart));
        secondsFromStart += 10;
        pointIndex += 1;
      }

      secondsFromStart += 70;
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.timeGapBreakCount).toBeGreaterThanOrEqual(20);
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.fusion.continuousRunCount).toBe(1);
    expect(result.diagnostics.elevation.segmentation).toHaveLength(1);
    expect(result.diagnostics.elevation.gainModel.medianThresholdMeters).toBeGreaterThan(0);
  });

  it("keeps explicit GPX segment breaks in fragmented elevation mode", () => {
    const points = [];
    let secondsFromStart = 0;
    let pointIndex = 0;

    for (let blockIndex = 0; blockIndex < 21; blockIndex += 1) {
      points.push(timedPoint(55 + pointIndex * 0.00001, 37, 100, secondsFromStart));
      secondsFromStart += 10;
      pointIndex += 1;
      points.push(timedPoint(55 + pointIndex * 0.00001, 37, 100, secondsFromStart));
      pointIndex += 1;

      if (blockIndex < 20) {
        secondsFromStart += 80;
      } else {
        secondsFromStart += 10;
      }
    }

    points.push({
      ...timedPoint(55.1, 37, 200, secondsFromStart),
      segmentIndex: 1
    });
    secondsFromStart += 10;
    pointIndex += 1;
    points.push({
      ...timedPoint(55.10001, 37, 200, secondsFromStart),
      segmentIndex: 1
    });

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.timeGapBreakCount).toBeGreaterThanOrEqual(20);
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.fusion.continuousRunCount).toBeGreaterThan(1);
    expect(result.elevationGainMeters).toBe(0);
    expect(result.elevationLossMeters).toBe(0);
  });

  it("keeps continuous technical segment splits bounded in fragmented elevation mode", () => {
    const points = [];
    let secondsFromStart = 0;
    let pointIndex = 0;

    for (let blockIndex = 0; blockIndex < 21; blockIndex += 1) {
      points.push(timedPoint(55 + pointIndex * 0.00001, 37, 100, secondsFromStart));
      secondsFromStart += 10;
      pointIndex += 1;
      points.push(timedPoint(55 + pointIndex * 0.00001, 37, 100, secondsFromStart));
      pointIndex += 1;

      if (blockIndex < 20) {
        secondsFromStart += 80;
      } else {
        secondsFromStart += 10;
      }
    }

    points.push({
      ...timedPoint(55 + pointIndex * 0.00001, 37, 200, secondsFromStart),
      segmentIndex: 1
    });
    secondsFromStart += 10;
    pointIndex += 1;
    points.push({
      ...timedPoint(55 + pointIndex * 0.00001, 37, 200, secondsFromStart),
      segmentIndex: 1
    });

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.timeGapBreakCount).toBeGreaterThanOrEqual(20);
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.fusion.continuousRunCount).toBeGreaterThan(1);
    expect(
      requireValue(result.maxElevationMetersRaw, "maxElevationMetersRaw") -
        requireValue(result.minElevationMetersRaw, "minElevationMetersRaw")
    ).toBe(100);
    expect(result.elevationGainMeters).toBeGreaterThanOrEqual(0);
    expect(result.elevationLossMeters).toBe(0);
  });

  it("keeps model diagnostics for raw mode with inferred time gaps", () => {
    const points = [];
    let secondsFromStart = 0;
    let pointIndex = 0;

    for (let blockIndex = 0; blockIndex < 25; blockIndex += 1) {
      const elevation = blockIndex % 2 === 0 ? 100 : 110;

      points.push(timedPoint(55 + pointIndex * 0.00001, 37, elevation, secondsFromStart));
      secondsFromStart += 10;
      pointIndex += 1;
      points.push(timedPoint(55 + pointIndex * 0.00001, 37, elevation, secondsFromStart));
      secondsFromStart += 80;
      pointIndex += 1;
    }

    const result = analyzeTrack(points, { mode: "recomputed_raw" });

    expect(result.diagnostics.continuity.timeGapBreakCount).toBeGreaterThanOrEqual(20);
    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.profileNames).toEqual(["distance_domain_fused_profile"]);
    expect(result.elevationGainMeters).toBeLessThanOrEqual(120);
    expect(result.elevationLossMeters).toBeLessThanOrEqual(120);
  });

  it("smooths terrain-restored elevation steps before applying the turn threshold", () => {
    const result = analyzeTrack(
      [100, 100, 112, 100, 100, 112, 112, 112, 100, 100].map((elevation, index) => ({
        ...timedPoint(55 + index * 0.0001, 37, elevation, index * 10),
        elevationSource: "terrain"
      }))
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    const sourceAssessment = requireValue(
      result.diagnostics.elevation.sourceAssessment,
      "sourceAssessment"
    );
    expect(sourceAssessment.primaryAbsoluteSource).toBe("terrain");
    expect(result.elevationGainMeters).toBeCloseTo(12, 0);
    expect(result.elevationLossMeters).toBeCloseTo(12, 0);
  });

  it("lowers the elevation turn threshold for low-noise timed tracks", () => {
    const elevations = Array.from({ length: 10 }).flatMap(() => [0, 0.5, 1, 1.5, 1, 0.5, 0]);
    const result = analyzeTrack(
      elevations.map((elevation, index) =>
        timedPoint(43.1 + index * 0.0001, 42.1, elevation, index * 30)
      )
    );

    expect(result.diagnostics.elevation.modelVersion).toBe(1);
    expect(result.diagnostics.elevation.gainModel.medianThresholdMeters).toBeGreaterThan(0);
    expect(result.elevationGainMeters).toBeLessThanOrEqual(15);
    expect(result.elevationLossMeters).toBeLessThanOrEqual(15);
  });

  it("uses available timed point pairs instead of suppressing all speed data", () => {
    const result = analyzeTrack([
      point(43.1, 42.1, 620, new Date("2024-05-25T08:00:00.000Z")),
      point(43.101, 42.102, 630, new Date("2024-05-25T08:05:00.000Z")),
      point(43.102, 42.103, 635, null),
      point(43.103, 42.104, 640, new Date("2024-05-25T08:12:00.000Z"))
    ]);

    expect(result.totalDurationSeconds).toBe(720);
    expect(result.speedSeries).toHaveLength(1);
    expect(result.movingDurationSeconds).toBe(300);
    expect(result.averageSpeedKmh).toBeGreaterThan(0);
  });

  it("reports max speed from cleaned raw segment speeds instead of smoothed chart samples", () => {
    const result = analyzeTrack([
      timedPointAtMeters(0, 0),
      timedPointAtMeters(27.7777778, 10),
      timedPointAtMeters(55.5555556, 20),
      timedPointAtMeters(138.888889, 30),
      timedPointAtMeters(166.666667, 40),
      timedPointAtMeters(194.444444, 50)
    ]);

    expect(Math.max(...result.speedSeries.map((sample) => sample.speedKmh))).toBeLessThan(20);
    expect(result.maxSpeedKmh).toBeCloseTo(30, 1);
    expect(result.summary.maxSpeedKmh).toBeCloseTo(30, 1);
  });

  it("flags sparse recording mode for widely spaced timed points", () => {
    const result = analyzeTrack([
      point(43.1, 42.1, 620, new Date("2024-05-25T08:00:00.000Z")),
      point(43.101, 42.101, 625, new Date("2024-05-25T08:01:30.000Z")),
      point(43.102, 42.102, 630, new Date("2024-05-25T08:03:00.000Z")),
      point(43.103, 42.103, 635, new Date("2024-05-25T08:04:30.000Z"))
    ]);

    expect(result.diagnostics.sampling).toMatchObject({
      recordingMode: "sparse",
      nominalIntervalSeconds: 90,
      timedPointCount: 4
    });
    expect(result.confidenceFlags).toContain("sampling_sparse");
    expect(result.provenance.confidenceFlags).toContain("sampling_sparse");
  });

  it("flags inferred timezone when GPX times do not include an explicit offset", () => {
    const result = analyzeTrack([
      {
        ...point(43.1, 42.1, 620, new Date("2024-05-25T08:00:00.000Z")),
        timeText: "2024-05-25T08:00:00",
        timeZoneStatus: "missing"
      },
      {
        ...point(43.101, 42.101, 625, new Date("2024-05-25T08:01:00.000Z")),
        timeText: "2024-05-25T08:01:00Z",
        timeZoneStatus: "explicit"
      }
    ]);

    expect(result.diagnostics.temporal).toMatchObject({
      timeZoneConfidence: "low",
      timeZoneMissingPointCount: 1,
      timeZoneExplicitPointCount: 1
    });
    expect(result.confidenceFlags).toContain("tz_inferred");
    expect(result.provenance.confidenceFlags).toContain("tz_inferred");
  });

  it("uses filtered moving time for segments above walking drift", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.0045, 10, new Date("2024-05-25T08:20:00.000Z")),
      point(0, 0.0135, 10, new Date("2024-05-25T08:26:40.000Z"))
    ]);

    expect(result.movingDurationSeconds).toBe(1600);
    expect(result.movingAverageSpeedKmh).toBeGreaterThan(3);
    expect(result.movingAverageSpeedKmh).toBeLessThan(4);
  });

  it("requires sustained movement before counting moving time", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.00054, 10, new Date("2024-05-25T08:03:00.000Z")),
      point(0, 0.00504, 10, new Date("2024-05-25T08:08:00.000Z"))
    ]);

    expect(result.movingDurationSeconds).toBe(300);
    expect(result.diagnostics.moving.thresholds).toMatchObject({
      onSpeedKmh: 1.5,
      offSpeedKmh: 0.8
    });
  });

  it("uses slow speed profile moving thresholds for deliberate low-speed tracks", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.001, 10, new Date("2024-05-25T08:05:00.000Z"))
      ],
      { speedProfile: "slow" }
    );

    expect(result.movingDurationSeconds).toBe(300);
    expect(result.diagnostics.moving.thresholds).toMatchObject({
      speedProfile: "slow",
      onSpeedKmh: 1.2,
      offSpeedKmh: 0.5
    });
  });

  it("uses Basecamp-like moving hysteresis for inferred slow hikes", () => {
    const speedsKmh = [2, 1.2, 0.79, 2, 2, 2];
    const durations = [10, 10, 30, 10, 10, 10];
    const points = [timedPointAtMeters(0, 0)];
    let distanceMeters = 0;
    let secondsFromStart = 0;

    for (let index = 0; index < speedsKmh.length; index += 1) {
      distanceMeters += (speedsKmh[index] / 3.6) * durations[index];
      secondsFromStart += durations[index];
      points.push(timedPointAtMeters(distanceMeters, secondsFromStart));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "slow",
      speedProfileSource: "inferred"
    });
    expect(result.diagnostics.moving.thresholds).toMatchObject({
      speedProfile: "slow",
      onSpeedKmh: 1.5,
      offSpeedKmh: 0.8
    });
    expect(result.movingDurationSeconds).toBe(50);
  });

  it("counts sustained slow progress below the old moving-on speed as moving time", () => {
    const points = [];

    for (let index = 0; index <= 30; index += 1) {
      points.push(timedPointAtMeters(index * 4, index * 20));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.moving.thresholds).toMatchObject({
      onSpeedKmh: 1.5,
      offSpeedKmh: 0.8
    });
    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBe(0);
    expect(result.totalDistanceMeters).toBeCloseTo(120);
    expect(result.movingDurationSeconds).toBe(600);
  });

  it("counts very slow directed progress when the rolling window has enough displacement", () => {
    const points = [];

    for (let index = 0; index <= 30; index += 1) {
      points.push(timedPointAtMeters(index * 2, index * 20));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBe(0);
    expect(result.totalDistanceMeters).toBeCloseTo(60);
    expect(result.movingDurationSeconds).toBe(600);
  });

  it("counts directed low-speed progress with small backsteps as moving time", () => {
    const offsetsMeters = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17, 20];
    const points = offsetsMeters.map((distanceMeters, index) =>
      timedPointAtMeters(distanceMeters, index * 20)
    );

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBeGreaterThan(0);
    expect(result.movingDurationSeconds).toBeGreaterThanOrEqual(200);
    expect(result.movingDurationSeconds).toBeLessThanOrEqual(380);
  });

  it("keeps stationary low-speed GPS drift stopped even when jitter accumulates", () => {
    const points = [];

    for (let index = 0; index <= 30; index += 1) {
      const offsetMeters = index % 2 === 0 ? 2 : -2;
      points.push(timedPointAtMeters(offsetMeters, index * 20));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBe(30);
    expect(result.diagnostics.continuity.routeXyJitterSegmentCount).toBe(30);
    expect(result.totalDistanceMeters).toBe(0);
    expect(result.movingDurationSeconds).toBeNull();
  });

  it("keeps broader bounded low-speed GPS wander stopped", () => {
    const points = [];
    const offsetsMeters = [-8, -6, -4, -2, 0, 2, 4, 6, 8, 6, 4, 2, 0, -2, -4, -6];

    for (let index = 0; index <= 30; index += 1) {
      points.push(timedPointAtMeters(offsetsMeters[index % offsetsMeters.length], index * 20));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBeGreaterThan(0);
    expect(result.totalDistanceMeters).toBeLessThan(20);
    expect(result.movingDurationSeconds).toBeNull();
  });

  it("keeps wider reversing low-speed GPS oscillation stopped", () => {
    const points = [];
    const offsetsMeters = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 8, 6, 4, 2, 0, -2, -4, -6, -8];

    for (let index = 0; index <= 40; index += 1) {
      points.push(timedPointAtMeters(offsetsMeters[index % offsetsMeters.length], index * 20));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBeGreaterThan(0);
    expect(result.totalDistanceMeters).toBeLessThan(30);
    expect(result.movingDurationSeconds).toBeNull();
  });

  it("keeps wider reversing stationary GPS oscillation stopped", () => {
    const points = [];
    const offsetsMeters = [
      -11, -9, -7, -5, -3, -1, 1, 3, 5, 7, 9, 11, 9, 7, 5, 3, 1, -1, -3, -5, -7, -9
    ];

    for (let index = 0; index <= 44; index += 1) {
      points.push(timedPointAtMeters(offsetsMeters[index % offsetsMeters.length], index * 20));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBeGreaterThan(0);
    expect(result.totalDistanceMeters).toBeLessThan(35);
    expect(result.movingDurationSeconds).toBeNull();
  });

  it("keeps long reversing stationary GPS oscillation stopped", () => {
    const points = [];
    const offsetsMeters = [
      -11, -9, -7, -5, -3, -1, 1, 3, 5, 7, 9, 11, 9, 7, 5, 3, 1, -1, -3, -5, -7, -9
    ];

    for (let index = 0; index < 151; index += 1) {
      points.push(timedPointAtMeters(offsetsMeters[index % offsetsMeters.length], index * 20));
    }

    const result = analyzeTrack(points);

    expect(result.diagnostics.continuity.xyJitterSegmentCount).toBeGreaterThan(0);
    expect(result.movingDurationSeconds).toBeNull();
  });

  it("treats inherited property names as unknown speed profiles", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.001, 10, new Date("2024-05-25T08:01:00.000Z"))
      ],
      { speedProfile: "toString" }
    );

    expect(result.movingDurationSeconds).toBe(60);
    expect(result.diagnostics.cleaning.thresholds).toMatchObject({
      speedProfile: "unknown",
      adaptiveSpeedCeilingMps: 50
    });
    expect(result.diagnostics.moving.thresholds).toMatchObject({
      speedProfile: "unknown",
      onSpeedKmh: 1.5,
      offSpeedKmh: 0.8
    });
  });

  it("uses total distance over moving time when no speed samples are filtered", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.009, 10, new Date("2024-05-25T08:10:00.000Z")),
      point(0, 0.0095, 10, new Date("2024-05-25T08:20:00.000Z")),
      point(0, 0.0185, 10, new Date("2024-05-25T08:30:00.000Z"))
    ]);

    expect(result.diagnostics.speed.speedOutlierCount).toBe(0);
    expect(result.movingDurationSeconds).toBe(1200);
    expect(result.movingAverageSpeedKmh).toBeCloseTo((result.totalDistanceMeters / 1200) * 3.6);
    expect(result.movingAverageSpeedKmh).toBeGreaterThan(6.1);
  });

  it("uses explicit timer events for moving time before speed hysteresis", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.0002, 10, new Date("2024-05-25T08:05:00.000Z")),
        point(0, 0.0004, 10, new Date("2024-05-25T08:10:00.000Z")),
        point(0, 0.0006, 10, new Date("2024-05-25T08:15:00.000Z")),
        point(0, 0.0008, 10, new Date("2024-05-25T08:20:00.000Z"))
      ],
      {
        timerEvents: [
          { timestamp: "2024-05-25T08:05:00.000Z", eventType: "stop_all" },
          { timestamp: "2024-05-25T08:18:00.000Z", eventType: "start" }
        ]
      }
    );

    expect(result.movingDurationSeconds).toBe(420);
    expect(result.stoppedDurationSeconds).toBe(780);
    expect(result.diagnostics.moving).toMatchObject({
      source: "timer_events",
      timerEvents: {
        eventCount: 2,
        recognizedEventCount: 2,
        intervalCount: 2
      }
    });
    expect(result.provenance.filtersApplied).toContain("moving_time_timer_events");
    expect(result.provenance.filtersApplied).not.toContain("moving_time_hysteresis");
    expect(result.provenance.confidenceFlags).toContain("moving_time_timer_events");
    expect(result.provenance.confidenceFlags).not.toContain("moving_time_heuristic");
  });

  it("clips timer-event moving time to continuous spans", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.001, 12, new Date("2024-05-25T08:00:10.000Z")),
        point(0, 0.101, 40, new Date("2024-05-25T09:00:00.000Z")),
        point(0, 0.102, 42, new Date("2024-05-25T09:00:10.000Z"))
      ],
      {
        timerEvents: [
          { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
          { timestamp: "2024-05-25T09:00:10.000Z", eventType: "stop_all" }
        ]
      }
    );

    expect(result.totalDurationSeconds).toBe(3610);
    expect(result.movingDurationSeconds).toBe(20);
    expect(result.stoppedDurationSeconds).toBe(3590);
    expect(result.movingDurationSeconds).toBeLessThanOrEqual(result.totalDurationSeconds ?? 0);
    expect(result.diagnostics.moving).toMatchObject({
      source: "timer_events",
      timerEvents: {
        eventCount: 2,
        recognizedEventCount: 2,
        intervalCount: 2
      }
    });
  });

  it("clips timer-event moving time to explicit source segments", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.001, 12, new Date("2024-05-25T08:01:00.000Z")),
        { ...point(1, 1, 20, new Date("2024-05-25T09:00:00.000Z")), segmentIndex: 1 },
        { ...point(1, 1.001, 22, new Date("2024-05-25T09:01:00.000Z")), segmentIndex: 1 }
      ],
      {
        timerEvents: [
          { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
          { timestamp: "2024-05-25T09:01:00.000Z", eventType: "stop_all" }
        ]
      }
    );

    expect(result.totalDurationSeconds).toBe(120);
    expect(result.movingDurationSeconds).toBe(120);
    expect(result.stoppedDurationSeconds).toBe(0);
    expect(result.movingDurationSeconds).toBeLessThanOrEqual(result.totalDurationSeconds ?? 0);
    expect(result.diagnostics.moving.timerEvents?.intervalCount).toBe(2);
  });

  it("falls back to speed hysteresis when timer events are unusable", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.001, 10, new Date("2024-05-25T08:01:00.000Z"))
      ],
      {
        timerEvents: [{ timestamp: "2024-05-25T08:00:30.000Z", eventType: "lap" }]
      }
    );

    expect(result.movingDurationSeconds).toBe(60);
    expect(result.diagnostics.moving.source).toBe("hysteresis");
    expect(result.provenance.filtersApplied).toContain("moving_time_hysteresis");
    expect(result.provenance.confidenceFlags).toContain("moving_time_heuristic");
  });

  it("keeps explicit zero moving time from all-stopped timer events", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.01, 10, new Date("2024-05-25T08:05:00.000Z"))
      ],
      {
        timerEvents: [{ timestamp: "2024-05-25T08:00:00.000Z", eventType: "stop_all" }]
      }
    );

    expect(result.movingDurationSeconds).toBe(0);
    expect(result.stoppedDurationSeconds).toBe(300);
    expect(result.diagnostics.moving).toMatchObject({
      source: "timer_events",
      timerEvents: {
        eventCount: 1,
        recognizedEventCount: 1,
        intervalCount: 0
      }
    });
    expect(result.provenance.filtersApplied).toContain("moving_time_timer_events");
    expect(result.provenance.confidenceFlags).toContain("moving_time_timer_events");
  });

  it("ignores duplicate timer stops while already stopped", () => {
    const result = analyzeTrack(
      [
        point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
        point(0, 0.001, 10, new Date("2024-05-25T08:01:00.000Z")),
        point(0, 0.002, 10, new Date("2024-05-25T08:02:00.000Z")),
        point(0, 0.003, 10, new Date("2024-05-25T08:03:00.000Z")),
        point(0, 0.004, 10, new Date("2024-05-25T08:04:00.000Z")),
        point(0, 0.005, 10, new Date("2024-05-25T08:05:00.000Z"))
      ],
      {
        timerEvents: [
          { timestamp: "2024-05-25T08:01:00.000Z", eventType: "stop" },
          { timestamp: "2024-05-25T08:02:00.000Z", eventType: "stop_all" },
          { timestamp: "2024-05-25T08:04:00.000Z", eventType: "start" }
        ]
      }
    );

    expect(result.movingDurationSeconds).toBe(120);
    expect(result.diagnostics.moving.timerEvents?.intervalCount).toBe(2);
  });

  it("separates overall average speed from moving average speed", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.001, 10, new Date("2024-05-25T08:01:00.000Z")),
      point(0, 0.001, 10, new Date("2024-05-25T08:11:00.000Z"))
    ]);

    expect(result.totalDurationSeconds).toBe(660);
    expect(result.movingDurationSeconds).toBe(60);
    expect(result.stoppedDurationSeconds).toBe(600);
    expect(result.summary.stoppedDurationSeconds).toBe(600);
    expect(result.overallAverageSpeedKmh).toBeGreaterThan(0.5);
    expect(result.overallAverageSpeedKmh).toBeLessThan(0.7);
    expect(result.movingAverageSpeedKmh).toBeGreaterThan(6);
    expect(result.movingAverageSpeedKmh).toBeLessThan(7);
  });

  it("builds five kilometer segments", () => {
    const points = Array.from({ length: 55 }, (_, index) =>
      point(43.1 + index * 0.001, 42.1, 620, new Date(Date.UTC(2024, 4, 25, 8, index)))
    );

    const result = analyzeTrack(points);

    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.segments[0].index).toBe(1);
  });

  it("apportions sparse timed tracks across five kilometer segments", () => {
    const result = analyzeTrack([
      point(0, 0, 10, new Date("2024-05-25T08:00:00.000Z")),
      point(0, 0.089, 20, new Date("2024-05-25T09:00:00.000Z"))
    ]);

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].averageSpeedKmh).not.toBeNull();
    expect(result.segments[1].averageSpeedKmh).not.toBeNull();
    expect(result.segments[0].durationSeconds).toBeGreaterThan(1700);
    expect(result.segments[0].durationSeconds).toBeLessThan(1900);
    expect(result.segments[1].durationSeconds).toBeGreaterThan(1700);
    expect(result.segments[1].durationSeconds).toBeLessThan(1900);
  });
});
