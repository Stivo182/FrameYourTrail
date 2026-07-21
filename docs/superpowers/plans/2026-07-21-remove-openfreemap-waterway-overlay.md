# Remove OpenFreeMap Waterway Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the generalized runtime z9 OpenFreeMap waterway overlay while retaining native and supplemental waterway rendering and the live/offline OpenFreeMap contract checker.

**Architecture:** Delete the overlay's runtime module and its dedicated test data, then simplify `src/render/map.js` so the style's native and application-owned supplemental layers flow directly into route and endpoint rendering. Reclassify the decoder packages as development-only dependencies because only the contract checker and its tests still import them; leave the contract workflow, checker, fixtures, and tests intact.

**Tech Stack:** JavaScript ES modules, MapLibre GL, Vitest, Vite, npm lockfiles, Markdown product documentation, GitHub Actions.

## Global Constraints

- The runtime bundle no longer owns `@mapbox/vector-tile` or `pbf`.
- They remain development dependencies because `scripts/check-openfreemap-contract.mjs` and its unit tests decode provider fixtures.
- The change does not alter native OpenFreeMap style layers, supplemental waterway labels/fills, route fitting, static-map fallback behavior, or the OpenFreeMap contract checker and its fixtures/tests.
- A production bundle has no runtime import or overlay identifiers for the z9 waterway path, while the live/offline OpenFreeMap contract workflow remains available.
- No unrelated files are changed.

---

### Task 1: Remove Overlay Integration, Assets, and Runtime Ownership

**Files:**
- Modify: `src/render/map.js` (remove the `waterway-detail.js` import, the default-style overlay call after route fitting, and the `addOpenFreeMapWaterwayDetail` helper with its source/layer cleanup path)
- Delete: `src/render/waterway-detail.js`
- Modify: `tests/unit/map.test.js` (remove the overlay helper import and the three overlay-only integration/cancellation/insertion-failure tests; retain native and supplemental waterway assertions and fallback tests)
- Delete: `tests/unit/waterway-detail.test.js`
- Delete: `tests/helpers/vector-tile.js`
- Delete: `tests/fixtures/openfreemap-waterway-detail-tunnel-regression.json`
- Modify: `package.json` (move `@mapbox/vector-tile` and `pbf` from `dependencies` to `devDependencies`)
- Modify: `package-lock.json` (regenerate the root dependency classification without removing transitive package entries required by the contract checker or other development tooling)
- Modify: `docs/product-spec.md` (remove only the bullet promising the capped best-effort z9 waterway overlay)

**Interfaces:**
- Consumes: the existing style-load, supplemental-layer, route, endpoint, route-fit, cancellation, and static-fallback flow in `src/render/map.js`.
- Produces: route maps that never discover OpenFreeMap TileJSON or fetch/decode z9 waterway tiles, while preserving existing native/supplemental layer behavior and fallback semantics.

- [ ] **Step 1: Capture the current affected references and verify the worktree is clean**

  Run:

  ```powershell
  git status --short
  rg -n -i "waterway-detail|openfreemap-waterway-detail|z9 waterway|createWaterwayVectorTile|@mapbox/vector-tile|\\bpbf\\b" src tests scripts docs/product-spec.md package.json package-lock.json .github
  ```

  Expected: `git status --short` prints no paths; the search distinguishes overlay-owned references in `src/` and map tests from contract-checker references in `scripts/`, contract tests, and provider fixtures.

- [ ] **Step 2: Remove the runtime overlay control flow from `src/render/map.js`**

  Delete the three-name import from `./waterway-detail.js`. In the default-style branch after `map.fitBounds(...)`, keep `nudgeRouteMapToDetailZoom(map, mapBounds);` and remove the awaited `addOpenFreeMapWaterwayDetail(...)` call. Delete the entire `addOpenFreeMapWaterwayDetail` function, including its plan creation, TileJSON/tile fetch, abort checks specific to the overlay, GeoJSON source insertion, line/label layer insertion, and best-effort cleanup of partially inserted layers/source. Leave the surrounding `throwIfRouteMapAborted(signal)`, initialization callback, idle wait, catch/fallback handling, and all native/supplemental layer construction unchanged.

- [ ] **Step 3: Delete the overlay module and dedicated test assets**

  Remove these files so no overlay implementation or overlay-only vector-tile encoder remains:

  ```powershell
  Remove-Item -LiteralPath 'src/render/waterway-detail.js'
  Remove-Item -LiteralPath 'tests/unit/waterway-detail.test.js'
  Remove-Item -LiteralPath 'tests/helpers/vector-tile.js'
  Remove-Item -LiteralPath 'tests/fixtures/openfreemap-waterway-detail-tunnel-regression.json'
  ```

- [ ] **Step 4: Remove only overlay-specific cases from the map unit tests**

  In `tests/unit/map.test.js`, delete the `createWaterwayVectorTile` import and remove the tests named `adds z9 waterway detail below the route without changing a broad route fit`, `promptly cancels a broad route map while a TileJSON body ignores abort`, and `keeps detail %s insertion failures best-effort`. Preserve the adjacent route-map tests, native `waterway_*` assertions, supplemental `poster-waterway-label` assertions, route-fit behavior, cancellation behavior, and static fallback coverage. Do not remove or modify imports and cases used by the OpenFreeMap contract checker tests.

- [ ] **Step 5: Move decoder packages to development dependencies and synchronize the lockfile**

  Update `package.json` so the exact existing version ranges are listed under `devDependencies`, and neither package remains under `dependencies`. Then regenerate only lockfile metadata from the manifest:

  ```powershell
  npm install --package-lock-only --ignore-scripts
  ```

  Confirm the root package entry in `package-lock.json` lists both packages under `devDependencies`, while `node_modules/@mapbox/vector-tile` and `node_modules/pbf` entries remain available for the contract checker and its tests.

- [ ] **Step 6: Remove the obsolete product promise and preserve the contract path**

  Delete only the `docs/product-spec.md` bullet beginning `when a default OpenFreeMap route fit remains below zoom 9`. Keep the surrounding waterway-detail requirements for native and supplemental rendering. Verify these files still exist and retain their decoder imports/workflow behavior: `scripts/check-openfreemap-contract.mjs`, `tests/unit/check-openfreemap-contract.test.js`, `tests/fixtures/openfreemap-provider-feature-contract.json`, `tests/fixtures/openfreemap-liberty-contract.json`, and `.github/workflows/openfreemap-contract.yml`.

- [ ] **Step 7: Run focused formatting, static checks, and contract/map tests**

  Run:

  ```powershell
  npm run format:check
  npm run lint
  npm run lint:css
  npm run typecheck
  npm run test -- tests/unit/map.test.js tests/unit/check-openfreemap-contract.test.js
  npm run build
  npm run test:build
  ```

  Expected: all commands pass; the focused Vitest run reports the remaining map and contract tests passing; the production build and build-output check pass without overlay runtime imports or identifiers.

- [ ] **Step 8: Validate references, duplication, documentation, and the complete verification suite**

  Run:

  ```powershell
  rg -n -i "waterway-detail|openfreemap-waterway-detail|z9 waterway|createWaterwayVectorTile" src tests docs package.json package-lock.json
  rg -n "@mapbox/vector-tile|\\bpbf\\b|check-openfreemap-contract|openfreemap-contract" scripts tests .github package.json package-lock.json
  npm run verify
  git diff --check
  git status --short
  ```

  Expected: the first search returns no overlay/runtime/overlay-fixture references; the second search shows decoder ownership only in development/contract paths and the workflow remains referenced; `npm run verify` passes; `git diff --check` is clean; only the intended implementation files and documentation changes are present. If a repeated overlay decision or data source remains, remove the duplicate rather than adding a new owner.

- [ ] **Step 9: Remove the completed plan and commit the implementation**

  After all implementation checks pass, remove this completed planning file as required by `AGENTS.md`, then commit the implementation as one rollback unit:

  ```powershell
  Remove-Item -LiteralPath 'docs/superpowers/plans/2026-07-21-remove-openfreemap-waterway-overlay.md'
  git add src/render/map.js src/render/waterway-detail.js tests/unit/map.test.js tests/unit/waterway-detail.test.js tests/helpers/vector-tile.js tests/fixtures/openfreemap-waterway-detail-tunnel-regression.json package.json package-lock.json docs/product-spec.md docs/superpowers/plans/2026-07-21-remove-openfreemap-waterway-overlay.md
  git diff --cached --check
  git commit -m "refactor: remove OpenFreeMap waterway overlay"
  git status --short
  ```

  Expected: the commit contains only the listed overlay removal, dependency, and product-spec changes; the plan file is absent after the implementation commit; the worktree is clean.
