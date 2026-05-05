# Speed Calibration Notes

This document records the deliberate "magic" in route speed, moving-time, and
speed-sample reliability heuristics. These values are not physical constants.
They are calibration choices backed by product requirements, unit tests, and
representative route-analysis scenarios.

Point cleaning, speed reliability filtering, moving-time hysteresis, segment
timing, and speed-colored route rendering all consume these calibrations. The
elevation model has its own register in `docs/elevation-calibration.md`.

When changing any value below, update this document, `docs/product-spec.md` if
user-visible behavior changes, and the relevant regression tests.

## Profile Ceilings

Implementation: `src/core/speed-calibration.js`.

`SPEED_PROFILE_CEILINGS_MPS` is the shared source for speed-profile ceilings.
Point cleaning uses it to remove impossible route jumps. Speed reliability uses
the same profile ceilings to filter speed samples without deleting route points.

| Value                                                                                                                                                                                                           | Where                                                                        | Origin                                                    | Why                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slow profile ceiling `6 m/s` (`21.6 km/h`)                                                                                                                                                                      | `SPEED_PROFILE_CEILINGS_MPS.slow`                                            | Existing slow point-cleaning calibration.                 | Suppresses compressed walking-like speed samples while reusing the same calibrated ceiling as jump cleaning.                                                                                                                                                 |
| Moderate profile ceiling `10 m/s` (`36 km/h`)                                                                                                                                                                   | `SPEED_PROFILE_CEILINGS_MPS.moderate`                                        | Existing moderate point-cleaning calibration.             | Keeps ordinary faster outdoor movement while still treating larger one-second jumps as unreliable for moderate tracks.                                                                                                                                       |
| Fast profile ceiling `25 m/s` (`90 km/h`)                                                                                                                                                                       | `SPEED_PROFILE_CEILINGS_MPS.fast`                                            | Existing fast point-cleaning calibration.                 | Preserves genuinely fast sustained tracks while bounding extreme point-to-point jumps.                                                                                                                                                                       |
| Hard ceiling `50 m/s`                                                                                                                                                                                           | `HARD_SPEED_CEILING_MPS`                                                     | Hard safety guard.                                        | Caps unknown/unrestricted point cleaning without applying an extra analyzer reliability filter.                                                                                                                                                              |
| Inferred slow-profile fast corridor: minimum `4` pairs, minimum `3` over-profile pairs, near-fast ratio `0.7`, bridge speed ratio `0.5`, maximum `1` bridge pair, minimum directness `0.35`, maximum turn `75°` | `PROFILE_OUTLIER_CORRIDOR_*` in `src/core/track-profile-outlier-corridor.js` | Mixed-mode route regressions for auto-slow tracks.        | Keeps a smooth fast section as route geometry when the slow profile was inferred from the broader track, including one short below-near-fast dip, while isolated over-ceiling pairs, jumpy trajectories, and pairs above the hard ceiling are still removed. |
| Unit conversion `1 m/s = 3.6 km/h`                                                                                                                                                                              | `KMH_PER_MPS`, `speedMpsToKmh`, `nullableSpeedMpsToKmh`                      | Unit conversion.                                          | Keeps profile ceilings stored in source units while exposing user-facing speed diagnostics in km/h.                                                                                                                                                          |
| Unknown/unrestricted reliability ceiling `null`                                                                                                                                                                 | `getSpeedReliabilityCeilingMps` for `unknown` and `unrestricted`             | Preserve current fallback behavior for unsupported cases. | Unknown and unrestricted tracks should not receive an analyzer-only speed-sample cap beyond the point cleaning that already used the profile.                                                                                                                |

## Moving Time

Implementation: `src/core/track-calibration-constants.js`,
`src/core/track-moving-time.js`, `src/core/timer-event-types.js`,
`src/core/track-continuity.js`, and `src/core/track-slow-progress.js`.

Moving time uses hysteresis so small speed fluctuations do not rapidly toggle a
track between moving and stopped. `src/core/track-moving-time.js` exports the
moving threshold policy used by moving-time diagnostics.
`src/core/timer-event-types.js` owns FIT timer event classification consumed by
moving-time diagnostics.

| Value                                                                                                                                                                                                                                                                                                                                                                                                                                  | Where                                                           | Origin                                                         | Why                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default moving-on speed `1.5 km/h`, moving-off speed `0.8 km/h`                                                                                                                                                                                                                                                                                                                                                                        | `DEFAULT_MOVING_*` in `src/core/track-calibration-constants.js` | BaseCamp-like moving-time calibration for slow outdoor tracks. | Adds hysteresis so tiny GPS speed changes do not rapidly toggle moving/stopped.                                                                                                                                                                                                                                               |
| Moving-on duration `5 s`, moving-off duration `10 s`                                                                                                                                                                                                                                                                                                                                                                                   | `MOVING_*_DURATION_SECONDS`                                     | Moving-time hysteresis calibration.                            | A stop should be more stable than a start; short pauses or spikes should not dominate moving time.                                                                                                                                                                                                                            |
| Slow profile `1.2 / 0.5 km/h`, inferred slow `1.5 / 0.8 km/h`, fast/unrestricted `3 / 1.5 km/h`                                                                                                                                                                                                                                                                                                                                        | `MOVING_SPEED_THRESHOLDS_BY_PROFILE`                            | Product speed-profile calibration.                             | Explicit slow mode stays sensitive; inferred slow uses BaseCamp-like hysteresis while matching the default stopped threshold.                                                                                                                                                                                                 |
| Sparse time-gap moving bridge: median gap above `15 s`, pair speed at or above the active moving-on threshold and at or below `180 km/h`                                                                                                                                                                                                                                                                                               | `MOVING_TIME_GAP_BRIDGE_*` in `src/core/track-continuity.js`    | Smart/sparse recording calibration.                            | Lets lossy point-count reduction preserve plausible hidden movement across long adjacent-point intervals, while dense/regular recording gaps and impossible jumps remain discontinuities.                                                                                                                                     |
| Slow-progress window `300 s`, minimum duration `120 s`, minimum `4` pairs, minimum net speed `0.5 km/h`, or `0.15 km/h` with `12 m` net displacement; direction-quality guard of `3` dominant-axis reversals, minimum efficiency `0.45`, and maximum backtrack-to-net ratio `1` on windows and short segments up to `120` points; shifted broad horizon `900 s` with minimum efficiency `0.03` and maximum backtrack-to-net ratio `20` | `SLOW_PROGRESS_*`                                               | Slow outdoor-track moving-time calibration.                    | Counts sustained slow progress below the moving-on threshold while rejecting reversal-heavy windows or short continuous segments whose projected path is inefficient and whose backtracking is at least as large as net progress. The broad horizon catches long, low-net cyclic drift without scanning entire long segments. |

## Speed Reliability

Implementation: `src/core/speed-profile.js` and `src/core/track-series.js`.

Speed reliability filters distribution-incompatible speed samples from
user-facing speed outputs without deleting route geometry or changing canonical
route distance.

| Value                                                                                                                      | Where                                                | Origin                                          | Why                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Speed distribution reliability gates: min `8` samples, slow p10/p25/p50 `5 / 8 / 24 km/h`, moderate p25/p50 `15 / 30 km/h` | `SPEED_RELIABILITY_*` in `src/core/speed-profile.js` | Robust lower-percentile and median calibration. | Compressed timestamp runs can create a fast high tail; the median guard preserves sustained fast tracks with a slow start. |
| Maximum rejected share for inferred reliability `0.5`                                                                      | `SPEED_RELIABILITY_MAX_REJECTED_SHARE`               | Distribution safety guard.                      | Prevents inferring a conservative reliability profile when that profile would discard most available speed samples.        |
| Speed outlier detail limit `50`                                                                                            | `SPEED_OUTLIER_DETAIL_LIMIT`                         | Diagnostic payload guard.                       | Large noisy files should expose representative outliers without creating huge diagnostics.                                 |

The p10 and p25 gates use lower-rank samples to keep the low-speed evidence
conservative. The p50 gate uses the conventional median, averaging the two
middle samples for even-sized distributions, so a track split evenly between
slow and sustained fast movement does not get classified as slow.
Inferred reliability profiles also check the share of samples each profile would
reject; diagnostics expose `rejectedShareByProfile` and warnings such as
`slow_rejected_share_too_high` when a percentile match is too destructive.
When speed samples are rejected, elapsed and moving speed averages use the
remaining reliable speed-sample distance. This keeps speed outputs on one
distance scope while preserving `totalDistanceMeters` as the canonical route
geometry distance.

## Track Continuity And Diagnostics

Implementation: `src/core/track-analyzer.js`,
`src/core/track-calibration-constants.js`, `src/core/track-continuity.js`,
`src/core/track-series.js`, `src/core/track-time.js`, and
`src/core/track-segments.js`.

| Value                                                                          | Where                                                                                                                                             | Origin                       | Why                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XY jitter suppression `<= 5 m` and `<= 0.9 km/h`; route durable run `25` pairs | `XY_JITTER_*` and `isLowSpeedXyJitterSegment` in `src/core/track-calibration-constants.js`; `ROUTE_XY_JITTER_*` in `src/core/track-continuity.js` | Stationary GPS jitter guard. | Low-speed XY jitter is always removed from speed samples and activity speed evidence, but route distance suppresses only all-jitter spans, durable 25-pair jitter runs, and compact bounded stationary wander. The sustained slow-progress detector prevents short, slow, directed progress from being suppressed; short wobble next to real movement remains in route distance. |
| Dense/regular/smart recording intervals `2 s`, `15 s`, `60 s`                  | `*_RECORDING_MAX_SECONDS` in `src/core/track-time.js`                                                                                             | Recording-mode diagnostics.  | Distinguishes dense logs from sparse/smart logs for diagnostics and confidence flags.                                                                                                                                                                                                                                                                                            |
| Segment summary size `5000 m`                                                  | `SEGMENT_DISTANCE_METERS` in `src/core/track-segments.js`                                                                                         | Reporting granularity.       | Produces useful distance-bucket timing summaries without overfitting to point density.                                                                                                                                                                                                                                                                                           |

## Current Guardrails

The most important tests protecting these calibration values are:

- `tests/unit/track-analyzer.test.js`
- `tests/unit/speed-calibration.test.js`
- `tests/unit/metric-modes.test.js`
- `tests/unit/gpx-parser.test.js`
- metric fixture checks run by `npm run test:metrics`

When recalibrating, prefer adding a real or synthetic regression that explains
the intended behavior before changing the number. The value itself can be magic;
the reason for the value should not be.
