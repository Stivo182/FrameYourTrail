/**
 * @param {{
 *   mode: string,
 *   points: unknown[],
 *   cleanedPoints: unknown[],
 *   cleaningDiagnostics: {
 *     inputPointCount: number,
 *     outputPointCount: number,
 *     pointsRemoved: number,
 *     filtersApplied: string[],
 *     confidenceFlags: string[],
 *     thresholds: {
 *       minSatellites: number,
 *       hardMinSatellites: number,
 *       maxPdop: number,
 *       maxHdop: number,
 *       hardMaxHdop: number,
 *       maxVdop: number,
 *       speedProfile: string,
 *       speedProfileSource: string,
 *       speedProfileConfidence: string,
 *       speedSignals: {
 *         speedSampleCount: number,
 *         medianSpeedMps: number | null,
 *         p75SpeedMps: number | null,
 *         p90SpeedMps: number | null,
 *         slowOutlierShare: number,
 *         moderateOutlierShare: number,
 *         fastOutlierShare: number
 *       },
 *       adaptiveSpeedCeilingMps: number,
 *       hardSpeedCeilingMps: number,
 *       speedProfileCeilingsMps: Record<string, number>,
 *       nullIslandContextDistanceMeters: number,
 *       headingFlipMaxDurationSeconds: number,
 *       headingFlipMinLegMeters: number,
 *       headingFlipMaxLegMeters: number,
 *       headingFlipReturnDistanceMeters: number,
 *       headingFlipMinTurnDegrees: number
 *     },
 *     qualityWarnings: {
 *       reason: string,
 *       latitude: number,
 *       longitude: number,
 *       timestamp: string | null
 *     }[]
 *   },
 *   speedDiagnostics: {
 *     rawSampleCount: number,
 *     reliableSampleCount: number,
 *     speedOutlierCount: number,
 *     speedOutlierSamples: object[],
 *     filtersApplied: string[],
 *     confidenceFlags: string[],
 *     thresholds: {
 *       speedReliabilityProfile: string,
 *       speedReliabilityProfileSource: string,
 *       speedReliabilitySignals: object,
 *       maxReliableSpeedMps: number | null,
 *       maxReliableSpeedKmh: number | null,
 *       speedOutlierDetailLimit: number,
 *       speedReliabilityWarnings?: string[]
 *     }
 *   },
 *   elevationDiagnostics: {
 *     modelVersion?: 1,
 *     decisionTrace?: object[],
 *     activityAssessment?: object | null,
 *     sourceAssessment?: object | null,
 *     segmentation?: object[],
 *     fusion?: {
 *       method: string,
 *       resampleStepMeters: number | null,
 *       outliersRemovedPct: number,
 *       cleanup?: {
 *         method: string,
 *         outliersRemovedPct: number,
 *         flags?: string[],
 *         endpointSpikeReplacementCount?: number
 *       },
 *       noise?: object,
 *       continuousRunCount: number,
 *       sampleCount: number,
 *       sourceSwitchCount?: number,
 *       runRanges?: object[],
 *       rawExtrema?: object,
 *       filteredExtrema?: object,
 *       endpointSpikeReplacementCount?: number,
 *       preResampleEndpointSpikeReplacementCount?: number,
 *       postResampleEndpointSpikeReplacementCount?: number,
 *       endpointSpikeReplacementSourceIndexes?: number[],
 *       preResampleInteriorOutlierReplacementCount?: number,
 *       preResampleInteriorOutlierReplacementSourceIndexes?: number[],
 *       preResampleSparseTailReplacementCount?: number,
 *       preResampleSparseTailReplacementSourceIndexes?: number[],
 *       flags?: string[]
 *     },
 *     gainModel?: {
 *       baseThresholdMeters: number | null,
 *       medianThresholdMeters: number | null,
 *       p95ThresholdMeters: number | null,
 *       minSustainedDistanceMeters: number | null,
 *       alpha?: number | null,
 *       profileSampleCount?: number
 *     },
 *     confidence?: {
 *       overall: number,
 *       gain: number,
 *       loss: number,
 *       extrema: number,
 *       level?: "high" | "medium" | "low",
 *       penalties?: { code: string, value: number }[]
 *     },
 *     flags?: string[],
 *     filtersApplied: string[],
 *     profileNames: string[],
 *     thresholds: { turnThresholdMeters: number | null },
 *     thresholdSweep: {
 *       kind?: string,
 *       thresholdMeters: number,
 *       elevationGainMeters: number,
 *       elevationLossMeters: number
 *     }[],
 *     confidenceFlags: string[]
 *   },
 *   continuityDiagnostics: {
 *     medianGapSeconds: number | null,
 *     timeGapThresholdSeconds: number | null,
 *     timeGapBreakCount: number,
 *     timeGapBreaks: { index: number, durationSeconds: number }[],
 *     movingTimeGapBridgeCount: number,
 *     movingTimeGapBridges: {
 *       index: number,
 *       durationSeconds: number,
 *       distanceMeters: number,
 *       speedKmh: number
 *     }[],
 *     continuousSegmentCount: number,
 *     continuousSegments: {
 *       index: number,
 *       startIndex: number,
 *       endIndex: number,
 *       pointCount: number,
 *       durationSeconds: number | null
 *     }[],
 *     xyJitterSegmentCount: number,
 *     routeXyJitterSegmentCount: number,
 *     xyJitterSegments: {
 *       index: number,
 *       distanceMeters: number,
 *       distanceFromAnchorMeters: number,
 *       durationSeconds: number
 *     }[],
 *     thresholds: {
 *       xyJitterDistanceMeters: number,
 *       xyJitterMaxSpeedKmh: number,
 *       routeXyJitterMinPairCount: number,
 *       routeXyJitterBoundedMinPairCount: number,
 *       routeXyJitterBoundedMaxSpanMeters: number,
 *       routeXyJitterBoundedMinShare: number,
 *       movingTimeGapBridgeMinMedianSeconds: number,
 *       movingTimeGapBridgeMaxSpeedKmh: number
 *     }
 *   },
 *   movingDiagnostics: {
 *     source?: string,
 *     filtersApplied: string[],
 *     confidenceFlags?: string[],
 *     thresholds?: {
 *       speedProfile: string,
 *       onSpeedKmh: number,
 *       offSpeedKmh: number,
 *       onDurationSeconds: number,
 *       offDurationSeconds: number
 *     },
 *     timerEvents?: {
 *       eventCount: number,
 *       recognizedEventCount: number,
 *       intervalCount: number
 *     }
 *   },
 *   temporalDiagnostics: {
 *     timeZoneConfidence: string,
 *     timeZoneExplicitPointCount: number,
 *     timeZoneMissingPointCount: number,
 *     timeZoneInvalidPointCount: number,
 *     timeZoneUnknownPointCount: number,
 *     confidenceFlags: string[]
 *   },
 *   samplingDiagnostics: {
 *     recordingMode: string,
 *     timedPointCount: number,
 *     intervalCount: number,
 *     nominalIntervalSeconds: number | null,
 *     maxIntervalSeconds: number | null,
 *     confidenceFlags: string[],
 *     thresholds: {
 *       denseMaxSeconds: number,
 *       regularMaxSeconds: number,
 *       smartMaxSeconds: number
 *     }
 *   },
 *   elevationSource: string,
 *   hasMovingTime: boolean,
 *   hasSegmentBreaks: boolean
 * }} input
 */
export function createAnalysisDiagnostics(input) {
  const confidenceFlags = [
    ...input.cleaningDiagnostics.confidenceFlags,
    ...input.speedDiagnostics.confidenceFlags,
    ...input.elevationDiagnostics.confidenceFlags,
    ...(input.movingDiagnostics.confidenceFlags ?? []),
    ...input.temporalDiagnostics.confidenceFlags,
    ...input.samplingDiagnostics.confidenceFlags
  ];

  if (input.hasSegmentBreaks) {
    addUnique(confidenceFlags, "segment_breaks_preserved");
  }

  if (input.continuityDiagnostics.timeGapBreakCount > 0) {
    addUnique(confidenceFlags, "time_gap_segments_preserved");
  }

  if (input.continuityDiagnostics.xyJitterSegmentCount > 0) {
    addUnique(confidenceFlags, "xy_jitter_suppressed");
  }

  const filtersApplied = [
    ...input.cleaningDiagnostics.filtersApplied,
    ...input.speedDiagnostics.filtersApplied,
    ...input.elevationDiagnostics.filtersApplied,
    ...input.movingDiagnostics.filtersApplied
  ];

  if (input.continuityDiagnostics.timeGapBreakCount > 0) {
    addUnique(filtersApplied, "time_gap_segmentation");
  }

  if (input.continuityDiagnostics.xyJitterSegmentCount > 0) {
    addUnique(filtersApplied, "xy_jitter_distance_threshold");
  }

  return {
    provenance: {
      mode: input.mode,
      inputPointCount: input.cleaningDiagnostics.inputPointCount,
      outputPointCount: input.cleaningDiagnostics.outputPointCount,
      pointsRemoved: input.cleaningDiagnostics.pointsRemoved,
      elevationSource: input.elevationSource,
      filtersApplied,
      confidenceFlags
    },
    diagnostics: {
      cleaning: input.cleaningDiagnostics,
      speed: input.speedDiagnostics,
      elevation: input.elevationDiagnostics,
      continuity: input.continuityDiagnostics,
      moving: input.movingDiagnostics,
      temporal: input.temporalDiagnostics,
      sampling: input.samplingDiagnostics
    },
    confidenceFlags
  };
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
