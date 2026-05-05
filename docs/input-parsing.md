# Input Parsing Specification

Status: Current mechanics, subordinate to `docs/product-spec.md`

`docs/product-spec.md` remains the authoritative product source of truth. This
document elaborates the current input parsing mechanics implemented by
`src/core/track-source-format.js`, `src/core/track-source-parser.js`,
`src/core/gpx-parser.js`, `src/core/tcx-parser.js`, and
`src/core/fit-parser.js`.
Shared parser primitives are owned by `src/core/track-source-primitives.js`,
and shared XML local-name helpers are owned by `src/core/xml-parser-helpers.js`.

## Product Contract

Frame Your Trail accepts local GPX, supported GPX-like XML, TCX, and FIT route
files. Parsing runs in the browser and normalizes supported formats into one
route source model before validation, terrain enrichment, metric analysis, and
poster rendering.

The XML compatibility path exists for GPX-like exports with supported route
geometry. It is not a promise to parse arbitrary XML schemas, KML, CSV, or
extension-only `.xml` files.

## Format Detection

`getTrackSourceFormat(fileName, mediaType)` chooses the parser from the file
name and media type:

| Input signal                                              | Routed format |
| --------------------------------------------------------- | ------------- |
| `.gpx` extension                                          | `gpx`         |
| `.tcx` extension                                          | `tcx`         |
| `.fit` extension                                          | `fit`         |
| media type containing `gpx`                               | `gpx`         |
| media type containing `tcx`                               | `tcx`         |
| media type containing `fit`                               | `fit`         |
| media type containing `xml` and not already routed as TCX | `gpx`         |
| `application/octet-stream` plus `.fit` extension          | `fit`         |

Unsupported inputs return `null` from the format helper and are rejected by the
parser facade with `GpxParseError` code `unsupported_format`.

`parseTrackSource(source, fileName, { mediaType })` enforces source type at the
facade boundary:

- GPX and TCX require text input.
- FIT requires `ArrayBuffer` input.
- FIT parsing is loaded lazily through `import("./fit-parser.js")`.
- Successful parser output is wrapped by `createRouteSource(...)` with format
  and parser provenance.

## Normalized Route Source

All supported parser paths normalize into route points that can include:

- latitude and longitude
- elevation, elevation source, elevation datum, and elevation normalization
- original timestamp text, parsed timestamp, and timezone status
- source segment index
- GPX GNSS quality fields such as fix, satellites, HDOP, VDOP, PDOP, and geoid
  height
- TCX ActivityExtension sensor metadata
- raw extension fragments
- structured activity provenance when a supported source field is present

The normalized route source also preserves file name, display name, elevation
and time availability flags, parser provenance, and imported summary data when a
supported format exposes it.

## Structured Activity

Parsers preserve explicit structured activity only from fields that are intended
to carry activity type:

- FIT reads the first session `sport`, falling back to first session
  `sub_sport` only when `sport` is missing.
- TCX reads the nearest containing `Activity` `Sport` attribute for parsed
  trackpoints.
- GPX reads direct `trk > type` first, then direct `rte > type`.

Structured activity normalization and provenance creation are owned by
`src/core/activity-provenance.js`.

Recognized values are normalized to coarse `bike`, `foot`, `water`, or `motor`
activity types. Unknown structured values produce `activity: null`. GPX names,
descriptions, links, metadata text, and extension free text are ignored for
activity; they are not used to infer sport or speed profiles.

## GPX-Compatible XML

The GPX-compatible parser:

- requires source text that starts with XML markup and parses as well-formed
  XML;
- does not require a `<gpx>` root;
- collects lowercase `trkpt` elements first and lowercase `rtept` elements
  second;
- requires lowercase `lat` and `lon` attributes on each route point;
- ignores standalone waypoint-only `wpt` data for route analysis;
- uses tag-name lookup for `trkpt` and `rtept`, which is case-sensitive in the
  current browser DOM behavior;
- uses direct child local names for point fields such as `ele`, `time`, `fix`,
  `sat`, `hdop`, `vdop`, `pdop`, and `geoidheight`;
- assigns globally unique source segment indexes for recognized `trkseg`
  containers with direct `trkpt` children and `rte` containers with direct
  `rtept` children;
- treats points outside recognized direct-owning containers as segment zero only
  when no physical container can be identified;
- flattens multiple tracks, track segments, and routes into one route source.

When a file mixes `trkpt` and `rtept`, the current parser order is all track
points followed by all route points. This is a current implementation detail,
not a general XML document-order guarantee.

GPX point extensions can mark elevation source as barometric through normalized
extension element names `elevationsource` or `altitudesource` with value
`barometric`. They can mark elevation datum as `ellipsoid` or `msl` through
`elevationdatum` or `heightreference`; ellipsoid elevation is converted to MSL
when a numeric `geoidheight` is present.

Zero-filled placeholder elevation series are treated as missing elevation when a
large enough route has a dominant zero series with sparse non-zero outliers.
Explicit barometric provenance is preserved even when placeholder cleanup
removes numeric elevation.

GPX parsing records normalization provenance for zero-filled elevation
placeholder cleanup, flat timestamp cleanup, and synthetic timestamp cleanup.
These records explain parser cleanup decisions and do not change displayed
fields by themselves.

## Time Handling

GPX and TCX timestamps with an explicit offset or `Z` suffix are parsed as
absolute instants. Timezone-less timestamps are accepted as UTC instants and
marked with missing timezone metadata.

GPX timing is treated as missing per physical segment when the parser detects:

- flat repeated timestamps;
- invalid or non-monotonic effective timing;
- repeated geometry-inconsistent short-cadence timing that implies impossible
  speeds after suppressing isolated out-and-back spikes.

These timing cleanups should not block route analysis. They remove untrusted
timing from affected segments so speed and moving-time logic can fall back to
missing-time behavior.

## Imported Summaries

Imported summaries are preserved only for `imported_summary` metric mode. They
do not override point-based analysis in recomputed modes.

GPX summary extraction scans extension descendants and attributes whose
normalized names match supported aliases. Preserved fields may include:

- total distance and 3D distance
- total, moving, and stopped duration
- average, moving average, and maximum speed
- elevation gain and loss
- minimum, maximum, and range elevation

Garmin TrackStats moving speed and maximum speed values are converted from m/s
to km/h. GPX provenance records format, point count, segment count, and direct
raw extension fragments from the document root, metadata, and track levels.
GPX link URLs and link text are not used to infer activity type or speed
profiles.

TCX summaries come from `Lap` values. Current supported fields include summed
`DistanceMeters`, summed `TotalTimeSeconds`, summed `Calories`, and maximum
`MaximumSpeed` converted from m/s to km/h. TCX moving duration currently matches
total duration when lap summary data is used. Imported average and moving speed
values are derived from imported distance and duration when the summary does not
provide explicit speeds and the imported distance and matching duration are
finite and positive.

FIT summaries come from the first session. Current supported fields include
total distance, elapsed time, timer time, average speed, maximum speed, total
ascent, and total descent. FIT speed values are converted from m/s to km/h.
Imported mode can derive missing average speed values from finite positive
imported distance and matching duration.

FIT structured activity comes from the first session activity fields described
above. It is separate from imported summary metrics.

## Route Titles

GPX uses the first non-generic track name, then metadata name, then the file name
without extension. Generic/default labels in supported languages and common
numbered or dated variants are ignored.

TCX and FIT use the file name without extension. Their activity/session
identifiers are often timestamps rather than useful poster titles.

## TCX Mechanics

The TCX parser:

- parses XML by local names, including namespaced TCX documents;
- requires `Trackpoint` descendants;
- reads coordinates from `LatitudeDegrees` and `LongitudeDegrees`;
- reads direct child `AltitudeMeters`, `Time`, and `DistanceMeters`;
- uses containing `Lap` elements as segment indexes;
- preserves direct `Extensions` XML from each trackpoint;
- reads Garmin ActivityExtension v2 `TPX` fields for speed, run cadence, and
  watts when those fields are in the expected namespace.

Unrelated extension namespaces are preserved as raw XML but ignored for typed
TCX sensor metadata.

## FIT Mechanics

FIT files are decoded with `fit-file-parser` using list mode, meters, m/s, and
elapsed record fields. The parser normalizes records into route points.

FIT coordinate fields may already be degrees or may be raw semicircles. Values
outside valid degree bounds are converted from semicircles to degrees.

FIT elevation uses `enhanced_altitude` when present, then `altitude`; parsed FIT
elevation is treated as barometric. Timestamps may be Date, string, or numeric
values accepted by the JavaScript Date parser.

FIT segment indexes are derived from effective breaks:

- lap start times after the first lap can create lap boundaries;
- timer stop/start event pairs can create timer boundaries;
- numeric event and event type values are normalized for known timer events;
- breaks outside the point timestamp range are ignored;
- untimed records after a break can be assigned to the post-break segment when
  the break falls between timed records.

FIT provenance records point count, segment count, segment source, lap and timer
break counts, session/lap/event counts, profile and protocol versions, and
normalized timer event diagnostics.

## Errors And Validation

Blocking parse errors use `GpxParseError` so UI mapping is shared across worker
and fallback paths:

- source is not XML for XML formats: `not_xml`
- XML cannot be parsed: `invalid_xml`
- FIT cannot be parsed or source type is wrong: `parse_error`
- no route points or records: `empty_track`
- a route point has missing coordinates: `missing_coordinates`
- coordinates are outside latitude/longitude bounds:
  `coordinates_out_of_bounds`
- unsupported format: `unsupported_format`

Validation after parsing can add warnings for missing elevation,
terrain-restored elevation, missing time, and large files of 50 MB or more.
Validation can also block analysis when fewer than two usable points remain.

Large-file warnings are advisory. The app does not currently define a hard
point-count limit, progress UI, or a degraded metrics mode separate from the
standard analysis path.

## Verification Coverage

Primary coverage:

- `tests/unit/track-source-parser.test.js`
- `tests/unit/gpx-parser.test.js`
- `tests/unit/tcx-parser.test.js`
- `tests/unit/fit-parser.test.js`
- `tests/unit/validation.test.js`
- `tests/unit/track-analysis-pipeline.test.js`
- `tests/unit/lazy-modules.test.js`

Use `npm run test` for the focused unit suite.
