# River Detail Task Report

Status: DONE

## Scope Delivered

- Added `src/render/waterway-detail.js` as the single owner of the bounded
  OpenFreeMap z9 waterway overlay planning, TileJSON resolution, timed fetching,
  vector-tile decoding, tunnel exclusion, and derived detail layers.
- Integrated the overlay into `src/render/map.js` only for
  `openfreemap_poster` after the existing route fit/nudge. It leaves the fitted
  viewport unchanged, adds linework below the route, and inserts labels in the
  existing text-label tier.
- Moved `@mapbox/vector-tile` and `pbf` from dev dependencies to runtime
  dependencies without duplicate declarations.
- Updated `docs/product-spec.md` for the product-visible z9 overlay behavior.

## RED Evidence

1. `npm run test -- tests/unit/waterway-detail.test.js`
   initially failed because `src/render/waterway-detail.js` did not exist.
2. `npm run test -- tests/unit/map.test.js -t "adds z9 waterway detail"`
   initially failed with `Cannot read properties of undefined (reading 'data')`:
   no detail source was present on the rendered map.
3. `npm run test -- tests/unit/waterway-detail.test.js -t "times out a fetch"`
   initially failed with `expected 'timed out' to be null`, proving that an
   abort-ignoring fetch was not bounded before the promise-race timeout fix.

## Tests And Checks

- Focused unit tests:
  `npm run test -- tests/unit/waterway-detail.test.js tests/unit/map.test.js -t "waterway detail|retries failed OpenFreeMap style"`
  passed: 9 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm run build` passed.
- `npm run test:build` passed.
- `git diff --check` passed before commit.
- Per controller direction, `npm run verify` was not run.

## Manual Live Verification

- Started the worktree server at `http://127.0.0.1:5175/`.
- A Playwright probe uploaded
  `C:/Users/d.ivanov/Downloads/r-bakhapcha-i-bakhapchinskie-gory-zabroska (1).gpx`.
  It observed a live MapLibre canvas, no static fallback, and exactly these six
  z9 requests: x `470..471`, y `143..145`.
- A direct live style/TileJSON/decode probe at the supplied fitted zoom `8.1856`
  returned `tileCount: 6`, `featureCount: 19`, and `namedFeatureCount: 19`.
  This restores detail beyond the original four rendered features while keeping
  the map fit unchanged.

## Documentation And Self-Review

- `docs/product-spec.md` was updated; no README change was needed because the
  user-visible map behavior is specified there.
- Searched all touched overlay and TileJSON concepts. The new module owns tile
  coverage, source derivation, decoding, and layer derivation; `map.js` only
  coordinates it.
- The overlay uses the loaded style's waterway source and TileJSON URL, not a
  hard-coded provider source id or volatile tile version. Malformed TileJSON,
  missing layers, tile failures, and timed-out requests return no overlay;
  explicit render aborts still propagate to the existing cancellation path.

## Commit And Worktree

- Commit: `42c6698 fix: restore OpenFreeMap river detail below z9`
- Committed files: `docs/product-spec.md`, `package.json`, `package-lock.json`,
  `src/render/map.js`, `src/render/waterway-detail.js`,
  `tests/unit/map.test.js`, and `tests/unit/waterway-detail.test.js`.
- Preserved and excluded from staging/commit: the user's uncommitted
  `src/render/map-styles.js` rock color change.

## Concerns

- No blocker. Full `npm run verify` remains intentionally deferred for the
  controller's final review.

## Review Fixes

Status: DONE

### Cancellation

- RED: `npm run test -- tests/unit/map.test.js -t "promptly cancels a broad route map"`
  failed because the render was still `pending` after parent abort while the
  detail fetch ignored its nested abort signal.
- Fix: parent abort now participates directly in the detail request promise
  race. The map integration catches that rejection and translates an aborted
  parent signal through the existing `RouteMapAbortError` cancellation path.
- GREEN: the same focused test passed. It proves prompt `status: cancelled`, no
  static fallback, and removal of the MapLibre host even when the fetch settles
  later.

### Tile Cap Allocation

- RED: `npm run test -- tests/unit/waterway-detail.test.js -t "before materializing"`
  observed `262144` z9 tile-object pushes for world bounds before returning
  `null`.
- Fix: the planner now computes tile-range width and height, rejects coverage
  above `maxTileCount`, and only then creates coordinate objects.
- GREEN:
  `npm run test -- tests/unit/waterway-detail.test.js -t "before materializing|six z9 tiles|tile cap"`
  passed all three focused cases with zero world-tile materialization.

### Best-Effort Map Insertion

- RED: `npm run test -- tests/unit/map.test.js -t "insertion failures best-effort"`
  returned `status: fallback` for source, line-layer, and label-layer insertion
  failures.
- Fix: detail derivation and insertion are contained inside the optional overlay
  boundary. Successfully inserted detail layers are tracked and removed in
  reverse order before source cleanup; cleanup errors remain non-fatal.
- GREEN: the same focused command passed all three cases with `status: ready`,
  no fallback, no partial detail source/layers, and no map removal.

### Coverage Expansion

- Added a shared encoded-vector-tile fixture owner at
  `tests/helpers/vector-tile.js`.
- `tests/unit/waterway-detail.test.js` now separately covers TileJSON request
  failure, malformed TileJSON, partial tile-level failure, absent MVT
  `waterway` layer, tunnel and non-line exclusion, preserved decoded name/class/
  rank properties, renamed style source derivation, and preserved native line
  plus poster-label paint/layout.
- Covering result: `npm run test -- tests/unit/waterway-detail.test.js` passed all
  12 tests.
- Final affected integration result:
  `npm run test -- tests/unit/map.test.js -t "adds z9 waterway detail|promptly cancels a broad route map|insertion failures best-effort"`
  passed 5 tests.

### Review Verification Scope

- Review-fix commit: `4e9ceb2 fix: harden OpenFreeMap detail overlay`.
- Per controller direction, no full `npm run verify` or additional broad checks
  were run in this review-fix pass.
- The user's uncommitted `src/render/map-styles.js` rock color remained untouched
  and excluded from staging.

### Final Independent Validation

- Added explicit malformed-vector-tile coverage: one corrupt MVT response is
  ignored while a sibling tile still decodes and contributes its named feature.
  This complements the existing HTTP tile failure, malformed TileJSON, absent
  `waterway` MVT layer, property preservation, and style-layer derivation cases.
- Fresh focused checks passed:
  `npm run test -- tests/unit/waterway-detail.test.js` (13 tests) and
  `npm run test -- tests/unit/map.test.js -t "adds z9 waterway detail|promptly cancels a broad route map|insertion failures best-effort"`
  (5 tests).
- Fresh `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `git diff --check` passed.
- A broader two-file test command also ran. Its three failures assert the prior
  `#d2d0c7` rock color and are caused solely by the user's uncommitted
  `src/render/map-styles.js` change; all waterway-detail and review-targeted map
  cases passed. That file remains unmodified and excluded from this patch.
- Documentation/spec check: no additional product documentation change was
  needed because this validation-only follow-up does not alter the already
  specified overlay behavior.

### Re-review: Response Body Boundaries

- RED: `npm run test -- tests/unit/waterway-detail.test.js -t "TileJSON body|vector-tile bodies"`
  failed both new regressions with `expected 'timed out' to be null`. The map
  cancellation regression with a stalled TileJSON `json()` body reached its 5 s
  test timeout, proving the header-only timeout boundary.
- Fix: `fetchAndReadWithTimeout` now races one operation that includes both
  `fetch()` and the caller's full response-body reader. TileJSON `json()` and
  successful MVT `arrayBuffer()` calls run inside that operation, so timeout and
  parent abort settle even when a body method ignores the request signal.
- GREEN: `npm run test -- tests/unit/waterway-detail.test.js` passed 15 tests;
  `npm run test -- tests/unit/map.test.js -t "adds z9 waterway detail|TileJSON body ignores abort|insertion failures best-effort"`
  passed 5 tests. The map case proves a parent abort returns `cancelled` with
  neither a static fallback nor a MapLibre host while TileJSON body consumption
  remains stalled.
- Fresh `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `git diff --check` passed. No full verification suite was run per controller
  direction. Documentation/spec check: no product-visible behavior changed, so
  the existing product spec remains current.
