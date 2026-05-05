# Repository Instructions

## Documentation And Specs

- After every change, check whether the documentation and specs need to be updated.
- Keep `README.md` and files under `docs/` synchronized with code, tests,
  configuration, UX, and behavior changes.
- Treat `docs/product-spec.md` as the current product source of truth.
- Keep documentation updates minimal and scoped to the change. Do not add
  implementation notes, temporary task details, rationale, or duplicate
  descriptions to `docs/product-spec.md`.
- If a change affects product requirements, expected behavior, constraints, or
  user workflows, update the relevant spec in the same task.
- Update `docs/product-spec.md` only when product-visible behavior,
  requirements, constraints, or user workflows change.
- If a change affects architecture or internal technical design, update the
  relevant architecture or design documentation instead of `docs/product-spec.md`,
  unless the change also affects product-visible behavior.
- If a change affects active implementation scope, progress, or follow-up work,
  update the existing relevant task notes or planning document in the same task.
  Do not create or keep task notes for completed one-off tasks.
- In specs, docs, and other documentation, write file paths relative to the
  project root; do not use absolute filesystem paths.
- Remove completed or obsolete task plans before finishing. Keep a plan only
  when it still represents active scope or follow-up work, and update it to show
  the current state.
- Before finishing, explicitly verify that documentation and specs are current, or state that no documentation update was needed.

## Agent Workflow

- Do not introduce new duplication. Repeated behavior, decisions, data sets,
  transformations, contracts, or sources of truth must have one owner reused
  from all call sites. Before adding shared knowledge, search for the existing
  owner and reuse or extend it.
- Before finishing, use targeted searches for the names and concepts touched by
  the change. Treat newly duplicated ownership as a blocking review issue and
  centralize it. If centralization affects module boundaries, lazy-loading,
  workers, build chunks, public contracts, generated artifacts, or other
  cross-cutting boundaries, run `npm run build` and `npm run test:build` or
  `npm run verify`.

## Build, Run, And Test

- Install dependencies with `npm ci`.
- Start the local dev server with `npm run dev`; by default it serves `http://127.0.0.1:5173/`.
- Create a production build with `npm run build`.
- Preview the production build with `npm run preview`; by default open `http://127.0.0.1:4173/`. If the build was created with `VITE_BASE_PATH=/FrameYourTrail/`, open `http://127.0.0.1:4173/FrameYourTrail/`.
- Run the full verification suite with `npm run verify` before finishing when
  feasible for code changes. For docs-only or instruction-only changes, tests
  are not required; state that they were skipped because code did not change.
- Use focused checks when appropriate: `npm run format:check`, `npm run lint`, `npm run lint:css`, `npm run typecheck`, `npm run test`, `npm run test:metrics`, `npm run test:e2e`, `npm run test:visual`, and `npm run test:a11y`.
