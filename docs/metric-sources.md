# Metric Sources Specification

Status: Current mechanics, subordinate to `docs/product-spec.md`

`docs/product-spec.md` remains the authoritative product source of truth. This
document elaborates the current metric source mechanics implemented by
`src/core/analysis-mode-core.js`, `src/core/analysis-modes.js`,
`src/core/metric-modes.js`, and
`src/controllers/analysis-mode-controller.js`.

## Product Contract

Metric sources let the user choose which trusted source backs displayed route
metrics for the current upload. The product keeps point-based recomputation as
the default route analysis contract, except when existing terrain fallback
elevation makes terrain analysis the default. Imported and terrain-backed values
are exposed only when the loaded route and provider state support them.

Changing metric source must not rewrite the original uploaded file data.
Imported summaries override only displayed analysis in `imported_summary` mode.
Terrain replacement updates the current parsed route only after an explicit
provider-enabled replacement succeeds.

## Modes

| Mode                  | Meaning                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recomputed_filtered` | Default point-based analysis after conservative cleaning.                                                                                                                                            |
| `recomputed_raw`      | Point-based analysis using the raw source point stream before terrain replacement, followed by the standard conservative cleaning pipeline. This is not a no-cleaning parser-raw mode.               |
| `recomputed_terrain`  | Point-based analysis using terrain-restored or terrain-replaced elevation.                                                                                                                           |
| `imported_summary`    | Displayed metrics backed by imported summary fields from the route file. Missing imported average speeds are derived from imported distance and matching duration when both are finite and positive. |

The legacy identifier `recomputed_basecamp` normalizes to
`recomputed_filtered`.

## Availability

Available modes are modes that can be directly analyzed from the current parsed
route source:

- `recomputed_filtered` is always included for a valid analyzed route.
- `recomputed_raw` is always included for a valid analyzed route.
- `recomputed_terrain` is included when the parsed route source or any point has
  terrain elevation.
- `imported_summary` is included when `parsed.importedSummary` is an object.

Default mode rules:

- use `recomputed_terrain` when terrain elevation exists and was not created by
  explicit replacement;
- otherwise use `recomputed_filtered`;
- after explicit terrain replacement, keep `recomputed_filtered` as the default
  while making terrain mode available.

## Selectability

Selectable modes are modes shown to the user as possible actions:

- all available modes are selectable;
- provider-enabled terrain replacement can make `recomputed_terrain`
  selectable before terrain mode is available;
- terrain replacement is selectable only when explicitly allowed by the caller,
  terrain is not already available, and the parsed route has replaceable
  elevation or points.

Hidden or unavailable modes must not be applied from persisted state. They fall
back to the loaded route's default mode.

## Localized Labels

The current English and Russian metric source labels are part of the product
contract and are covered by `tests/unit/i18n.test.js`:

| Mode key                     | English                   | Russian                    |
| ---------------------------- | ------------------------- | -------------------------- |
| `recomputed_filtered`        | `Recommended`             | `Рекомендуемые`            |
| `recomputed_raw`             | `From track points`       | `По точкам трека`          |
| `recomputed_terrain`         | `Terrain elevation`       | `По высотам рельефа`       |
| `recomputed_terrain_request` | `Fetch terrain elevation` | `Загрузить высоты рельефа` |
| `imported_summary`           | `File totals`             | `Итоги из файла`           |

## Upload-Time Selection

During source analysis, the pipeline chooses the loaded route's default mode
unless the previous selected mode was non-default and remains available for the
new route. This lets a user keep an intentional non-default choice across
compatible uploads without applying stale choices to incompatible files.

Saved metric source preferences are restored only when the source is available
or selectable for the loaded route. Otherwise the app uses the current default.

## Regular Mode Changes

For `recomputed_filtered`, `recomputed_raw`, already available
`recomputed_terrain`, and `imported_summary`, the controller:

1. verifies that a parsed route exists and the selected mode is selectable;
2. gets a request token so stale async results can be ignored;
3. recomputes analysis for the selected mode;
4. updates state only when the request is still current and the parsed route has
   not changed.

Regular mode changes do not mutate parsed route data.

If regular recomputation fails, the controller keeps the current parsed route
and updates state with a generic parse-error message.

## Explicit Terrain Replacement

When terrain provider support is enabled and the user selects terrain mode
before terrain is available, the controller treats the selection as an explicit
terrain replacement request.

Replacement behavior:

- if `terrain_elevation_unavailable` is already present, render the existing
  state without issuing duplicate work;
- if terrain enrichment is not available, append
  `terrain_elevation_unavailable` once;
- otherwise call `enrichParsedTrackFromTerrain(parsed, { mode: "replace" })`;
- ignore stale results when request token, parsed route, file name, file size,
  or current analysis mode no longer match the original request;
- if enrichment completes but terrain mode is still unavailable, append
  `terrain_elevation_unavailable` once;
- validate the enriched route and analyze it in `recomputed_terrain`;
- after a current successful result, update parsed route, analysis mode,
  analysis, warnings, and errors from the enriched path.

Successful explicit replacement switches the current selection to
`recomputed_terrain` for that route, but it does not make terrain mode the
default for later recomputation.

Failed explicit replacement keeps the previous parsed track, current analysis,
persisted selected mode, and menu state as much as possible, and reports failure
with `terrain_elevation_unavailable` or the generic parse-error state depending
on where the failure occurred.

## Imported Summary Mode

`imported_summary` starts from the filtered computed analysis, then overlays
normalized imported fields that are finite. Null imported fields do not erase
computed values.

Imported mode:

- sets result mode to `imported_summary`;
- attaches the normalized imported summary;
- replaces moving-time provenance flags with `summary_imported`;
- adds `imported_summary` to provenance filters;
- keeps point-based diagnostics, terrain availability, parsed points, and future
  recomputation state intact.

Normalized imported summaries can derive stopped duration from total and moving
duration when both are finite, and elevation range from imported min/max when
range is absent.
They can also derive missing elapsed-average and moving-average speeds from
imported distance and the matching total or moving duration when both values are
finite and positive. Explicit imported speed values take precedence.

## Lazy Available Summaries

`analyzeParsedTrack(...)` can expose `availableSummaries` for UI or tests. These
summary entries are enumerable lazy getters for imported, raw, filtered, and
terrain modes. The getter computes the backing mode only when read.

The UI pipeline calls analysis with `includeAvailableSummaries: false`, so it
computes only the selected mode during upload and mode changes.

## Relationship To Metric Calculation

Metric source selection chooses the point stream or imported overlay used for
the displayed analysis. It does not change the core metric calculation rules.
The point-based rules for distance, speed, moving time, activity inference,
elevation gain/loss, chart profile, and diagnostics remain in
`docs/product-spec.md`, `docs/speed-calibration.md`,
`docs/elevation-model.md`, `docs/elevation-calibration.md`, and
`docs/elevation-fixtures.md`.

## Verification Coverage

Primary coverage:

- `tests/unit/analysis-modes.test.js`
- `tests/unit/metric-modes.test.js`
- `tests/unit/metric-modes-lazy.test.js`
- `tests/unit/analysis-mode-controller.test.js`
- `tests/unit/track-analysis-pipeline.test.js`
- `tests/e2e/app.spec.js`

Focused checks include `npm run test` and `npm run test:e2e`.
