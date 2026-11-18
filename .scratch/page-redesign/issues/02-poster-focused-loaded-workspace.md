# 02: Poster-focused loaded workspace

**What to build:** Redesign the loaded application shell so the poster is the
visual focus and export is the primary next action. The command bar should offer
a secondary "Replace route" action followed by metric source, map style,
export, print, and language controls. The scaled poster should sit on a warm
workspace as a bordered, subtly shadowed sheet. Existing menus, messages,
responsive behavior, accessibility, export, print, and the fixed poster surface
must continue to work.

**Blocked by:** 01: Outdoor editorial empty upload state.

**Status:** ready-for-agent

- [ ] The loaded command bar orders product identity, "Replace route", metric
      source, map style, export, print, and language according to the specified
      workflow hierarchy.
- [ ] "Replace route" uses the existing file-processing path and successfully
      replaces the current route without changing accepted formats or analysis.
- [ ] Export is visually primary while retaining the existing compact format
      menu, capability detection, readiness waits, progress feedback, and error
      handling.
- [ ] Print remains a separate localized action next to export and preserves
      existing dispatch behavior.
- [ ] Selector panels retain radio semantics, accessible names, single-open-menu
      behavior, outside-click dismissal, and focus restoration.
- [ ] Error and warning messages remain between the command bar and content and
      preserve their `alert` and `status` announcement semantics.
- [ ] The preview workspace uses the shared warm palette and presents the scaled
      poster with a restrained border and shadow.
- [ ] Preview-only styling does not affect the fixed poster DOM used by image,
      PDF, clipboard, or print output.
- [ ] The command bar remains sticky on desktop and becomes a non-obscuring,
      readable two-row layout on narrow screens.
- [ ] The loaded shell fits at 320 CSS pixels, supports enlarged text, visible
      focus, non-color state cues, reduced motion, and coarse-pointer targets.
- [ ] Russian, English, Spanish, French, and German provide localized
      "Replace route" copy with aligned locale dictionary shapes.
- [ ] Loaded-shell end-to-end coverage verifies route replacement, selectors,
      export, print, language changes, messages, and sticky behavior.
- [ ] Deterministic visual coverage includes the loaded command bar and top of
      the workspace at desktop width plus the existing menu snapshots.
- [ ] Existing desktop and mobile poster-surface snapshots remain unchanged.
- [ ] Existing accessibility scenarios remain clean for loaded, open-menu,
      error, and mobile states.
- [ ] Product documentation reflects the final loaded command bar and preview
      workspace behavior; README examples remain unchanged unless shell
      screenshots are added.
- [ ] The full repository verification command passes without new runtime
      dependencies or changed lazy-loading boundaries.
