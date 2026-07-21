# Lighten Recreation Landuse

## Goal

Change `POSTER_BACKGROUND_MAP_PALETTE.recreation` from `#D8DFCE` to the exact
muted pale yellow `#ECE7D2`, so recreation landuse reads more lightly on the
poster map.

## Scope

- Update the existing single palette owner for the `recreation` category.
- Preserve the existing category mapping, including recreation-class landuse
  such as pitches, stadiums, playgrounds, tracks, and cemeteries.
- Do not alter other landuse categories, water fill, coastline, layer filters,
  layer order, or rendering behavior.

## Tests And Acceptance Criteria

- During implementation, update the matching palette assertions to expect
  `#ECE7D2`; tests are not changed by this spec-only commit.
- Miyajima pitch polygons render with the pale muted yellow recreation fill.
- Palette assertions pass, and no unrelated landuse or map styling changes
  are introduced.
- The implementation uses the existing palette owner rather than adding a
  second recreation color source.

## Documentation

No `docs/product-spec.md` update is needed because this changes presentation,
not a product requirement or user workflow.
