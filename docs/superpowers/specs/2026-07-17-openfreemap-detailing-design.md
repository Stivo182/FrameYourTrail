# OpenFreeMap Detailing Design

Date: 2026-07-17
Status: Approved for implementation

## Goal

Increase visual detail in the existing `openfreemap_poster` map style without
adding a new style option or replacing the default poster aesthetic.

## Scope

- Keep `openfreemap_poster` as the default style.
- Keep the existing OpenFreeMap Liberty vector source.
- Restore selected external fill patterns when they provide useful map
  semantics, starting with wetland and pedestrian-area patterns.
- Keep the muted poster palette for broad land, water, road, path, label, and
  boundary colors.
- Keep app-owned route, route halo, and start/finish endpoint layers unchanged.

## Behavior

OpenFreeMap poster maps should preserve useful pattern-based distinctions for
features such as wetlands and pedestrian areas. The map should remain calmer
than `osm_standard`, but those features should no longer be flattened into plain
poster fills.

## Implementation Notes

- Update `src/render/map-styles.js` so the poster palette does not delete
  selected `fill-pattern` values for known useful layers.
- Keep the existing single owner for map style palette behavior in
  `src/render/map-styles.js`.
- Update `tests/unit/map.test.js` to lock the selected pattern behavior.
- Update `docs/product-spec.md` because the map detail behavior is
  product-visible.

## Verification

- Run the focused map unit test during TDD.
- Run the full unit test suite after implementation.
- Run broader verification when feasible before finishing the branch.
