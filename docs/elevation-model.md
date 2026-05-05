# Elevation Model Specification

This document describes the current point-based elevation model from input to
output. It explains processing order. Numeric threshold rationale lives in
`docs/elevation-calibration.md`.

The model is implemented mainly by:

- `src/core/metric-modes.js`
- `src/core/track-analyzer.js`
- `src/core/track-continuity.js`
- `src/core/elevation-continuity.js`
- `src/core/elevation-source.js`
- `src/core/elevation-profile.js`
- `src/core/activity-inference.js`
- `src/core/elevation-source-assessor.js`
- `src/core/elevation-fusion.js`
- `src/core/elevation-tail-support.js`
- `src/core/elevation-gain-integrator.js`

## Scope

This specification covers point-based recomputation modes:

- `recomputed_filtered`
- `recomputed_raw`
- `recomputed_terrain`

`imported_summary` can override displayed summary values from supported file
metadata. It still relies on a computed baseline for diagnostics and available
mode comparison, but imported summary values are not produced by this elevation
pipeline.

Scenario coverage and fixture governance are documented in
`docs/elevation-fixtures.md`.

## High-Level Flow

```text
parsed track points
  -> select analysis point set for the requested metric mode
  -> clean track points
  -> build continuity/time-gap context
  -> collect raw elevation extrema
  -> infer activity
  -> assess elevation source trust
  -> collect continuous elevation runs
  -> clean raw endpoint, isolated interior, and unsupported sparse-tail observations
  -> resample each run by distance
  -> remove local outliers with Hampel/MAD
  -> replace extreme resampled endpoint spikes
  -> estimate post-cleanup sigma diagnostics
  -> smooth the resampled profile
  -> estimate local relative sigma
  -> integrate gain/loss with confirmed-turn hysteresis
  -> compute filtered extrema and clamp them to a robust raw envelope
  -> compute net elevation change
  -> build confidence, flags, threshold sweep, and diagnostics
```

## 1. Parsed Input

Parsers normalize source files into `RouteSource.points`.

For GPX, `src/core/gpx-parser.js`:

- validates latitude/longitude;
- parses `ele`, `time`, fix quality, DOP fields, satellites, segment index, and
  extension metadata from GPX-compatible `trkpt` and `rtept` elements;
- ignores standalone waypoint-only `wpt` data for route analysis;
- flattens multiple tracks, track segments, or routes into one route source
  while preserving recognized segment indexes as continuity breaks;
- detects explicit elevation source where available;
- normalizes ellipsoid elevation to mean sea level when an explicit ellipsoid
  datum and `geoidheight` are present;
- accepts explicit timezone timestamps as absolute instants and treats
  timezone-less parsed timestamps as UTC instants with missing timezone metadata;
- normalizes placeholder timestamps/elevations before returning the parsed route
  source.

Terrain enrichment, when enabled, can produce points with
`elevationSource: "terrain"`. The production default provider is `none`, so
normal uploads do not fetch terrain elevation unless the provider is explicitly
enabled and fallback/replacement rules allow it.

## 2. Metric Mode Selects The Point Set

`src/core/metric-modes.js` chooses which point array enters analysis:

- `recomputed_filtered` uses `parsed.rawPoints ?? parsed.points`;
- `recomputed_raw` is a raw-elevation mode, not a parser-raw/no-cleaning mode.
  It uses the raw source point set before terrain replacement, then still
  applies the standard conservative cleaning pipeline for invalid coordinates,
  impossible jumps, duplicate points, bad timestamps, and other non-elevation
  track defects;
- `recomputed_terrain` uses `parsed.points` only when terrain elevation is
  available.

The selected points are passed to `analyzeTrack(points, options)`.

## 3. Track Cleaning Happens Before Elevation Modeling

`src/core/track-analyzer.js` calls `cleanTrackPoints` before delegating
distance, speed, continuity, or elevation metrics.

The elevation model receives `analysisPoints`, not the original parser output.
This means source assessment, activity inference, fusion, and gain/loss operate
after general track cleaning has removed invalid coordinates, duplicate points,
bad fixes, non-monotonic timestamps, heading-flip jitter, and impossible jumps.

This cleaning is not elevation-specific. It cleans the track point stream first;
then the elevation pipeline starts.

## 4. Continuity And Time-Gap Context

`track-analyzer` requests a continuity model from `src/core/track-continuity.js`
for cleaned points. The elevation pipeline receives `timeGapBreakIndexes`.

Time-gap breaks are context, not unconditional elevation breaks. Speed and
moving-time continuity break on every declared time gap. Elevation runs split on
a declared time gap only when the elevation jump across the gap is at least
`TIME_GAP_ELEVATION_DISCONTINUITY_METERS`.

Explicit source segment boundaries are always preserved for distance, speed, and
elevation continuity.

## 5. Raw Elevation Extrema Are Captured First

`getElevationStats` first collects all finite elevations from the cleaned
analysis points and stores raw extrema:

- `minElevationMetersRaw`
- `maxElevationMetersRaw`

If no finite elevation exists, the elevation model returns null gain/loss, null
extrema, empty segmentation, and model-compatible empty diagnostics.

These raw extrema are diagnostic/reference values. They are not the
user-visible min/max after model version 1.

## 6. Activity Inference

Activity inference runs before source assessment and fusion.

`src/core/activity-inference.js` computes activity features from cleaned points:

- timed point count;
- median speed;
- p95 speed;
- net elevation change;
- raw absolute elevation change;
- directional elevation ratio.

Speed features skip every declared time-gap pair, matching the analyzer's speed
continuity. Elevation net/raw features use elevation-specific continuity: missing
elevation breaks the elevation-change run, and declared time gaps split the
elevation-change run only when the vertical jump reaches the shared elevation
discontinuity threshold.

It returns a coarse activity:

- `foot`
- `bike`
- `water`
- `motor`
- `route_plan`
- `unknown`

`activityCandidates` are diagnostic alternatives. They do not change the
selected activity or thresholds unless a future model version explicitly changes
selection policy.

The activity result provides defaults used later:

- distance resampling step;
- base gain/loss threshold;
- minimum sustained distance for confirmed turns.

Important ordering detail: water/river-like sustained descent is checked before
generic speed classes. That lets water-like tracks use conservative vertical
oscillation suppression even if their raw GPS elevation is noisy. Selected
`water` still requires continuous downhill speed evidence after XY jitter
suppression in the descent-bearing elevation run; sustained descent from
declared time-gap elevation alone, or from an unrelated flat/jitter-only motion
pair, stays a diagnostic candidate.

Flat, low-speed movement without net descent is not enough to select `water` in
model version 1. It is exposed as a low-confidence `water` candidate so lake,
coastal, canal, or ambiguous paddling files remain visible in diagnostics
without silently applying river-style thresholds to slow walks.

## 7. Source Trust Assessment

Source assessment runs on the cleaned analysis points before elevation
resampling, Hampel cleanup, smoothing, or gain/loss integration.

`src/core/elevation-source-assessor.js` groups finite elevation samples by:

- normalized elevation source: `barometric`, `terrain`, `gpx`, or `unknown`;
- normalized source segment continuity;
- declared time-gap discontinuities whose elevation jump reaches or exceeds the
  shared time-gap elevation threshold.

It then computes raw source statistics from those grouped source runs:

- p75 absolute point-to-point elevation delta;
- p95 absolute point-to-point elevation delta;
- median point-to-point horizontal sample distance;
- p95 absolute grade;
- p95 absolute vertical speed when timestamps are available;
- total run range;
- total raw absolute change;
- raw-change-to-range ratio;
- barometric drift/spike/chatter indicators.

Declared time-gap pairs below the shared elevation discontinuity threshold stay
in the same source run, but are excluded from point-to-point noise pair
statistics. This keeps plausible paused climbs/descents connected while avoiding
source downgrades from pause/resume corrections.

Noise assessment is distance-aware. A large elevation delta is not sufficient by
itself to mark a source noisy: sparse mountain samples can contain real large
vertical changes. The source is downgraded when large deltas appear with dense
sample spacing, implausible grade, implausible vertical speed, or a very high
raw-change-to-range ratio.

The result is a source assessment with separate:

- `absTrust`
- `relTrust`

The selected `primaryAbsoluteSource` and `primaryRelativeSource` influence later
confidence and thresholds. Source assessment does not use the cleaned/fused
elevation profile, because that profile has not been built yet.

## 8. Continuous Elevation Runs

`src/core/elevation-fusion.js` builds continuous elevation runs from the same
cleaned analysis points.

A run breaks on:

- missing or non-finite elevation;
- explicit segment boundary;
- elevation source change;
- declared time-gap break with a large enough elevation discontinuity.

The elevation model keeps an internal distance-domain axis accumulated across
points in the same source segment. When the track analyzer has already built the
canonical route distance series, each observation also carries a display
distance from that canonical axis, where low-speed XY jitter pairs keep their
point order but do not advance cumulative 2D or 3D distance. Invalid elevation
breaks the elevation run, but distance offsets are preserved so later samples
stay positioned on the route distance axis.

## 9. Distance Resampling

Resampling happens before Hampel cleanup and before smoothing.

Each continuous elevation run is independently resampled to a regular distance
grid using the activity resample step. The resampled sample keeps:

- internal distance from route start;
- display distance from route start when a canonical distance axis is available;
- interpolated latitude/longitude;
- interpolated elevation;
- elevation source;
- source index;
- continuous run id.

Gain/loss and confidence calculations use the internal distance-domain axis.
The visible chart series uses display distance when present, so the elevation
profile distance axis can reach the same canonical total distance shown in the
metrics without feeding display-only XY-jitter suppression back into elevation
confirmation.

The final point of each run is always included. Runs with zero route distance
produce one anchored sample.

## 10. Outlier Removal

Endpoint spike cleanup starts before distance resampling. Each raw continuous
observation run can replace an extreme first or last elevation when it strongly
disagrees with a stable interior neighborhood. The raw endpoint rule is
symmetric for high and low endpoints, works for three-point runs, and uses
distance/time plausibility context so sparse but plausible mountain starts are
preserved. This prevents a single endpoint spike from being interpolated into a
plausible-looking slope by the distance grid.

The same pre-resampling pass can replace an extreme isolated interior
observation when two nearby observations on each side form a flat stable
context and the jump-and-return exceeds the shared time-gap discontinuity
scale. This prevents one raw bad observation from being widened into artificial
gain/loss by distance resampling while preserving short three-point hills and
troughs for the later confirmed-extrema model. Interior observation
replacements are reported through `preResampleInteriorOutlierReplacementCount`,
`preResampleInteriorOutlierReplacementSourceIndexes`, and the
`pre_resample_interior_outliers_replaced` flag; endpoint spike counters and
flags remain endpoint-specific.

A conservative sparse-tail pass also runs before resampling. Its lower-tail
branch first seeds candidate raw observations across the whole continuous run,
not only adjacent points, when they are below sea level and sit far below the
run's robust lower distribution. On low-altitude runs, the pass can expand from
those negative seeds to the surrounding low-basin rim, so a negative trough with
shallow shoulders is handled as one unsupported basin instead of leaving a false
low minimum behind. Its upper-tail branch handles the mirror case at the start
or end of a continuous run: a short high settling cap after a run split can be
expanded down to the supported upper rim and replaced before it becomes a false
maximum. The expanded candidate group is replaced only when it still occupies a
tiny share of samples, distance, and duration; these support limits are owned by
`src/core/elevation-tail-support.js`, while sparse-tail seed, expansion,
replacement, and anchor selection remain in `src/core/elevation-fusion.js`.
Such unsupported sparse-tail points are replaced by interpolation between
nearest non-candidate observations, or anchored to the nearest non-candidate
observation at a run boundary, so the route does not acquire an artificial
low/high extremum or gain/loss turn.
Sparse-tail interpolation skips a nearest anchor when it is immediately across a
long recording gap and the following non-candidate observations quickly settle by
an implausible grade or vertical speed. This prevents a removed low/high tail
from being rebuilt as an artificial slope toward the first unstable post-gap
sample; the replacement instead uses the nearest settled observation. When that
unstable nearest anchor directly borders the sparse-tail candidate group, it is
also replaced with the settled context and reported as a sparse-tail replacement
so it cannot remain as a separate visible post-gap spike.
If lower-tail expansion pulls in a broad positive low shoulder that exceeds the
support limits, the model can fall back to replacing only the original
below-sea-level seed group when that seed group remains tiny and unsupported.
When a sparse-tail group touches the start or end of a run, the same
distance/time plausibility guard used for endpoint cleanup can preserve a real
sparse low/high start or finish instead of anchoring it to the nearest
non-candidate.
Supported below-zero or low-elevation travel is preserved when the low segment
has meaningful sample, distance, or duration support, including valid coastal
or river regimes whose minimum is only a few meters above sea level.
Sparse-tail replacements are reported through `preResampleSparseTailReplacementCount`,
`preResampleSparseTailReplacementSourceIndexes`, and the
`pre_resample_sparse_tail_replaced` flag; they do not contribute to endpoint or
isolated-interior counters.

Hampel/MAD cleanup then runs after distance resampling.

The model applies `replaceHampelOutliers` to the resampled elevation values,
within each continuous run. It does not operate on the original raw point list.

Interior Hampel cleanup preserves run endpoints. Interior samples are compared
with a local window around the sample. Outliers are replaced with a neighbor
estimate, and the outlier count feeds flags. `outliersRemovedPct` combines raw
pre-resample replacement counts with resampled Hampel/endpoint replacement
counts over the combined raw-observation plus resampled-sample cleanup
opportunities so tracks that collapse to a short resampled profile cannot report
more than 100% cleanup.

The Hampel spike floor is relief-aware: low-relief runs can use a lower floor
than the global `12 m` cap so isolated 8-10 m spikes do not survive on flat
water, city, or low-relief cycling tracks.

After interior Hampel cleanup, a second conservative endpoint spike check can
replace an isolated high or low first/last sample of a resampled run when that
endpoint is separated from a stable interior neighborhood. Both endpoint checks
are intentionally narrower than interior Hampel cleanup so real steep starts
and finishes are preserved.

After Hampel and endpoint cleanup, the model records sigma diagnostics from the
cleaned, pre-smoothed profile. These values are diagnostic only; gain/loss still
uses the per-sample sigma from the final smoothed profile.

## 11. Smoothing

Smoothing runs after Hampel/MAD outlier removal.

The model uses a moving average within each continuous run:

- radius `1` by default;
- radius `2` when terrain is the primary absolute or relative source.

Smoothing preserves the already-cleaned run endpoints and does not cross
continuous run boundaries.

The output of this step is the fused elevation profile used by later stages. In
the current implementation, "fusion" means deterministic construction of one
cleaned/smoothed profile from the selected point stream. Source trust affects
thresholds, confidence, and smoothing behavior. It is not currently a weighted
blend of multiple simultaneous GPS/barometric/terrain observations at the same
distance sample.

## Fusion Policy

The current implementation does not yet perform weighted blending of separate
simultaneous GPS, barometric, and terrain observations.

Current policy:

1. Build one cleaned point stream for the selected metric mode.
2. Preserve each point's `elevationSource`.
3. Use source trust to select `primaryAbsoluteSource` and
   `primaryRelativeSource`.
4. Use `primaryRelativeSource` to choose gain/loss `alpha`.
5. Use noisy GPX source assessment to raise the base threshold when applicable.
6. Use terrain source assessment to increase smoothing radius when terrain is
   the primary absolute or relative source.
7. Use source trust and processing penalties to compute confidence and
   diagnostic flags.

The current final profile is therefore a deterministic resampled, cleaned, and
smoothed profile from the selected point stream, not a weighted multi-source
blend.

`primaryAbsoluteSource` does not re-anchor the final profile in model version 1.
It affects confidence, smoothing, and diagnostics unless the selected point
stream already uses that source, for example in `recomputed_terrain`.

Known limitation: the current policy does not reconcile strong disagreement
between terrain and GPX/barometric elevations. Future disagreement handling
should prefer explicit conservative behavior and flags over silent averaging.

Future weighted fusion must define, test, and document:

- how relative shape is transferred from one source to another absolute anchor;
- how strong disagreement between DEM, GPX, and barometric sources is detected;
- how partial terrain coverage is handled;
- how confidence changes when sources disagree.

## 12. Local Relative Sigma

Local relative sigma for gain/loss thresholds is estimated after smoothing.

`estimateRunSigmas` computes local sigma from absolute deltas in the smoothed
profile, inside each continuous run. The estimate uses MAD scaled by
`MAD_TO_SIGMA_SCALE`.

Fusion diagnostics also expose track-level sigma summaries before and after
smoothing:

- `medianSigmaAfterCleanupMeters`
- `p95SigmaAfterCleanupMeters`
- `medianSigmaAfterSmoothingMeters`
- `p95SigmaAfterSmoothingMeters`

These summaries make smoothing visible in diagnostics. They help detect cases
where smoothing hides a noisy input profile, but they do not currently raise the
gain/loss threshold by themselves.

Each fused sample receives:

- smoothed elevation;
- `sigmaRelMeters`;
- continuous run id.

This means gain/loss thresholds use noise estimated from the final fused
profile, not from raw GPX points and not from the pre-smoothed Hampel output.

## 13. Gain/Loss Integration

Gain/loss is integrated over the fused smoothed samples produced by
`buildFusedElevationProfile`.

The integrator does not switch to a separate primary-relative-source elevation
series. The primary relative source affects:

- `alpha` in the local threshold;
- noisy-GPX base-threshold raising;
- confidence values.

For each sample:

```text
localThreshold = max(baseThresholdMeters, sigmaRelMeters * alpha)
```

Pseudocode:

```text
for each continuous run:
  anchor = first sample
  direction = unknown
  extreme = anchor
  confirmedProfile = [anchor]

  for each sample after anchor:
    threshold = max(baseThreshold, sample.sigmaRelMeters * alpha)

    if direction is unknown:
      if abs(sample.elevation - anchor.elevation) >= threshold
         and sample.distance - anchor.distance >= minSustainedDistance:
        direction = sign(sample.elevation - anchor.elevation)
        extreme = sample
      continue

    if direction is up:
      if sample.elevation >= extreme.elevation:
        extreme = sample
      else if extreme.elevation - sample.elevation >= threshold
              and sample.distance - extreme.distance >= minSustainedDistance:
        append extreme to confirmed profile
        direction = down
        extreme = sample
      continue

    if direction is down:
      if sample.elevation <= extreme.elevation:
        extreme = sample
      else if sample.elevation - extreme.elevation >= threshold
              and sample.distance - extreme.distance >= minSustainedDistance:
        append extreme to confirmed profile
        direction = up
        extreme = sample

  if direction was confirmed:
    append current extreme in run
  else:
    confirmedProfile remains [anchor]

sum positive deltas in confirmed profile as gain
sum negative deltas in confirmed profile as loss
```

The integrator then uses confirmed-turn hysteresis:

- it starts a climb/descent only after the sample moves far enough from the run
  anchor in both elevation and distance;
- it tracks the current extreme while direction continues;
- it confirms a reversal only when the reversal reaches or exceeds the local
  threshold and minimum sustained distance;
- if a run ends with a small unconfirmed reversal, it closes the run at the last
  confirmed extreme instead of pulling gain/loss toward the final sample;
- it does not sum across continuous run boundaries.

The final gain/loss is the sum of deltas between confirmed profile points.

## 14. Filtered Extrema

Filtered extrema initially come from the fused smoothed elevations.

Then `elevation-profile.js` clamps those extrema to a robust raw envelope:

1. collect finite raw elevation runs from cleaned analysis points, preserving
   segment, source, declared time-gap discontinuity, and missing-elevation
   boundaries;
2. replace isolated raw outliers inside each run using a neighbor-based rule;
3. compute robust raw min/max;
4. clamp filtered min upward to robust raw min;
5. clamp filtered max downward to robust raw max;
6. relax that clamp per continuous run when it would remove a supported extrema
   point from the confirmed gain/loss profile and that point has same-run raw
   support.

This keeps user-visible min/max consistent with the filtered elevation chart
while preventing one fused/smoothed artifact from moving beyond the robust raw
height envelope. The final relaxation is intentionally narrow: a visible
short hill or trough that the gain/loss integrator confirmed and that is backed
by a same-run raw extremum below the severe isolated-outlier guard must not
disappear from min/max and the chart. An isolated raw spike can still be clamped
away even if distance spacing lets the gain/loss integrator form a confirmed
turn around it.

User-visible elevation metrics use filtered extrema:

- `minElevationMeters`
- `maxElevationMeters`
- `elevationRangeMeters`

The analysis output also exposes `elevationSeries` for chart rendering. Each
sample has `{ distanceFromStartMeters, elevation, continuousRunId }` from the
model-derived distance-domain profile, with elevations clamped to the final
filtered extrema. `distanceFromStartMeters` uses the canonical display distance
axis when the analyzer provides it, so the visible profile distance matches the
distance metric for samples that still have elevation while the internal
gain/loss model keeps its own distance-domain axis. The chart renderer can also
extend its X-axis to the canonical total distance when the route continues after
the last finite elevation sample. This prevents a raw spike or a residual
fused-profile artifact from appearing in the poster chart after the user-visible
min/max tiles have excluded it.

Raw extrema are preserved for diagnostics and regression debugging:

- `minElevationMetersRaw`
- `maxElevationMetersRaw`

The elevation chart uses `analysis.elevationSeries` when it contains enough
valid samples, and falls back to `analysis.distanceSeries` only for compatibility
with existing callers that do not provide the model-derived chart series. When
`continuousRunId` changes, the chart inserts a visual gap instead of drawing a
line through a discontinuity that gain/loss and net change intentionally ignore.

## 15. Net Elevation Change

Net elevation change is calculated from fused samples, per continuous run:

```text
sum(run.lastElevation - run.firstElevation)
```

It does not count jumps between continuous runs.

## Fallback Rules

- If no finite elevation exists, gain/loss, filtered extrema, raw extrema, and
  net change are `null`; diagnostics are model-compatible but empty.
- If only one finite elevation sample exists, gain/loss is `0`, extrema can be
  derived from the available sample, and no confirmed turns are produced.
- If a continuous run has zero route distance, it produces one anchored sample
  and cannot create gain/loss by itself.
- If source trust is low, the model still computes metrics when finite
  elevations exist, but confidence flags and confidence scores must communicate
  the lower reliability.
- If terrain is unavailable in production, terrain replacement/fallback does not
  run. Existing `terrain` points are still treated as a source when present.
- Strong disagreement between terrain, GPX, and barometric sources is not yet a
  separate behavior branch; future disagreement handling must be added with
  tests before changing the final profile.

## 16. Confidence And Diagnostics

The model builds confidence after gain/loss and extrema are computed.

Gain/loss confidence combines activity confidence with primary relative source
trust. Extrema confidence combines activity confidence with primary absolute
source trust. Processing penalties then reduce confidence for conditions that
make the computed profile less reliable:

- source-switch fragmentation;
- many short elevation runs;
- high outlier replacement rate;
- activity ambiguity.

Overall confidence weights gain/loss more heavily than extrema.

Confidence is diagnostic, not a statistical probability.

Levels:

- `high`: `overall >= 0.75`; metrics are expected to be stable for display.
- `medium`: `0.5 <= overall < 0.75`; metrics are usable but source/activity
  caveats matter.
- `low`: `overall < 0.5`; metrics are an estimate and should be treated with
  caution.

Diagnostics include:

- `modelVersion`;
- `decisionTrace` with activity, source, fusion cleanup/resampling, and
  gain/loss stages;
- `activityAssessment`;
- `sourceAssessment`;
- segmentation/run ranges;
- fusion method, cleanup stats, and before/after smoothing noise summaries;
- endpoint spike replacement counts and replacement source indexes;
- pre-resample interior outlier replacement counts and source indexes;
- pre-resample sparse-tail replacement counts and source indexes;
- gain model thresholds;
- confidence values, base components, and penalties;
- flags and compatibility fields such as `thresholdSweep`.

`thresholdSweep` remains an array for compatibility. In model version 1 it is
not a full sweep over a fixed threshold grid. It reports the actual selected
median and p95 local thresholds from the fused smoothed profile, with gain/loss
computed by the confirmed-turn integrator. User-facing audit text should present
these rows as selected thresholds, not as a gain/loss range.

```js
[
  {
    kind: "selected_median_local_threshold",
    thresholdMeters: 4.8,
    elevationGainMeters: 123,
    elevationLossMeters: 118
  },
  {
    kind: "selected_p95_local_threshold",
    thresholdMeters: 9.2,
    elevationGainMeters: 123,
    elevationLossMeters: 118
  }
];
```

## Core Formulas

```text
rawChange = sum(abs(elevation[i] - elevation[i - 1]))
range = maxElevation - minElevation
rawChangeToRangeRatio =
  range > 0 ? rawChange / range :
  rawChange > 0 ? Infinity :
  0
directionalElevationRatio = abs(lastElevation - firstElevation) / rawChange
directionalConsistency = same ratio inside source-assessor drift detection
sigmaAfterCleanup = MAD(abs(cleanedPreSmoothingElevationDelta)) * MAD_TO_SIGMA_SCALE
sigmaRel = sigmaAfterSmoothing =
  MAD(abs(smoothedElevationDelta)) * MAD_TO_SIGMA_SCALE
localThreshold = max(baseThresholdMeters, sigmaRel * alpha)
netElevationChange = sum(run.lastElevation - run.firstElevation)
```

When a denominator is zero or no finite samples exist, the implementation uses
the null/zero fallback described in the relevant stage rather than dividing by
zero.

## Ordering Answers

- Source assessment is computed from cleaned analysis points before elevation
  resampling, Hampel cleanup, smoothing, or fusion.
- Source assessment uses declared time-gap discontinuity context, so large
  paused/gapped elevation jumps do not by themselves mark a source noisy.
- Declared time-gap pairs below the elevation-run split threshold remain
  connected for gain/loss, but are not scored as ordinary dense source-noise
  pairs.
- Activity speed features skip all declared time-gap pairs; activity elevation
  net/raw features split only on missing elevation, source segment boundaries,
  or declared time gaps with elevation discontinuity.
- Extreme endpoint spikes, isolated interior observations, and unsupported
  sparse-tail observations are checked before distance resampling, then Hampel
  cleanup and a second conservative endpoint check are applied after distance
  resampling.
- Hampel cleanup is applied after distance resampling.
- Smoothing is applied after Hampel cleanup.
- Diagnostic cleanup sigma is estimated after Hampel/endpoint cleanup and
  before smoothing.
- Local sigma for gain/loss is estimated after smoothing.
- Gain/loss is integrated over the fused smoothed profile.
- Primary relative source does not provide a separate elevation series for
  gain/loss. It influences alpha, threshold behavior, and confidence.
- Filtered extrema are based on the fused smoothed profile, then clamped against
  a robust raw elevation envelope unless that would hide a per-run supported
  confirmed gain/loss extreme.
