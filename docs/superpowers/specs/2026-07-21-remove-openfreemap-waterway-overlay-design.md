# Remove OpenFreeMap Waterway Overlay

## Goal

Remove the generalized runtime z9 OpenFreeMap waterway overlay because it does
not meet the product's OSM Standard detail goal. Keep all waterway rendering
provided by the loaded native and supplemental style layers.

## Scope

- Remove the overlay imports, planning, fetching, decoding, source/layer
  insertion, cleanup, and related control flow from `src/render/map.js`.
- Delete `src/render/waterway-detail.js` and its dedicated unit test.
- Remove the overlay-only vector-tile helper and regression fixture, and remove
  only the overlay-specific cases and imports from
  `tests/unit/map-renderer.test.js`.
- Remove the z9 overlay bullet from `docs/product-spec.md`.
- Move `@mapbox/vector-tile` and `pbf` from `dependencies` to
  `devDependencies` in `package.json` and keep `package-lock.json` consistent.

The change does not alter native OpenFreeMap style layers, supplemental
waterway labels/fills, route fitting, static-map fallback behavior, or the
OpenFreeMap contract checker and its fixtures/tests.

## Data Flow After Removal

After the style loads, map rendering applies the style's native and
application-owned supplemental layers, then adds the route and endpoint
overlays as usual. No route-fit zoom check triggers TileJSON discovery, z9 tile
requests, vector-tile decoding, or a separate waterway source. Overlay failure
and cancellation paths therefore disappear; style-load and map-render error
semantics remain unchanged.

## Dependency Ownership

The runtime bundle no longer owns `@mapbox/vector-tile` or `pbf`. They remain
development dependencies because `scripts/check-openfreemap-contract.mjs` and
its unit tests decode provider fixtures. The lockfile must record the same
dependency classification and retain the contract workflow.

## Failure And Rollback

With the overlay removed, missing or changed provider TileJSON cannot create a
new runtime failure because the app no longer requests it. Native style
loading, supplemental layer construction, route rendering, and static fallback
must retain their existing best-effort behavior. Rollback is the single commit
that restores the overlay module, map integration, dedicated test assets,
product bullet, and runtime dependency classification together.

## Tests And Acceptance Criteria

- Overlay-specific tests, fixture, and helper are removed; remaining map tests
  still assert native and supplemental waterway layers and existing fallback
  behavior.
- Contract checker tests still pass and continue to use the two dev-only
  decoder packages.
- Targeted unit tests, formatting/lint/type checks, and the build/test-build
  checks pass; run the full `npm run verify` when feasible.
- A production bundle has no runtime import or overlay identifiers for the z9
  waterway path, while the live/offline OpenFreeMap contract workflow remains
  available.
- The product spec no longer promises a z9 waterway overlay, and no unrelated
  files are changed.
