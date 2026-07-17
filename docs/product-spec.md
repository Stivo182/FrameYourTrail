# Frame Your Trail Current Specification

Date: 2026-06-22
Status: Current source of truth

This document is the living product and architecture specification for Frame Your
Trail. Historical notes and temporary implementation plans are non-authoritative
unless this document explicitly references them.

## Product Goal

Frame Your Trail is a local browser app for turning a GPX, TCX, FIT, or
supported GPX-like XML route file into a printable trail poster. The app parses
the file in the browser, analyzes route data, renders a responsive poster
preview, and exports the fixed poster canvas to PNG, JPEG, PDF, or the
clipboard, or sends the rendered poster to the browser print dialog.

The product tagline is `Turn any route into a poster`. Localized taglines should
use natural route-equivalent wording for each language while the product name
remains Frame Your Trail.

The product favors transparent route metrics and printable output over a
dashboard-style analysis UI. Uploaded route data stays local to the browser.
Runtime network access is optional and limited to selected map style JSON and
map tiles, best-effort route location lookup, and explicitly enabled terrain
elevation lookup.

## Scope

In scope:

- GPX, supported GPX-like XML, TCX, and FIT input through a local file picker,
  with drag-and-drop available only in the empty state before a poster is loaded.
- Browser-only parsing, validation, analysis, rendering, and export.
- One poster template: `route-report`.
- One visual theme: `terrain`.
- A compact command bar with upload, metric source selection, map style
  selection, export menu, print action, and language selection.
- Multilingual UI and poster text for `ru`, `en`, `es`, `fr`, and `de`.
- Poster header metadata when route data supports it: localized track period,
  representative non-zero coordinates, and best-effort region/country subtitle.
- Route map with MapLibre and selectable no-key map styles when tiles are
  available, plus a static SVG fallback.
- Speed-colored route line when usable speed data is available.
- Elevation profile and key route metrics.
- Exports to PNG, JPEG, PDF, and clipboard PNG image when supported by the
  browser, and browser printing for rendered posters.
- Verification through formatting, linting, type checking, unit tests, metric
  regression, performance budget checks, build checks, Playwright e2e, visual,
  and accessibility tests.

Out of scope:

- Multiple poster layouts or selectable color themes.
- Backend storage, accounts, or route uploads to a server.
- Route editing.
- KML, CSV, arbitrary XML, and other non-GPX/TCX/FIT formats.
- A fully configurable poster/block builder.
- User-facing speed-map coloring toggles or legends.

## Deployment And SEO

Frame Your Trail is deployable as a static Vite app. Production builds derive
their default base path from the canonical URL in `site.config.json`; the current
GitHub project Pages path is `/FrameYourTrail/` and publishes to
`https://<owner>.github.io/FrameYourTrail/`. Set `VITE_BASE_PATH` only when a
build needs to override that canonical deployment path.

If the repository name, Pages URL shape, base path, or custom domain changes,
keep these files/configs synchronized:

- `.github/workflows/pages.yml`
- `vite.config.js`
- `site.config.json` or matching build environment overrides

Static builds copy browser discovery assets from `public/`:

- `site.webmanifest`
- `icon.svg`
- `social-preview.jpg`

Source HTML uses SEO placeholders. The build generates `robots.txt` and
`sitemap.xml` from `scripts/seo-config.mjs`. The default canonical URL, sitemap
date, and social preview file live in `site.config.json`; build or CI may
override them with:

- `FRAME_YOUR_TRAIL_CANONICAL_URL`
- `FRAME_YOUR_TRAIL_SITEMAP_LASTMOD`
- `FRAME_YOUR_TRAIL_SOCIAL_PREVIEW_FILE`
- `FRAME_YOUR_TRAIL_SITE_CONFIG`

Production build-output checks must verify that canonical links, social preview
metadata, local script/style asset links, `robots.txt`, and `sitemap.xml` are
consistent with the configured public base path.

The GitHub Pages workflow must run the full `npm run verify` quality gate before
building and publishing the Pages artifact. The deploy artifact is then rebuilt
with the canonical site base path and checked with `npm run test:build`, followed
by `npm run test:pages` browser smoke testing against the Pages subpath.

The Pages `verify` job runs on Windows to match the committed Windows Chromium
visual snapshot baseline. The Pages `build` and `deploy` jobs remain on Ubuntu.

## User Flow

1. The user opens the Frame Your Trail page.
2. The app resolves the initial language from saved preference, browser language,
   or English fallback. It also restores saved metric source and map style
   preferences for later route rendering.
3. The user selects a GPX, supported GPX-like XML, TCX, or FIT route file, or
   drops it onto the empty state before a poster is loaded.
4. The app parses, validates, and analyzes the route, using the Web Worker path
   when available and preserving behavior with the in-thread fallback.
5. After a valid route is analyzed, the app starts one best-effort BigDataCloud
   reverse-geocoding request for a representative route coordinate.
6. The app lazy-loads the poster renderer, poster styles, map renderer, and chart
   renderer as needed, then shows the poster preview.
   If poster preview rendering fails, the preview area shows a localized
   recoverable error message instead of becoming empty.
7. The user can switch metric source when more than one source is selectable.
   The selected metric source is saved for later uploads and applies when that
   source is available for the loaded route.
8. The user can switch the visual map style without changing route data or
   metrics.
9. The user exports the poster to PNG, JPEG, PDF, or, when supported by the
   browser, clipboard image, or prints it from the toolbar.

Saved language, metric source, and map style preferences are best-effort; if
`localStorage` is unavailable, the app remains usable and preference changes
apply only to the current session.

Opening any command bar selector for language, metric source, map style, or
export must collapse the other open command bar selectors so only one selector
panel is open at a time. Clicking outside an open command bar selector must
collapse it without changing the current selection.

Language changes after upload rerender the shell and poster, refresh localized
labels, and start a fresh best-effort location lookup for the loaded route.
Metric source and map style changes for the same upload must not cancel a
pending location lookup.

## Input And Parsing

Supported input is GPX, supported GPX-like XML, TCX, and FIT. The app parses
local route files in the browser, normalizes supported formats into one route
source model, then validates and analyzes that normalized source.

GPX-like XML compatibility is limited to XML files that contain supported route
geometry such as GPX `trkpt` or `rtept` points. It is not a general arbitrary
XML parser and does not add support for KML, CSV, waypoint-only files, or other
non-GPX/TCX/FIT formats.

Parsed route sources may preserve coordinates, elevation and elevation
provenance, timestamps and timezone metadata, source segment indexes, quality
fields, TCX/FIT metadata, raw extension fragments, parser provenance, and
imported summary fields. Parsed route sources may also preserve explicit
structured source activity when the input format provides it. Imported summaries
are available only through the `imported_summary` metric source and must not
override point-based metrics in recomputed modes. A parsed imported summary
object makes `imported_summary` available, but does not make it the default
metric source.

Detailed current parser routing, GPX-compatible XML behavior, TCX/FIT
normalization, imported-summary extraction, title fallback rules, parse errors,
and validation warnings are documented in `docs/input-parsing.md`.

Route titles:

- GPX uses a non-generic track or metadata name when present and otherwise falls
  back to the file name without extension.
- Generic/default GPX names, including supported-language equivalents and common
  numbered/dated variants, are ignored.
- TCX and FIT use the file name without extension because their activity/session
  identifiers are often timestamps rather than user-facing route names.

Blocking parse errors:

- XML input is not parseable XML.
- FIT input cannot be parsed.
- No route points are present.
- A route point has missing coordinates.
- A route point has coordinates outside geographic bounds.

Validation warnings:

- missing elevation
- terrain-restored elevation
- missing time
- large file, currently 50 MB or more

Large-file warnings are advisory. A warned file is still parsed and analyzed in
the same browser-only worker/fallback pipeline, and exports remain available when
analysis succeeds. Large point counts may make parsing, terrain enrichment, map
rendering, chart rendering, and export slower; terrain lookup stays batched and
best-effort when a terrain provider is enabled. The app does not currently define
a hard point-count limit or a degraded metrics mode separate from the standard
analysis path. The 50 MB warning threshold is separate from the automated
large-track performance budget guard, which uses deterministic synthetic point
counts and timing budgets in `npm run test:perf`.

Large-track runtime behavior is best effort. The current UI has no upload,
parse, terrain, render, or export progress indicator beyond normal busy/error
states, and the product does not guarantee an upper bound for supported point
counts. Browser memory limits, worker failures, map/rendering failures, terrain
provider failures, or export canvas limits should surface as recoverable
user-facing failures where possible. Export is attempted only after parsing,
validation, analysis, poster rendering, current chart rendering, and current map
rendering have successfully reached the export-ready path.

## Track Location Lookup

After a valid route is parsed and analyzed, the app chooses the middle finite
route coordinate and performs one best-effort reverse-geocoding request:

```text
https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=<latitude>&longitude=<longitude>&localityLanguage=<language>
```

The request uses `Accept: application/json` and passes the current app language
as the `localityLanguage` query parameter. Browser builds do not set
`User-Agent` or custom `X-*` headers. Results are cached in memory by rounded
coordinate and language for the current session.

The poster displays `Region, Country` only when both a useful region-like field
and country are present. Region priority is `principalSubdivision`, `city`, then
`locality`; country comes from `countryName`. Failed requests, rate limits,
invalid responses, or missing fields are silent and leave the subtitle absent.

The lookup must not affect route metrics, map rendering, validation, export
availability, or parsed route data. If a location lookup finishes while export is
already waiting on current poster render work, subtitle rerendering is deferred
until export settles so the current export target remains connected.

## Elevation Enrichment

The production default terrain elevation provider is `none`. In this mode, the
app does not call the Open-Meteo elevation endpoint during normal upload and does
not show terrain replacement for tracks that already contain file or barometric
elevation.

For development and future provider-enabled scenarios, set
`window.__FRAME_YOUR_TRAIL_TERRAIN_ELEVATION_PROVIDER__ = "open-meteo"` before
the app loads. Unknown provider values fall back to `none`.

When `open-meteo` is enabled:

- Files without usable elevation and without explicit barometric elevation may
  receive terrain elevation as fallback restoration.
- Files with file or barometric elevation do not request terrain elevation during
  upload.
- Terrain replacement becomes selectable for replaceable tracks and runs only
  after the user selects the terrain metric source.

The Open-Meteo integration uses the elevation endpoint family:

```text
https://api.open-meteo.com/v1/elevation?latitude=<lat1>,<lat2>,...&longitude=<lon1>,<lon2>,...
```

Requests send matching comma-separated latitude and longitude lists for route
points, currently in batches of 100 points. Browser builds use the platform
`fetch` behavior and do not add custom identifying headers. This means enabling
terrain lookup discloses route coordinates to Open-Meteo for the requested
batches; with the default `none` provider no Open-Meteo requests are made.

Terrain enrichment is best-effort. Each batch retries transient fetch or HTTP
failures up to the current retry budget, but an HTTP `429` stops retries for
that batch. A successful response must provide numeric elevation values for all
route points after batching; partial responses, non-numeric elevations, missing
arrays, fetch errors, exhausted retries, rate limits, or any mismatched response
length keep the current parsed track unchanged. Successful enrichment preserves
original raw points, marks generated elevation as `terrain`, and records
terrain provenance with fallback or replacement mode and applied point count.

Fallback terrain restoration becomes the default analysis mode and shows a
terrain-elevation warning. Explicit terrain replacement switches the current
selection to `recomputed_terrain` after success, but it does not become the
default for later recomputation. Failed explicit replacement keeps the previous
track, selection, and analysis, and shows `terrain_elevation_unavailable`.

## Analysis And Metrics

Metric sources:

- `recomputed_filtered`: point-based analysis after conservative cleaning, and
  the default when terrain fallback elevation is not already available.
- `recomputed_raw`: point-based analysis using the raw source point stream
  before terrain replacement, still followed by the standard cleaning and
  elevation model.
- `recomputed_terrain`: point-based analysis using terrain-restored or
  terrain-replaced elevation.
- `imported_summary`: displayed values backed by finite imported summary fields
  when the loaded file provides a parsed imported summary object. Missing
  imported fields keep point-based values, and missing imported average speeds
  are derived from imported distance and matching duration when both are finite
  and positive.

Metric source changes recompute or overlay the displayed analysis for the
current route. Regular mode changes must not mutate parsed route data. Imported
summary mode must not rewrite parsed points, point-based summaries, terrain
availability, diagnostics, or future recomputation state. Explicit terrain
replacement may update the current parsed route only after provider-enabled
replacement succeeds.

Detailed current mode availability, selectability, defaults, persistence,
terrain replacement transitions, imported-summary overlay behavior, and lazy
available summaries are documented in `docs/metric-sources.md`.

The analysis result includes route totals, duration fields, elapsed average and
moving average speed, maximum speed, elevation statistics,
distance/elevation/speed/slope series, 5 km segment summaries, provenance,
confidence flags, and an audit trail for diagnostics and tests. The audit trail
is not rendered in the current UI.

Metric calculation rules:

- Canonical route distance is 2D geodesic distance over cleaned point pairs in
  the same source segment. Large timestamp gaps do not remove route distance,
  so paused hikes continue to match route-planning tools such as Basecamp.
- Conservative point cleaning removes isolated impossible GPS jumps, but when a
  slow profile is inferred automatically from the broader track, a coherent
  fast corridor remains route geometry unless it exceeds the hard speed ceiling
  or the trajectory shape is jumpy.
- 3D distance remains an alternate metric and must not replace canonical 2D
  distance; it follows the same source-segment continuity as canonical route
  distance.
- `segmentIndex` changes are explicit continuity breaks for distance, speed, and
  elevation runs, and elapsed time is summed separately per source segment.
- Imported total and moving durations are used only in `imported_summary` mode.
- Flat or repeatedly geometry-inconsistent GPX point timestamps are treated as
  untrusted/missing per segment for speed filters and moving-time metrics.
- Point-based moving duration uses explicit imported timer events first and
  otherwise falls back to speed hysteresis over cleaned points. For tracks using
  walking-style moving thresholds, the hysteresis input is augmented by a
  sustained slow-progress detector so low-speed XY jitter suppression alone does
  not force genuinely progressive samples to stopped. Smart/sparse recordings
  may also treat long time-gap pairs as moving-time samples when the pair speed
  is within the configured moving and hard speed bounds, so lossy point-count
  reduction does not turn ordinary travel into stopped time.
- Point-based speed outputs use reliable speed samples. A separate speed
  reliability profile can be inferred from the speed-sample distribution to
  filter compressed or incompatible speed samples without deleting route points
  or changing canonical route distance. When speed samples are filtered,
  `averageSpeedKmh`, `overallAverageSpeedKmh`, and `movingAverageSpeedKmh` use
  the same reliable speed-sample distance scope instead of mixing canonical
  route distance with filtered speed time. Inference must not choose a
  conservative reliability profile when that profile would reject most speed
  samples.
- Inferred slow hiking tracks use moving-time hysteresis tuned for paused walking
  tracks: 1.5 km/h to start moving and 0.8 km/h to stop moving. Samples below
  the start threshold can still count as moving when nearby samples show at
  least 2 minutes and 4 point pairs of net progress inside a 5-minute window,
  either averaging at least 0.5 km/h or clearing both a 12 m net displacement
  floor and a 0.15 km/h low-speed floor. A rolling window, or short continuous
  segment, remains stopped when repeated dominant-axis reversals have poor
  direction quality: net progress is inefficient relative to projected path and
  backtracking is at least as large as net progress. Slow-progress candidates
  also check a shifted 15-minute local horizon for extremely low-efficiency
  cyclic motion, so long stationary oscillations cannot escape by exceeding the
  short-segment check. This keeps bounded stationary oscillation stopped without
  imposing a fixed-span cliff on slow directed progress with small backsteps.
- Point-based recomputation requires at least two usable points after
  conservative cleaning; if cleaning leaves fewer than two points, analysis fails
  instead of producing zeroed metrics.
- Point-based total duration is elapsed time between the first and last usable
  timestamp in each source segment. Large time gaps remain part of elapsed time
  for paused hikes, split elevation diagnostics, and split speed/moving-time
  continuity unless the smart/sparse moving-time bridge rule above marks the
  pair as plausible hidden movement. The elevation model keeps plausible paused
  sections in one elevation run and splits a time gap only when the gap also
  has a large vertical discontinuity, currently 60 m or more.
- Activity inference treats declared time-gap pairs as unavailable for
  activity-speed evidence. Its elevation net/raw features split on missing
  elevation and on declared time gaps only when the vertical jump reaches the
  elevation discontinuity threshold. Selected `water` requires continuous
  downhill speed evidence after XY jitter suppression on the descent-bearing
  elevation run, so a flat, jitter-only, or unrelated continuous pair cannot
  select water for gapped elevation-only descent. That descent can still be
  reported as an activity candidate without changing the selected activity. The
  point-based elevation model prefers explicit structured source activity when
  available and otherwise falls back to this coarse inference.
- `averageSpeedKmh` is the elapsed average speed. `movingAverageSpeedKmh` is the
  moving-time average speed. Both are based on canonical route distance when no
  speed samples are filtered, and on reliable speed-sample distance when speed
  reliability filtering removes outlier samples.
- Low-speed XY jitter suppression uses separate route and speed-sample scopes.
  Moving-state and speed-sample calculations zero all low-speed XY jitter
  candidates so stopped drift does not create activity speed evidence.
  Canonical route distance and 3D distance suppress all-jitter continuous spans,
  durable contiguous jitter runs, and compact bounded stationary wander, while
  short bounded wobble next to real movement remains in route distance. Pairs
  that pass the sustained slow-progress detector remain in route distance and
  speed-distance calculations even when each individual pair is short and slow.
  Distance samples keep the point sequence but hold cumulative distance flat
  across route-suppressed jitter pairs; bounded stationary drift remains
  stopped.
- Analysis values stay in canonical units until rendering: meters, seconds, and
  km/h for fields explicitly named `*Kmh`.
- Rounded display values must not feed back into analysis summaries, metric
  regression data, or later calculations.
- Elevation gain/loss uses the source-aware distance-domain model. The model
  resamples elevation runs by route distance, assesses absolute and relative
  trust separately for GPX, barometric, and terrain sources, removes isolated
  vertical outliers, builds a filtered profile from the selected point stream,
  and counts only locally confirmed climbs/descents. Existing terrain
  elevations act as a DEM-like absolute anchor; the default app still does not
  fetch new terrain elevation unless the user explicitly requests terrain
  replacement or fallback restoration is available.
- Declared time-gap elevation discontinuities split both source-trust scoring
  and fusion runs, so a large paused/gapped jump is not treated as ordinary
  source noise. Declared time-gap pairs below the elevation-run split threshold
  can remain connected for gain/loss, but do not count as ordinary dense
  source-noise pairs.
- The gain/loss threshold is activity- and source-aware. Water-like tracks
  use a conservative sustained-distance rule to suppress vertical noise, while
  noisy GPX relative signals raise the base confirmation threshold from the
  raw-change-to-range ratio.
- Speed, moving-time, and elevation thresholds that intentionally contain
  heuristic "magic" are documented in `docs/speed-calibration.md` and
  `docs/elevation-calibration.md`. Changes to those values must update the
  relevant calibration document and regression tests.
- The exact current point-based elevation pipeline order is documented in
  `docs/elevation-model.md`.
- Representative elevation fixture scenarios and tolerance policy are
  documented in `docs/elevation-fixtures.md`.
- User-visible `minElevationMeters` and `maxElevationMeters` are filtered
  extrema from the filtered elevation profile. Raw spike-sensitive extrema are
  retained separately as raw extrema fields and diagnostics. Robust raw-envelope
  clamping must not hide a per-run supported extrema point that the confirmed
  gain/loss profile actually uses and that is not backed only by a severe
  isolated raw outlier, so min/max, chart, and gain/loss remain mutually
  consistent. Isolated spikes can still be clamped even when point spacing lets
  gain/loss form a turn around them.
- `elevationSeries` is the model-derived chart profile with
  `{ distanceFromStartMeters, elevation, continuousRunId }` samples. The visible
  elevation chart uses this field when available so chart extrema match filtered
  min/max semantics, breaks the line between different `continuousRunId` values,
  and keeps the chart distance axis aligned with the canonical total distance
  shown in the metrics. The elevation gain/loss model may keep a separate
  internal distance-domain axis for confirmation, but display-only distance
  alignment must not feed rounded or jitter-suppressed chart values back into
  gain/loss. The chart falls back to `distanceSeries` only for older analysis
  objects that do not provide `elevationSeries`.
- Elevation diagnostics include numeric `modelVersion: 1`, `decisionTrace`,
  `activityAssessment`, `sourceAssessment`, `fusion`, `gainModel`, confidence
  values, confidence penalties, and flags. Legacy diagnostic arrays may remain
  for compatibility, but `decisionTrace` is the explanation source of truth for
  activity, source, resampling, cleanup/fusion, and gain/loss decisions.
  `fusion.noise` exposes median/p95 sigma after cleanup and after smoothing so
  diagnostics can show when smoothing has reduced visible vertical noise.
  `fusion.endpointSpikeReplacementCount` and related pre/post counters expose
  endpoint cleanup separately from ordinary interior outlier replacement.
  `fusion.preResampleInteriorOutlierReplacementCount` exposes severe isolated
  interior raw-observation replacements without contributing to endpoint
  counters, endpoint flags, or endpoint confidence penalties.
  `fusion.preResampleSparseTailReplacementCount` and
  `fusion.preResampleSparseTailReplacementSourceIndexes` expose unsupported
  sparse-tail replacements separately from endpoint and isolated-interior
  cleanup; the corresponding flag is `pre_resample_sparse_tail_replaced`.
  Sparse lower-tail cleanup starts from below-sea-level seed observations and
  may expand a short unsupported low-altitude basin to its surrounding rim
  before replacement, but supported coastal/river-like low regimes around a few
  meters above sea level must remain visible. Sparse upper-tail cleanup may
  replace a short unsupported high settling cap at a run boundary after a
  discontinuity, but plausible high starts or finishes with enough distance/time
  support must remain visible. Sparse-tail interpolation must not use a nearest
  post-gap anchor when that anchor is itself an unstable settling sample; it must
  choose the nearest settled non-candidate anchor instead. When that unstable
  post-gap anchor directly borders the sparse-tail candidate group, it must also
  be replaced and reported as a sparse-tail replacement so the chart does not
  retain a separate post-gap spike.
  `fusion.outliersRemovedPct` is bounded diagnostic cleanup share computed over
  raw finite observations plus resampled samples, so pre-resample raw cleanup
  cannot exceed 100% on tracks that resample to very few chart samples.
  `activityCandidates` may include low-confidence water-like movement without
  changing the selected activity. `thresholdSweep` remains compatibility
  diagnostics for the selected local thresholds, not a full fixed-grid
  recomputation; rows include `kind` values for median and p95 selected local
  thresholds, and audit output labels them as thresholds instead of a gain/loss
  sweep range. When terrain is the primary absolute elevation source,
  confidence flags include the legacy
  `elevation_dem_corrected` marker.

## Poster

The current poster is a single route report:

- Template id: `route-report`
- Theme id: `terrain`
- Canvas: `1240 x 1754`
- PDF orientation: A4 portrait

The poster includes:

- scenic header art and route title
- optional localized track period
- optional representative non-zero coordinates
- optional route region/country subtitle with a location icon
- route map
- elevation profile
- key metrics table

The visible poster uses the elevation profile as the only chart. Speed and slope
series may exist in the analysis model, but separate speed/slope chart sections
are not rendered in the current layout.

The preview scales to fit the available viewport width. Export uses the fixed
poster DOM at `1240 x 1754`, so PNG, JPEG, PDF, and clipboard output must not
inherit preview scaling.

Current key metrics:

- distance
- moving time
- stopped time
- total time
- average speed
- moving speed
- maximum speed
- elevation gain
- elevation loss
- minimum elevation
- maximum elevation
- elevation range

## Map And Charts

The live map uses MapLibre GL JS with a selectable no-key map style catalog.
MapLibre JS and CSS load lazily only when a poster preview needs a live map. The
static SVG map fallback renders first and remains the export-friendly fallback
when MapLibre, style JSON, or tiles fail or stall.

Built-in map styles:

- `openfreemap_poster`: default OpenFreeMap vector style with a poster-matched
  muted palette.
- `osm_standard`: OSM Standard raster tiles for familiar general-purpose maps.
- `cyclosm`: CyclOSM raster tiles for bike-oriented route posters.

MapTiler Outdoor is out of scope unless a future no-key provider/style is
selected that fits the poster aesthetics and reliability expectations. All
external map providers are best-effort and must include attribution in the
MapLibre style.

Map requirements:

- non-interactive preview
- preserve drawing buffer for export
- poster-matched OpenFreeMap palette for the default map style
- app-owned route and endpoint layers
- localized start and finish endpoint labels
- bounds fitted to the loaded route with compact padding so nearby map detail
  remains visible
- road, trail, path, and track layers stay visually distinct within the poster
  palette
- selected OpenFreeMap fill patterns, including wetland and pedestrian-area
  patterns, are preserved when they improve map detail
- unrelated external fill patterns and external fill outlines are neutralized
  or removed, and external park or aeroway line patterns use the poster palette
- white route halo
- speed-colored route line when usable speed data is available
- single route color when speed data is unavailable or unusable
- recoverable external map errors must not surface as app errors
- style JSON fetches and live map readiness waits are bounded so export can
  proceed with the static fallback when map network work stalls

Map style changes are saved to `localStorage` when storage is available, rerender
the current poster map, and must preserve the loaded route, analysis mode,
warnings, language, location subtitle, and export controls.

Route coloring consumes `analysis.speedSeries`. The renderer may use MapLibre
`line-gradient`, MapLibre segment fallback, or static SVG segment rendering.

The visible elevation chart uses ECharts with the SVG renderer. It must localize
title, axis, tooltip, and aria label; show min/max points; use the poster palette;
preserve dense sample distance precision for a smooth profile line; and degrade
gracefully when fewer than two elevation samples exist.
Min/max point labels at or near the left or right edge of the elevation plot
must remain inside the visible chart bounds.

## Internationalization

Supported languages:

- `ru`
- `en`
- `es`
- `fr`
- `de`

Language resolution order:

1. saved language from `localStorage` when storage is available
2. first supported browser language
3. fallback to `en`

Manual language selection is exposed as a compact toolbar dropdown with radio
options. It saves to `localStorage` when storage is available, lazy-loads the
selected locale chunk, keeps the shell usable with fallback text while loading,
ignores stale locale load completions, rerenders loaded UI/poster/map/chart/export
labels, and refreshes the route location lookup for the loaded route.

The runtime must keep `document.documentElement.lang` synchronized with the
active app language after automatic language detection, manual selection, and
reloads with a saved preference.

User-provided data is not translated:

- route name or file-derived route title
- file name
- raw coordinates
- numeric route data

## Export

Supported export formats:

- PNG
- JPEG
- PDF
- clipboard PNG image when supported by the browser

Export behavior:

- Export the fixed `.infographic` poster DOM, not the responsive preview wrapper.
- Use `html-to-image` for PNG, JPEG, and blob generation.
- Use `jsPDF` for PDF wrapping.
- Show and use Clipboard API export only when image clipboard writes are
  available.
- Wait for fonts, lazy poster rendering, current elevation chart rendering, and
  current route map rendering before export.
- If the export target is unavailable after pending render work settles, show
  the localized export error.
- Use white export background and pixel ratio `2`.
- Keep PDF dependencies out of PNG, JPEG, and clipboard export paths.
- Expose export formats through one compact toolbar menu that dispatches PNG,
  JPEG, PDF, or supported clipboard export actions.
- Expose printing as a separate toolbar action next to the export menu; it
  closes open command bar selectors and invokes the browser print dialog.
  Printing waits for lazy poster, chart, and map rendering, defers pending
  location rerenders until the print dialog is dispatched, uses the fixed
  `.infographic` poster surface, and excludes the toolbar, responsive preview
  wrappers, and other app shell UI. The poster is scaled to fit the printable
  page without reflowing the poster layout.

## Architecture

Core boundaries:

- Core calculation modules do not depend on the DOM.
- Render modules receive prepared model data and i18n helpers.
- Export works from the rendered poster element.
- Network-dependent capabilities degrade gracefully.
- Tests cover pure logic in unit tests and user-visible workflows in Playwright
  tests.

Important module groups:

- `src/main.js`: app orchestration, state rendering, file handling, language
  selection, metric source selection, map style selection, export and print
  dispatch.
- `src/core/*`: parsing, validation, cleaning, analysis modes, route metrics,
  elevation profiles, and geodesic helpers.
- `src/services/*`: file loading, terrain elevation, track location lookup,
  worker client/fallback pipeline, image export, and PDF export.
- `src/render/*`: poster DOM, map rendering, elevation chart rendering, dormant
  speed/slope chart renderers, icons, and template definitions.
- `src/i18n/*`: language metadata, dictionaries, and translation helpers.
- `src/workers/track-analysis-worker.js`: module Web Worker for parsing,
  enrichment, validation, and selected metric recomputation.

Lazy-loading and build rules:

- The aggregate locale dictionary module stays out of the empty startup graph.
- Non-default locale dictionaries load from per-language chunks.
- Poster renderer and poster-only styles load only after a valid upload needs a
  poster preview.
- MapLibre JS/CSS and route map rendering stay out of the empty startup graph.
- Heavy chart rendering loads after a poster preview is rendered.
- Visible elevation chart rendering stays split from dormant speed/slope chart
  renderers.
- Track analysis worker client and module Worker are created lazily on first
  source parsing, metric recomputation, or terrain enrichment request.
- In-thread analysis fallback loads lazily so Worker-capable browsers do not pay
  fallback pipeline cost on initial load.
- Production builds emit `src/workers/track-analysis-worker.js` as a separate
  module Worker asset.
- Production builds share the lazy FIT parser as exactly one `fit-parser-*.js`
  asset.
- Production builds share the heavy analysis core as exactly one
  `track-analysis-core-*.js` asset.
- Poster background imagery should use optimized browser-native raster formats
  and avoid multi-megabyte runtime assets.

Worker and fallback behavior:

- Source parsing, terrain enrichment, validation, and metric recomputation prefer
  the module Web Worker when available.
- The lazy in-thread fallback must preserve user-facing parse, enrichment,
  validation, analysis-mode, warning, and error semantics.
- Runtime worker/client failures are terminal inside the constructed worker
  client, but recoverable at the application adapter layer through the fallback
  pipeline.
- Worker responses must preserve GPX parse error product codes so UI error
  mapping is the same across worker and fallback paths.

Detailed current worker messages, engine order, lazy-loading boundaries,
terminal failure rules, adapter fallback behavior, and build-output contracts are
documented in `docs/worker-analysis-pipeline.md`.

## Verification Coverage Map

This map links product contracts to detailed specs and the committed checks that
currently protect them. `npm run verify` runs the full suite; focused commands
are useful while editing related behavior.

| Contract area                                                                                                                                                                                  | Detailed spec                                                                                                                                 | Primary checks                                                                                                                                                                                                                                                                          | Focused npm check                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GPX/XML parsing, format detection, route-source normalization, parse errors, timestamp handling, imported summary extraction                                                                   | `docs/input-parsing.md`                                                                                                                       | `tests/unit/gpx-parser.test.js`, `tests/unit/track-source-parser.test.js`, `tests/unit/track-analysis-pipeline.test.js`, `tests/unit/validation.test.js`                                                                                                                                | `npm run test`                                                                                              |
| TCX/FIT parser facade and lazy FIT loading                                                                                                                                                     | `docs/input-parsing.md`                                                                                                                       | `tests/unit/tcx-parser.test.js`, `tests/unit/fit-parser.test.js`, `tests/unit/track-source-parser.test.js`, `tests/unit/lazy-modules.test.js`                                                                                                                                           | `npm run test`                                                                                              |
| Terrain provider config, Open-Meteo enrichment, fallback restoration, explicit replacement, partial/failure semantics                                                                          | `docs/product-spec.md`                                                                                                                        | `tests/unit/terrain-provider-config.test.js`, `tests/unit/elevation-service.test.js`, `tests/unit/track-analysis-pipeline.test.js`, `tests/unit/analysis-mode-controller.test.js`, `tests/e2e/app.spec.js`                                                                              | `npm run test`, `npm run test:e2e`                                                                          |
| Metric source selection, availability, persistence, imported-summary override, lazy available summaries, localized labels                                                                      | `docs/metric-sources.md`                                                                                                                      | `tests/unit/analysis-modes.test.js`, `tests/unit/metric-modes.test.js`, `tests/unit/metric-modes-lazy.test.js`, `tests/unit/analysis-mode-controller.test.js`, `tests/unit/i18n.test.js`, `tests/e2e/app.spec.js`                                                                       | `npm run test`, `npm run test:e2e`                                                                          |
| Core route metrics, cleaning, activity inference, elevation gain/loss model, diagnostics                                                                                                       | `docs/product-spec.md`, `docs/speed-calibration.md`, `docs/elevation-model.md`, `docs/elevation-calibration.md`, `docs/elevation-fixtures.md` | `tests/unit/track-analyzer.test.js`, `tests/unit/elevation-profile.test.js`, `tests/unit/elevation-fusion.test.js`, `tests/unit/elevation-gain-integrator.test.js`, `tests/unit/elevation-source-assessor.test.js`, `tests/unit/activity-inference.test.js`, committed metric manifests | `npm run test`, `npm run test:metrics`                                                                      |
| Export and print dispatch, map workflows, static map fallback, export readiness, visual poster behavior; visual smoke covers desktop poster, mobile poster, upload error state, and open menus | `docs/product-spec.md`                                                                                                                        | `tests/unit/export-service.test.js`, `tests/unit/export-controller.test.js`, `tests/unit/map.test.js`, `tests/unit/preview-renderer.test.js`, `tests/e2e/app.spec.js`, `tests/e2e/visual.spec.js`                                                                                       | `npm run test`, `npm run test:e2e`, `npm run test:visual`                                                   |
| Worker/fallback construction, terminal worker failures, lazy fallback loading, worker asset output                                                                                             | `docs/worker-analysis-pipeline.md`                                                                                                            | `tests/unit/track-analysis-worker-client.test.js`, `tests/unit/track-analysis-adapter.test.js`, `tests/unit/lazy-modules.test.js`, `tests/unit/verify-build-output.test.js`, `tests/e2e/app.spec.js`                                                                                    | `npm run test`, `npm run test:e2e`, `npm run build`, `npm run test:build`                                   |
| Privacy/network boundaries: local parsing, optional terrain, best-effort geocoding, map fallback, no default terrain calls                                                                     | `docs/product-spec.md`                                                                                                                        | `tests/unit/track-location-service.test.js`, `tests/unit/track-location-controller.test.js`, `tests/unit/terrain-provider-config.test.js`, `tests/unit/elevation-service.test.js`, `tests/unit/map.test.js`, `tests/e2e/app.spec.js`                                                    | `npm run test`, `npm run test:e2e`                                                                          |
| Elevation fixtures and tolerance policy                                                                                                                                                        | `docs/elevation-fixtures.md`                                                                                                                  | `tests/fixtures/filtered-golden.json`, `tests/fixtures/metric-matrix.json`, `tests/unit/metric-regression-runner.test.js`                                                                                                                                                               | `npm run test`, `npm run test:metrics`                                                                      |
| Large-track runtime and performance guard                                                                                                                                                      | `docs/product-spec.md`                                                                                                                        | `scripts/large-track-budget.mjs`, `scripts/large-track-benchmark.mjs`, `tests/unit/large-track-budget.test.js`, `tests/unit/large-track-benchmark.test.js`                                                                                                                              | `npm run test`, `npm run test:perf`, `npm run perf:large-track -- --points 10000 --iterations 3 --warmup 1` |
| Build, deploy, SEO, discovery assets, GitHub Pages base path                                                                                                                                   | `docs/product-spec.md`                                                                                                                        | `scripts/verify-build-output.mjs`, `scripts/seo-config.mjs`, `tests/unit/verify-build-output.test.js`, `tests/unit/seo-metadata.test.js`, `tests/unit/github-pages-config.test.js`, `tests/unit/tooling-config.test.js`, `tests/e2e/pages-smoke.spec.js`                                | `npm run build`, `npm run test:build`, `npm run test:pages`, `npm run verify`                               |
| Internationalization and accessibility expectations; a11y smoke covers empty, loaded, error, menu, and mobile states                                                                           | `docs/product-spec.md`, `docs/metric-sources.md`                                                                                              | `tests/unit/i18n.test.js`, `tests/e2e/a11y.spec.js`, `tests/e2e/app.spec.js`                                                                                                                                                                                                            | `npm run test`, `npm run test:a11y`, `npm run test:e2e`                                                     |

Current metric regression coverage:

- `npm run test:metrics` runs both `tests/fixtures/filtered-golden.json` and
  `tests/fixtures/metric-matrix.json`.
- `filtered-golden.json` is retained as a legacy baseline for `valid-track.gpx`;
  it overlaps the matrix's `matrix-nonbarometric-rolling-sparse` fixture and
  does not add a unique public scenario.
- `metric-matrix.json` includes GPX, supported GPX-like XML, TCX, and FIT cases.
  Its manifest enforces required marginal tag coverage for device type,
  recording mode, terrain, elevation source, file format, metric mode, and noise
  scenario, plus explicit required combinations for GPX filtered, GPX terrain,
  XML filtered, TCX imported-summary, and FIT imported-summary modes.

Current browser workflow coverage in `tests/e2e/app.spec.js` includes supported
bad-file handling, validation warnings, GPX-like XML upload, module worker use,
main-thread worker fallback, terrain replacement and terrain matrix behavior,
and imported-summary source switching for TCX and FIT uploads.

## Open Decisions

- Whether to add a hard point-count limit, a degraded mode for very large
  tracks, and progress UI for upload, parsing, terrain lookup, rendering, and
  export.
- Whether and how to enable terrain elevation by default in production, including
  consent/copy, provider quotas, caching expectations, and failure messaging.
- Whether a future map provider or style should replace or supplement the
  current no-key map style catalog.
- How the product should explain or reconcile strong disagreement between
  terrain, GPX, and barometric elevation sources beyond the current source-aware
  confidence and diagnostics model.

## Verification

The main verification command is:

```powershell
npm run verify
```

`npm run verify` must run:

- Prettier format check
- ESLint
- Stylelint
- TypeScript checkJs
- Vitest unit tests
- metric regression runner
- large-track performance budget guard
- production build
- production build-output checks
- Playwright e2e tests
- Playwright visual test
- Playwright accessibility test

Local environments and the Windows Pages `verify` job must install the Chromium
browser used by Playwright before executing `npm run verify` with
`npx playwright install chromium`. Separate Linux CI environments can use
`npx playwright install --with-deps chromium`.

Useful focused commands:

```powershell
npm run test
npm run test:metrics
npm run test:metrics:local
npm run test:perf
npm run build
npm run test:build
npm run test:e2e
npm run test:visual
npm run test:a11y
```

`npm run perf:large-track -- --points 10000 --iterations 3 --warmup 1` creates a
deterministic synthetic large GPX track for local diagnostics and remains outside
`npm run verify`.

`npm run test:perf` runs automatically in `npm run verify` as the large-track
performance budget guard. By default it measures 1000 synthetic GPX points with
1 measured iteration and 0 warmup iterations. Default budgets are 250 ms for
upload/read, 2500 ms for parse/analyze, 2500 ms for poster shell render, and
5000 ms total. Thresholds can be overridden with `--max-upload-read-ms`,
`--max-parse-analyze-ms`, `--max-poster-render-ms`, and `--max-total-ms`.

`npm run test:metrics:local` expects an ignored `metric-goldens.local.json`
manifest and is for private real-track regression checks. It is not part of
`npm run verify`.

Committed metric regression coverage includes:

- `tests/fixtures/filtered-golden.json`
- `tests/fixtures/metric-matrix.json`

The public matrix covers synthetic GPX, GPX-like XML, TCX, and FIT cases across
device type, recording mode, terrain, elevation source, metric mode, and noise
scenario axes. It also enforces explicit required format/mode combinations.
