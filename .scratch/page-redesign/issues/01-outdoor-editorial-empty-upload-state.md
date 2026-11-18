# 01: Outdoor editorial empty upload state

**What to build:** Replace the generic empty shell with a complete outdoor
editorial upload experience. A first-time visitor should see a compact identity
bar and a prominent watercolor-backed hero that explains the outcome, exposes
one accessible file-picker action, supports drag-and-drop, lists supported route
formats, and accurately states that the route file stays in the browser. The
state must be localized, responsive, accessible, and covered by existing test
seams while leaving the loaded poster workflow operational.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The empty identity bar retains the product name, tagline, and language
      selector without duplicating the file-picker action.
- [ ] The empty hero reuses the existing watercolor landscape and makes route
      upload the clear primary action.
- [ ] The hero visibly communicates support for GPX, GPX-like XML, TCX, and FIT.
- [ ] Privacy copy says that the route file stays in the browser without
      claiming that optional map, location, or terrain requests are offline.
- [ ] Clicking the visible upload action opens the existing file input and keeps
      its accepted file contract unchanged.
- [ ] Drag-and-drop remains available only in the empty state and preserves
      existing validation and error behavior.
- [ ] New and changed copy is available in Russian, English, Spanish, French,
      and German with aligned locale dictionary shapes.
- [ ] The warm shell palette and system typography establish the shared visual
      foundation without changing poster-specific styles.
- [ ] The empty state fits at 320 CSS pixels, wraps under enlarged text, exposes
      visible focus, and provides at least 44 by 44 CSS pixel targets for coarse
      pointers.
- [ ] Empty, language-menu, invalid-upload, mobile, and accessibility browser
      coverage reflects the new user-visible behavior.
- [ ] Shell-renderer and localization tests verify one file input, escaped copy,
      the empty-only drop zone, and locale completeness.
- [ ] Product documentation describes the resulting empty upload workflow and
      accurate privacy message without including implementation notes.
