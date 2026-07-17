# OpenFreeMap Detailing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve selected OpenFreeMap fill-pattern details in the existing poster map style.

**Architecture:** `src/render/map-styles.js` remains the single owner for map style catalog and poster palette transformations. The change narrows the existing fill-layer normalization so useful pattern layers keep their pattern while still using the poster fill palette for broad map color. Tests continue to exercise style transformation through the public `initRouteMap` path.

**Tech Stack:** Vite, MapLibre GL JS style specifications, Vitest unit tests, Markdown product docs.

## Global Constraints

- Do not add a new map style option.
- Do not change `openfreemap_poster` as the default map style id.
- Do not change app-owned route, route halo, or start/finish endpoint layers.
- Keep `src/render/map-styles.js` as the single owner for poster map palette transformations.
- Update `docs/product-spec.md` because this changes product-visible map detail behavior.
- Use TDD: write/update the failing unit test before production code.
- Before finishing, use targeted searches for touched names and concepts and centralize any duplicated ownership.

---

### Task 1: Preserve Selected OpenFreeMap Fill Patterns

**Files:**
- Modify: `tests/unit/map.test.js`
- Modify: `src/render/map-styles.js`
- Modify: `docs/product-spec.md`

**Interfaces:**
- Consumes: `initRouteMap(host, points, i18n, speedSeries, options, mapStyleId)` from `src/render/map.js`.
- Produces: Existing `openfreemap_poster` style transformation keeps selected `paint["fill-pattern"]` values on useful fill-pattern layers.

- [ ] **Step 1: Write the failing unit test**

Update the existing `initializes MapLibre with the poster background palette`
expectations in `tests/unit/map.test.js` so `landcover_wetland` and
`road_area_pattern` retain their original patterns:

```js
expect(layerPaint("landcover_wetland")).toEqual({
  "fill-color": "#d7dfd0",
  "fill-pattern": "wetland_bg_11"
});
expect(layerPaint("road_area_pattern")).toEqual({
  "fill-color": "#f0eee3",
  "fill-pattern": "pedestrian_polygon"
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm run test -- tests/unit/map.test.js
```

Expected: the map test fails because the current implementation deletes
`fill-pattern` from all fill layers.

- [ ] **Step 3: Implement the minimal style transformation change**

In `src/render/map-styles.js`, keep the selected patterns before deleting
unwanted fill paint. Add a small helper near the existing palette helpers:

```js
const POSTER_BACKGROUND_MAP_PATTERN_LAYER_IDS = new Set([
  "landcover_wetland",
  "road_area_pattern"
]);
```

Update the fill-layer branch in `applyPosterBackgroundMapPaletteToLayer`:

```js
const preservedFillPattern = getPosterFillPattern(id, paint);

paint["fill-color"] = getPosterFillColor(layerKey);
delete paint["fill-outline-color"];
delete paint["fill-pattern"];

if (preservedFillPattern) {
  paint["fill-pattern"] = preservedFillPattern;
}
```

Add the helper:

```js
function getPosterFillPattern(layerId, paint) {
  const fillPattern = paint["fill-pattern"];

  return POSTER_BACKGROUND_MAP_PATTERN_LAYER_IDS.has(layerId) && typeof fillPattern === "string"
    ? fillPattern
    : null;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test -- tests/unit/map.test.js
```

Expected: `tests/unit/map.test.js` passes.

- [ ] **Step 5: Update product spec**

In `docs/product-spec.md`, update the map requirement that currently says
external fill patterns are neutralized. It should now state that selected
OpenFreeMap fill patterns, including wetland and pedestrian-area patterns, are
preserved when they improve map detail, while unrelated external fill outlines
remain neutralized.

- [ ] **Step 6: Search for duplicated map-detail ownership**

Run:

```powershell
rg -n "fill-pattern|landcover_wetland|road_area_pattern|poster map palette|OpenFreeMap|openfreemap_poster" src tests docs README.md
```

Expected: no second source of truth for which OpenFreeMap patterns are
preserved. If another owner exists, centralize the decision in
`src/render/map-styles.js`.

- [ ] **Step 7: Run unit verification**

Run:

```powershell
npm run test
```

Expected: all unit tests pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add docs/product-spec.md src/render/map-styles.js tests/unit/map.test.js
git commit -m "feat: preserve detailed OpenFreeMap patterns"
```
