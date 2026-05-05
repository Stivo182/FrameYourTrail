# Worker Analysis Pipeline Specification

Status: Current mechanics, subordinate to `docs/product-spec.md`

`docs/product-spec.md` remains the authoritative product source of truth. This
document elaborates the current browser analysis pipeline implemented by
`src/services/track-analysis-adapter.js`,
`src/services/track-analysis-worker-client.js`,
`src/services/track-analysis-engine.js`,
`src/services/track-analysis-pipeline.js`, and
`src/workers/track-analysis-worker.js`.

## Product Contract

Parsing, optional terrain enrichment, validation, and metric analysis run in the
browser. The app prefers the module Web Worker path when available, with a lazy
in-thread fallback that preserves user-facing parse, enrichment, validation,
analysis-mode, warning, and error semantics.

Worker failures are recoverable at the adapter layer for user workflows, while a
constructed worker client keeps terminal failure behavior explicit for tests and
diagnostics.

## Entry Points

The pipeline exposes three operations:

| Operation                                       | Purpose                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `analyzeTrackSource(payload)`                   | Parse a text or binary route source, optionally apply terrain fallback, validate, choose analysis mode, and compute UI analysis when valid. |
| `analyzeParsedTrack(parsed, analysisMode)`      | Recompute analysis for an already parsed route source and selected metric mode.                                                             |
| `enrichParsedTrackFromTerrain(parsed, options)` | Apply terrain elevation to an already parsed route source, currently for explicit replacement.                                              |

The same operations are available through the worker client and the in-thread
fallback pipeline.

## Engine Order

`analyzeTrackSourceForUi(input)` performs this sequence:

1. Parse the route through `parseTrackSource(...)`.
2. If the terrain provider is enabled, call `enrichElevationFromTerrain(...)`
   before validation and analysis.
3. Validate the parsed or enriched route with `validateParsedTrack(...)`.
4. Choose the next analysis mode from the previous selected mode, previous
   default mode, and current route availability.
5. Skip analysis when validation contains blocking errors.
6. Otherwise compute analysis through `analyzeParsedTrackForUi(...)`.

The returned UI payload contains `parsed`, `validation`, `analysisMode`, and
`analysis`.

`analyzeParsedTrackForUi(parsed, analysisMode)` delegates to
`analyzeParsedTrack(parsed, { mode: analysisMode, includeAvailableSummaries:
false })`. UI recomputation intentionally omits lazy available summaries so
mode changes do not compute non-selected modes.

`enrichParsedTrackFromTerrainForUi(parsed, options)` delegates to
`enrichElevationFromTerrain(...)` and passes the optional enrichment mode.

## Mode Preservation During Upload

The upload pipeline chooses the loaded route's default mode unless the previous
selected mode was non-default and is available for the new parsed route. In
that case, it preserves the previous non-default mode.

This preserves intentional user metric-source choices across compatible file
loads without applying hidden or unavailable modes to incompatible routes.

## Worker Client

`createTrackAnalysisWorkerClient(...)` constructs a module Worker from
`src/workers/track-analysis-worker.js` when `Worker` is available and
construction succeeds. If `Worker` is unavailable or construction throws during
initial setup, the client returns lazy fallback functions instead.

Worker requests are assigned monotonically increasing numeric ids. The client
posts messages with:

- `analyze-track-source`
- `analyze-parsed-track`
- `enrich-parsed-track-terrain`

Responses with unknown ids are ignored. Successful responses resolve the
matching request. Failed responses reject the matching request.

Serialized worker `GpxParseError` objects are revived by dynamically importing
`src/core/gpx-parser.js` and reconstructing the error with its original product
code. Other worker errors are revived as ordinary `Error` objects.

## Terminal Worker Failures

Once a constructed worker emits `error` or `messageerror`, the worker client:

- records a terminal error;
- rejects all pending requests;
- clears the pending request map;
- rejects future requests immediately.

Calling `dispose()` terminates the worker and applies the same pending/future
request rejection behavior with a disposed-worker error.

If `worker.postMessage(...)` throws synchronously for one request, only that
request is rejected and removed from pending requests; the client is not marked
terminal by that synchronous post failure alone.

## Adapter Fallback

`createTrackAnalysisAdapter(...)` lazily loads and caches the worker client.
Each operation first tries the worker client method. If loading the worker
client fails, the method is missing, or the worker call rejects, the adapter
lazily loads the fallback pipeline and retries the same operation in-thread.

This adapter-level fallback is the user-facing recovery layer. It lets runtime
worker/client failures still produce the same UI analysis behavior, while
keeping worker-client terminal failure semantics visible in the lower-level
client.

## Worker Entry

`src/workers/track-analysis-worker.js` imports the engine functions directly and
dispatches by message type. Unknown message types produce an error response.

The worker serializes `GpxParseError` with `name`, `message`, and `code`.
Ordinary errors serialize with name and message. This keeps parser error codes
stable across structured-clone boundaries.

## Lazy-Loading And Build Contracts

The analysis worker client is loaded dynamically by the analysis adapter. The
fallback pipeline is loaded dynamically by both the adapter and default
worker-client fallback functions.

Current build and module-boundary contracts:

- the analysis fallback modules stay out of the main app module;
- default worker-client fallback imports stay lazy;
- default module Worker construction remains visible to Vite;
- the worker is not imported by the fallback pipeline entry module;
- UI analysis mode selectors stay out of heavy analysis modules;
- production builds emit `src/workers/track-analysis-worker.js` as a separate
  module Worker asset;
- production builds share the lazy FIT parser as exactly one `fit-parser-*.js`
  asset;
- production builds share the heavy analysis core as exactly one
  `track-analysis-core-*.js` asset.

## Large Runtime Behavior

Large-file warnings are advisory and do not switch the pipeline into a separate
degraded mode. A warned file still follows the same parse, optional terrain,
validation, analysis, render, and export readiness path.

The current UI has normal busy and error states but no granular upload, parse,
terrain, render, or export progress indicator. Browser memory limits, worker
failures, terrain failures, map/rendering failures, or export canvas limits
should surface as recoverable user-facing failures where possible.

## Verification Coverage

Primary coverage:

- `tests/unit/track-analysis-pipeline.test.js`
- `tests/unit/track-analysis-worker-client.test.js`
- `tests/unit/track-analysis-adapter.test.js`
- `tests/unit/lazy-modules.test.js`
- `tests/unit/verify-build-output.test.js`
- `tests/e2e/app.spec.js`

Focused checks include `npm run test`, `npm run test:e2e`, `npm run build`, and
`npm run test:build`.
