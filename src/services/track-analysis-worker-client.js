/**
 * @typedef {{
 *   addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void,
 *   postMessage: (message: unknown) => void,
 *   terminate: () => void
 * }} TrackAnalysisWorker
 *
 * @typedef {new (url: URL, options: { type: "module" }) => TrackAnalysisWorker} TrackAnalysisWorkerConstructor
 *
 * @typedef {object} TrackAnalysisWorkerClientOptions
 * @property {TrackAnalysisWorkerConstructor} [WorkerConstructor]
 * @property {(payload: unknown) => unknown} [fallbackAnalyzeTrackSource]
 * @property {(parsed: unknown, analysisMode: string) => unknown} [fallbackAnalyzeParsedTrack]
 * @property {(parsed: unknown, options?: unknown) => unknown} [fallbackEnrichParsedTrackFromTerrain]
 */

let fallbackPipelinePromise;
let gpxParseErrorModulePromise;

/**
 * @param {TrackAnalysisWorkerClientOptions} [options]
 * @returns {{
 *   analyzeTrackSource: (payload: unknown) => unknown,
 *   analyzeParsedTrack: (parsed: unknown, analysisMode: string) => unknown,
 *   enrichParsedTrackFromTerrain: (parsed: unknown, options?: unknown) => unknown,
 *   dispose: () => void
 * }}
 */
export function createTrackAnalysisWorkerClient(options = {}) {
  const hasInjectedWorkerConstructor = "WorkerConstructor" in options;
  /** @type {TrackAnalysisWorkerConstructor | undefined} */
  const WorkerConstructor = hasInjectedWorkerConstructor
    ? options.WorkerConstructor
    : globalThis.Worker;
  const fallbackAnalyzeTrackSource =
    options.fallbackAnalyzeTrackSource ?? createDefaultAnalyzeTrackSourceFallback();
  const fallbackAnalyzeParsedTrack =
    options.fallbackAnalyzeParsedTrack ?? createDefaultAnalyzeParsedTrackFallback();
  const fallbackEnrichParsedTrackFromTerrain =
    options.fallbackEnrichParsedTrackFromTerrain ??
    createDefaultEnrichParsedTrackFromTerrainFallback();

  if (typeof WorkerConstructor !== "function") {
    return {
      analyzeTrackSource: fallbackAnalyzeTrackSource,
      analyzeParsedTrack: fallbackAnalyzeParsedTrack,
      enrichParsedTrackFromTerrain: fallbackEnrichParsedTrackFromTerrain,
      dispose: () => {}
    };
  }

  let nextRequestId = 1;
  /** @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>} */
  const pending = new Map();
  /** @type {Error | null} */
  let terminalError = null;
  let worker;

  try {
    worker = hasInjectedWorkerConstructor
      ? createInjectedTrackAnalysisWorker(WorkerConstructor)
      : createNativeTrackAnalysisWorker();
  } catch {
    return {
      analyzeTrackSource: fallbackAnalyzeTrackSource,
      analyzeParsedTrack: fallbackAnalyzeParsedTrack,
      enrichParsedTrackFromTerrain: fallbackEnrichParsedTrackFromTerrain,
      dispose: () => {}
    };
  }

  worker.addEventListener("message", (event) => {
    const message =
      /** @type {{ id?: number, ok?: boolean, result?: unknown, error?: { name?: string, message?: string, code?: string } } | undefined} */ (
        event.data
      );

    if (typeof message?.id !== "number") {
      return;
    }

    const request = pending.get(message.id);

    if (!request) {
      return;
    }

    pending.delete(message.id);

    if (message.ok) {
      request.resolve(message.result);
      return;
    }

    void reviveWorkerError(message.error).then(
      (error) => {
        request.reject(error);
      },
      (error) => {
        request.reject(
          error instanceof Error
            ? error
            : new Error("Track analysis worker error could not be revived")
        );
      }
    );
  });

  worker.addEventListener("error", () => {
    closeWithError(new Error("Track analysis worker failed"));
  });

  worker.addEventListener("messageerror", () => {
    closeWithError(new Error("Track analysis worker message could not be cloned"));
  });

  return {
    analyzeTrackSource: (payload) => send("analyze-track-source", payload),
    analyzeParsedTrack: (parsed, analysisMode) =>
      send("analyze-parsed-track", { parsed, analysisMode }),
    enrichParsedTrackFromTerrain: (parsed, options) =>
      send("enrich-parsed-track-terrain", { parsed, options }),
    dispose: () => {
      worker.terminate();
      closeWithError(new Error("Track analysis worker was disposed"));
    }
  };

  /**
   * @param {"analyze-track-source" | "analyze-parsed-track" | "enrich-parsed-track-terrain"} type
   * @param {unknown} payload
   */
  function send(type, payload) {
    if (terminalError) {
      return Promise.reject(terminalError);
    }

    const id = nextRequestId;
    nextRequestId += 1;

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });

      try {
        worker.postMessage({ id, type, payload });
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error("Track analysis worker post failed"));
      }
    });
  }

  /**
   * @param {Error} error
   */
  function closeWithError(error) {
    if (!terminalError) {
      terminalError = error;
    }

    for (const request of pending.values()) {
      request.reject(terminalError);
    }
    pending.clear();
  }
}

function createNativeTrackAnalysisWorker() {
  return new Worker(new URL("../workers/track-analysis-worker.js", import.meta.url), {
    type: "module"
  });
}

/**
 * @param {TrackAnalysisWorkerConstructor} WorkerConstructor
 */
function createInjectedTrackAnalysisWorker(WorkerConstructor) {
  return new WorkerConstructor(createInjectedTrackAnalysisWorkerUrl(), {
    type: "module"
  });
}

function createInjectedTrackAnalysisWorkerUrl() {
  return new URL(["../workers", "track-analysis-worker.js"].join("/"), import.meta.url);
}

function loadFallbackPipeline() {
  fallbackPipelinePromise ??= import("./track-analysis-pipeline.js");
  return fallbackPipelinePromise;
}

function createDefaultAnalyzeTrackSourceFallback() {
  return async (payload) => {
    const { analyzeTrackSourceForUi } = await loadFallbackPipeline();
    return analyzeTrackSourceForUi(payload);
  };
}

function createDefaultAnalyzeParsedTrackFallback() {
  return async (parsed, analysisMode) => {
    const { analyzeParsedTrackForUi } = await loadFallbackPipeline();
    return analyzeParsedTrackForUi(parsed, analysisMode);
  };
}

function createDefaultEnrichParsedTrackFromTerrainFallback() {
  return async (parsed, options) => {
    const { enrichParsedTrackFromTerrainForUi } = await loadFallbackPipeline();
    return enrichParsedTrackFromTerrainForUi(parsed, options);
  };
}

/**
 * @param {{ name?: string, message?: string, code?: string } | undefined} error
 */
async function reviveWorkerError(error) {
  if (error?.name === "GpxParseError" && typeof error.code === "string") {
    gpxParseErrorModulePromise ??= import("../core/gpx-parser.js");
    const { GpxParseError } = await gpxParseErrorModulePromise;
    return new GpxParseError(error.message ?? "Track parse error", error.code);
  }

  return new Error(error?.message ?? "Track analysis failed");
}
