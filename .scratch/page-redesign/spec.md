# Outdoor Editorial Redesign for the Application Shell

Status: implemented

## Problem Statement

Frame Your Trail already produces a distinctive terrain-themed route poster, but
the surrounding page feels like a generic utility. The empty state is a large,
mostly blank dashed panel whose upload action is visually separated in the
command bar, so first-time users do not get a strong sense of the result they
are about to create. The current cold gray application background and dense row
of equally weighted controls also compete with the warm, editorial character of
the poster.

Users need an interface that makes the route poster the clear focal point,
communicates file privacy accurately, and gives upload and export actions an
obvious hierarchy without turning the product into a dashboard or changing the
poster itself.

## Solution

Redesign the application shell as a restrained outdoor editorial studio. In the
empty state, show a compact identity bar and a prominent upload hero that reuses
the existing watercolor landscape, presents the supported route formats, makes
click and drag-and-drop upload visibly actionable, and states that the route
file stays in the browser.

After a route is loaded, preserve the compact command bar but make it visually
lighter than the poster. Change the upload action to a secondary "Replace
route" action, keep metric source and map style selectors available, make
export the primary action, and retain print and language as utilities. Present
the scaled poster as a sheet on a warm neutral workspace with a subtle border
and shadow. Keep the fixed poster surface, route analysis, export, print,
localization, menu, privacy, and network behavior unchanged.

## User Stories

1. As a first-time visitor, I want to understand immediately that the product turns route files into posters, so that I know what result to expect.
2. As a first-time visitor, I want the upload action to be the visual focus of the empty state, so that I know how to begin.
3. As a first-time visitor, I want to see which file formats are supported before choosing a file, so that I do not waste time attempting an unsupported upload.
4. As a desktop user, I want to drag a route file onto an obvious drop target, so that importing a route feels direct.
5. As a keyboard user, I want to reach and activate the route file picker without relying on drag-and-drop, so that I can use the complete workflow.
6. As a privacy-conscious user, I want clear and accurate copy stating that my route file stays in the browser, so that I understand how the app handles my data.
7. As a privacy-conscious user, I do not want the privacy message to imply that optional map, geocoding, or terrain requests never use the network, so that the interface remains truthful.
8. As a returning user with a loaded poster, I want the upload action to say "Replace route", so that its consequence is clear.
9. As a returning user, I want replacing a route to use the same reliable file-processing workflow as the initial upload, so that the redesign does not change results.
10. As a poster creator, I want the poster to dominate the page visually, so that I can evaluate the printable output without interface clutter.
11. As a poster creator, I want the application workspace to look visually related to the terrain poster, so that the experience feels like one product.
12. As a poster creator, I want the poster preview to remain a faithful scale of the fixed export surface, so that the redesign does not change exported output.
13. As a poster creator, I want the metric source selector to remain available after upload, so that I can choose the appropriate route metrics.
14. As a poster creator, I want the map style selector to remain available after upload, so that I can choose the appropriate map treatment.
15. As a poster creator, I want export to be the most prominent loaded-state action, so that the natural next step is easy to find.
16. As a poster creator, I want PNG, JPEG, PDF, and supported clipboard exports to remain grouped in the existing export menu, so that format selection stays compact.
17. As a poster creator, I want print to remain a separate action next to export, so that printing is direct and does not become another export format.
18. As a user waiting for export, I want the existing blocking progress and error feedback to remain intact, so that I know when the poster is ready or an export fails.
19. As a multilingual user, I want every new or changed shell label in my selected language, so that the redesign does not reduce localization coverage.
20. As a multilingual user, I want changing language to update the empty and loaded states consistently, so that no stale copy remains on screen.
21. As a user with an open selector, I want opening another selector or clicking outside to close the previous one, so that menu behavior remains predictable.
22. As a user whose upload fails, I want the error message to remain prominent and announced, so that the new visual treatment does not hide recovery information.
23. As a user whose route produces warnings, I want warnings to remain visible without overwhelming the poster, so that I can understand limitations before export.
24. As a mobile user, I want controls to wrap into a clear two-row arrangement, so that labels remain readable without horizontal page overflow.
25. As a mobile user, I want the command bar to avoid covering the poster or focused controls, so that the full workflow remains usable on a small screen.
26. As a touch user, I want controls and menu options to have comfortable touch targets, so that I can operate them accurately.
27. As a user at 320 CSS pixels wide, I want all shell content to remain reachable without page-level horizontal scrolling, so that the app remains usable on narrow screens.
28. As a zoomed-text user, I want labels and controls to grow or wrap instead of being clipped, so that browser text scaling remains usable.
29. As a screen-reader user, I want visible labels and accessible names to describe the same actions, so that the interface is understandable non-visually.
30. As a keyboard user, I want a strong visible focus indicator on every interactive control, so that I can track my position.
31. As a user who does not distinguish color reliably, I want primary, selected, warning, and error states to use text, shape, or borders in addition to color, so that state remains perceivable.
32. As a user who prefers reduced motion, I want the shell to avoid unnecessary animation, so that the visual polish does not cause discomfort.
33. As an offline or intermittently connected user, I want the static poster fallback and local route processing to behave as before, so that the shell redesign does not introduce a network requirement.
34. As a user of a supported route format, I want the file picker acceptance rules and validation behavior to remain unchanged, so that GPX, GPX-like XML, TCX, and FIT continue to work.
35. As a maintainer, I want the redesign to reuse the existing shell renderer, controllers, test hooks, menus, assets, and styling system, so that the change stays small and maintainable.
36. As a maintainer, I want no new runtime dependency for this visual redesign, so that bundle size and lazy-loading boundaries remain stable.
37. As a maintainer, I want the existing poster visual baselines to remain unchanged, so that shell work cannot accidentally alter printable output.

## Implementation Decisions

- Limit the redesign to the application shell, empty state, command bar, message
  placement, and preview workspace. Do not change the `route-report` poster
  template, the `terrain` poster theme, or the fixed poster canvas.
- Continue deriving the two shell states from the existing loaded-poster
  condition. Do not add application state solely for presentation.
- In the empty state, keep a compact identity bar with the product name,
  tagline, and language selector. Move the one visible file-picker action into
  the upload hero instead of duplicating it in both the identity bar and the
  hero.
- Build the empty upload hero around the existing watercolor landscape asset.
  It must include a concise outcome-oriented heading, supported-format copy, a
  visible file-picker action, drag-and-drop affordance, and accurate privacy
  copy stating that the route file stays in the browser.
- Preserve the current file input acceptance contract and the stable file-input
  and drop-zone hooks used by controllers and browser tests. Drag-and-drop
  remains available only before a poster is loaded.
- In the loaded state, order controls by workflow: product identity, secondary
  "Replace route" action, metric source, map style, primary export menu, print,
  and language. The action changes its label, not its underlying upload
  behavior.
- Keep the existing selector and export menu structures and interactions,
  including radio-option semantics, a single open command-bar selector, outside
  click dismissal, focus restoration, and localized accessible names.
- Keep print separate from the export menu. Do not change export formats,
  readiness waits, progress dialog behavior, clipboard capability detection, or
  print dispatch.
- Keep error and warning messages between the command bar and main content.
  Preserve the current `alert` behavior for errors and `status` behavior for
  warning-only messages.
- Use a warm shell palette aligned with the poster: paper `#F4F1E9`, deep forest
  `#17352E`, primary green `#147568`, route-accent orange `#E85D32`, and muted
  text `#65716C`. Contrast requirements take precedence if a token needs a
  small adjustment during implementation.
- Keep the existing system sans-serif stack for the application shell. Poster
  typography remains owned by the poster template.
- Present the preview workspace as a warm neutral canvas and the scaled poster
  as a sheet with a restrained border and shadow. Styling must not affect the
  fixed poster DOM captured by export or print.
- Preserve the existing maximum content width and responsive poster scaling.
  Use CSS layout only; do not add JavaScript measurement or a new responsive
  state machine.
- On desktop, keep the loaded command bar sticky while the poster scrolls. On
  narrow screens, allow it to become a non-obscuring two-row layout rather than
  covering poster content.
- Ensure the shell works down to 320 CSS pixels. Text and controls may wrap but
  must not be clipped. Interactive targets must be at least 24 by 24 CSS pixels
  and at least 44 by 44 for coarse pointers.
- Retain visible focus indicators, real form controls, matching visible and
  accessible labels, and non-color state cues. Decorative imagery must not add
  redundant screen-reader content.
- Keep motion limited to short state transitions and disable non-essential
  transitions when reduced motion is requested. Do not add parallax, scroll
  animation, or decorative JavaScript effects.
- Add only the localization keys required for the empty-state privacy and
  format copy and the loaded-state "Replace route" action. Keep dictionary
  shapes aligned for Russian, English, Spanish, French, and German. User route
  names and other source data remain untranslated.
- Reuse existing assets and dependencies. Do not add an illustration package,
  component library, font dependency, or animation dependency.
- Preserve lazy-loading boundaries for the poster renderer, styles, map,
  charts, export modules, and locale chunks.
- Update the current product specification during implementation because the
  redesign changes product-visible shell layout, copy, and workflow emphasis.
  Keep that update limited to the resulting behavior; do not copy this task
  plan or design rationale into the product specification.

## Testing Decisions

- Treat full browser rendering as the primary and highest test seam. Good tests
  assert user-visible state, interaction, accessibility, and stable screenshots
  rather than internal CSS structure.
- Extend the existing visual browser suite with deterministic coverage of the
  full empty shell and the loaded shell at desktop width. The loaded snapshot
  should include the command bar and top of the poster workspace while using
  the existing static map fallback to avoid network variance.
- Update the existing empty language-menu, invalid-upload, and loaded
  export-menu snapshots where the shell legitimately changes.
- Keep the existing desktop and mobile poster-surface snapshots unchanged.
  Any change to those baselines is a regression because the poster is out of
  scope.
- Use the existing end-to-end upload workflow to verify that the empty-state
  file action accepts the same formats, drag-and-drop is limited to the empty
  state, and the loaded-state "Replace route" action successfully processes a
  second file.
- Use existing end-to-end command-bar coverage to verify selector exclusivity,
  outside-click dismissal, export options, print, language switching, error
  presentation, and desktop sticky behavior after the markup moves.
- Keep the existing accessibility browser scenarios for empty, loaded, error,
  open-menu, and mobile states. Add assertions only where needed to cover the
  relocated file input, matching accessible names, focus visibility, and the
  absence of page-level overflow at narrow widths.
- Update shell-renderer unit tests to assert one file input per state, correct
  empty-versus-loaded copy, escaped localized text, preserved control injection,
  drop-zone presence only in the empty state, and unchanged message live-region
  semantics.
- Update localization unit tests to keep all locale dictionary shapes aligned
  and verify the new user-facing labels in each supported language.
- Prefer stable test hooks and accessible roles over presentation class names
  for behavior tests. Presentation classes remain appropriate only for visual
  snapshot targets and focused style assertions.
- Run formatting, JavaScript linting, CSS linting, type checking, unit tests,
  end-to-end tests, visual tests, accessibility tests, the production build,
  and build-output checks. The full repository verification command is the
  acceptance gate.

## Out of Scope

- Changing the poster header, map, elevation profile, metrics table, colors,
  typography, template, theme, dimensions, or export rendering.
- Adding more poster layouts, selectable application themes, dark mode, or a
  configurable block builder.
- Route editing, cropping, annotation, map interaction, poster zoom controls,
  undo/redo, or autosave.
- Adding a settings drawer, onboarding wizard, dashboard, recent-files list,
  account system, backend storage, or analytics.
- Changing route parsing, analysis modes, metric calculations, map providers,
  terrain enrichment, location lookup, or network/privacy boundaries.
- Adding upload, analysis, rendering, or export progress beyond the existing
  export wait dialog.
- Adding new runtime dependencies, fonts, image assets, or browser polyfills.
- Redesigning the internal contents or behavior of selector panels, the export
  progress dialog, or error messages beyond shell-level visual integration.

## Further Notes

- The design should feel like an editorial outdoor workspace, not a generic
  SaaS dashboard. Visual restraint is part of the requirement: the poster must
  remain more prominent than every shell element.
- "Route file stays in the browser" is the approved privacy idea. Avoid broader
  claims such as "fully offline" because optional map tiles, reverse geocoding,
  and explicitly enabled terrain elevation can use the network.
- The current README examples show the poster rather than the application
  shell, so they need no update unless implementation replaces or adds shell
  screenshots.
- No prototype was produced. The existing renderer and browser suites are the
  implementation and test prior art.
