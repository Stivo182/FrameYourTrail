import { describe, expect, it, vi } from "vitest";
import { GpxParseError } from "../../src/core/gpx-parser.js";
import { createTrackAnalysisWorkerClient } from "../../src/services/track-analysis-worker-client.js";

vi.mock("../../src/services/track-analysis-pipeline.js", () => ({
  analyzeTrackSourceForUi: vi.fn(),
  analyzeParsedTrackForUi: vi.fn(() => ({ analysisMode: "recomputed_raw" })),
  enrichParsedTrackFromTerrainForUi: vi.fn(() => ({ elevationSource: "terrain" }))
}));

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.messages = [];
    this.listeners = new Map();
    this.terminated = false;
    /** @type {typeof FakeWorker} */ (this.constructor).instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(type, data) {
    this.listeners.get(type)?.({ data });
  }
}

class ThrowingPostMessageWorker extends FakeWorker {
  postMessage(message) {
    this.messages.push(message);
    throw new Error("postMessage failed");
  }
}

describe("track analysis worker client", () => {
  it("posts source analysis requests and resolves matching worker responses", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const promise = client.analyzeTrackSource({ source: "<gpx />", fileName: "a.gpx" });
    const worker = FakeWorker.instances[0];

    expect(String(worker.url)).toContain("track-analysis-worker.js");
    expect(worker.options).toEqual({ type: "module" });
    expect(worker.messages[0]).toMatchObject({
      id: 1,
      type: "analyze-track-source",
      payload: { fileName: "a.gpx" }
    });

    worker.emit("message", {
      id: 1,
      ok: true,
      result: { analysisMode: "recomputed_filtered" }
    });

    await expect(promise).resolves.toEqual({ analysisMode: "recomputed_filtered" });
  });

  it("posts parsed-track analysis requests", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });

    client.analyzeParsedTrack({ points: [] }, "recomputed_raw");

    expect(FakeWorker.instances[0].messages[0]).toMatchObject({
      type: "analyze-parsed-track",
      payload: { parsed: { points: [] }, analysisMode: "recomputed_raw" }
    });
  });

  it("posts parsed-track terrain enrichment requests", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });

    client.enrichParsedTrackFromTerrain({ points: [] }, { mode: "replace" });

    expect(FakeWorker.instances[0].messages[0]).toMatchObject({
      type: "enrich-parsed-track-terrain",
      payload: { parsed: { points: [] }, options: { mode: "replace" } }
    });
  });

  it("ignores responses for unknown request ids", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const promise = client.analyzeTrackSource({ source: "<gpx />", fileName: "a.gpx" });
    const worker = FakeWorker.instances[0];

    worker.emit("message", { id: 999, ok: true, result: "stale" });
    worker.emit("message", { id: 1, ok: true, result: "current" });

    await expect(promise).resolves.toBe("current");
  });

  it("reconstructs serialized GPX parse errors", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const promise = client.analyzeTrackSource({ source: "nope", fileName: "broken.gpx" });
    const worker = FakeWorker.instances[0];

    worker.emit("message", {
      id: 1,
      ok: false,
      error: { name: "GpxParseError", message: "File is not XML", code: "not_xml" }
    });

    await expect(promise).rejects.toMatchObject({
      name: "GpxParseError",
      code: "not_xml"
    });
    await expect(promise).rejects.toBeInstanceOf(GpxParseError);
  });

  it("falls back when Worker is unavailable", async () => {
    const fallback = vi.fn(async () => ({ analysisMode: "recomputed_filtered" }));
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: undefined,
      fallbackAnalyzeTrackSource: fallback
    });

    await expect(client.analyzeTrackSource({ fileName: "fallback.gpx" })).resolves.toEqual({
      analysisMode: "recomputed_filtered"
    });
    expect(fallback).toHaveBeenCalledWith({ fileName: "fallback.gpx" });
  });

  it("falls back when Worker construction throws", async () => {
    const fallback = vi.fn(async () => ({ analysisMode: "recomputed_filtered" }));
    const ThrowingWorkerConstructor = vi.fn(() => {
      throw new Error("worker construction failed");
    });
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: ThrowingWorkerConstructor,
      fallbackAnalyzeTrackSource: fallback
    });

    await expect(client.analyzeTrackSource({ fileName: "fallback.gpx" })).resolves.toEqual({
      analysisMode: "recomputed_filtered"
    });
    expect(fallback).toHaveBeenCalledWith({ fileName: "fallback.gpx" });
  });

  it("loads the default analysis fallback only when Worker is unavailable", async () => {
    vi.resetModules();
    FakeWorker.instances = [];
    const sourceFallback = vi.fn(async () => ({ analysisMode: "recomputed_filtered" }));
    const parsedFallback = vi.fn(async () => ({ analysisMode: "recomputed_raw" }));
    const terrainFallback = vi.fn(async () => ({ elevationSource: "terrain" }));
    const fallbackModuleFactory = vi.fn(() => ({
      analyzeTrackSourceForUi: sourceFallback,
      analyzeParsedTrackForUi: parsedFallback,
      enrichParsedTrackFromTerrainForUi: terrainFallback
    }));

    vi.doMock("../../src/services/track-analysis-pipeline.js", fallbackModuleFactory);

    try {
      const { createTrackAnalysisWorkerClient: createIsolatedWorkerClient } =
        await import("../../src/services/track-analysis-worker-client.js");

      expect(fallbackModuleFactory).not.toHaveBeenCalled();

      const workerClient = createIsolatedWorkerClient({ WorkerConstructor: FakeWorker });
      const workerPromise = workerClient.analyzeTrackSource({ fileName: "worker.gpx" });
      const worker = FakeWorker.instances[0];

      worker.emit("message", {
        id: 1,
        ok: true,
        result: { analysisMode: "worker" }
      });

      await expect(workerPromise).resolves.toEqual({ analysisMode: "worker" });
      expect(fallbackModuleFactory).not.toHaveBeenCalled();
      expect(sourceFallback).not.toHaveBeenCalled();

      const fallbackClient = createIsolatedWorkerClient({ WorkerConstructor: undefined });

      expect(fallbackModuleFactory).not.toHaveBeenCalled();

      await expect(
        fallbackClient.analyzeTrackSource({ fileName: "fallback.gpx" })
      ).resolves.toEqual({
        analysisMode: "recomputed_filtered"
      });
      expect(fallbackModuleFactory).toHaveBeenCalledTimes(1);
      expect(sourceFallback).toHaveBeenCalledWith({ fileName: "fallback.gpx" });

      await expect(
        fallbackClient.analyzeParsedTrack({ points: [] }, "recomputed_raw")
      ).resolves.toEqual({
        analysisMode: "recomputed_raw"
      });
      await expect(
        fallbackClient.enrichParsedTrackFromTerrain({ points: [] }, { mode: "replace" })
      ).resolves.toEqual({ elevationSource: "terrain" });
      expect(fallbackModuleFactory).toHaveBeenCalledTimes(1);
      expect(parsedFallback).toHaveBeenCalledWith({ points: [] }, "recomputed_raw");
      expect(terrainFallback).toHaveBeenCalledWith({ points: [] }, { mode: "replace" });

      const ThrowingWorkerConstructor = vi.fn(() => {
        throw new Error("worker construction failed");
      });
      const constructionFallbackClient = createIsolatedWorkerClient({
        WorkerConstructor: ThrowingWorkerConstructor
      });

      await expect(
        constructionFallbackClient.analyzeTrackSource({ fileName: "construction-fallback.gpx" })
      ).resolves.toEqual({
        analysisMode: "recomputed_filtered"
      });
      expect(fallbackModuleFactory).toHaveBeenCalledTimes(1);
      expect(sourceFallback).toHaveBeenCalledWith({
        fileName: "construction-fallback.gpx"
      });
    } finally {
      vi.doUnmock("../../src/services/track-analysis-pipeline.js");
      vi.resetModules();
    }
  });

  it("rejects and clears requests when postMessage throws synchronously", async () => {
    ThrowingPostMessageWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: ThrowingPostMessageWorker
    });
    const promise = client.analyzeTrackSource({ source: "<gpx />", fileName: "a.gpx" });
    const worker = ThrowingPostMessageWorker.instances[0];

    await expect(promise).rejects.toThrow("postMessage failed");

    worker.emit("message", {
      id: 1,
      ok: true,
      result: { analysisMode: "stale" }
    });
    await expect(promise).rejects.toThrow("postMessage failed");
  });

  it("rejects pending requests when the worker emits an error", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const promise = client.analyzeTrackSource({ source: "<gpx />", fileName: "a.gpx" });
    const worker = FakeWorker.instances[0];

    worker.emit("error");

    await expect(promise).rejects.toThrow("Track analysis worker failed");
  });

  it("rejects future requests immediately after the worker emits an error", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const worker = FakeWorker.instances[0];

    worker.emit("error");

    await expect(
      client.analyzeTrackSource({ source: "<gpx />", fileName: "later.gpx" })
    ).rejects.toThrow("Track analysis worker failed");
    expect(worker.messages).toEqual([]);
  });

  it("rejects pending requests when the worker emits a messageerror", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const promise = client.analyzeTrackSource({ source: "<gpx />", fileName: "a.gpx" });
    const worker = FakeWorker.instances[0];

    worker.emit("messageerror");

    await expect(promise).rejects.toThrow("Track analysis worker message could not be cloned");
  });

  it("rejects future requests immediately after the worker emits a messageerror", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const worker = FakeWorker.instances[0];

    worker.emit("messageerror");

    await expect(
      client.analyzeTrackSource({ source: "<gpx />", fileName: "later.gpx" })
    ).rejects.toThrow("Track analysis worker message could not be cloned");
    expect(worker.messages).toEqual([]);
  });

  it("rejects pending requests and terminates the worker on dispose", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const promise = client.analyzeTrackSource({ source: "<gpx />", fileName: "a.gpx" });
    const worker = FakeWorker.instances[0];

    client.dispose();

    expect(worker.terminated).toBe(true);
    await expect(promise).rejects.toThrow("Track analysis worker was disposed");
  });

  it("rejects future requests immediately after dispose", async () => {
    FakeWorker.instances = [];
    const client = createTrackAnalysisWorkerClient({
      WorkerConstructor: FakeWorker
    });
    const worker = FakeWorker.instances[0];

    client.dispose();

    await expect(
      client.analyzeTrackSource({ source: "<gpx />", fileName: "later.gpx" })
    ).rejects.toThrow("Track analysis worker was disposed");
    expect(worker.messages).toEqual([]);
  });
});

describe("track analysis worker entry", () => {
  it("posts an error for unknown message types", async () => {
    const listeners = new Map();
    const postMessage = vi.fn();
    const originalSelf = globalThis.self;
    vi.resetModules();
    vi.stubGlobal("self", {
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      postMessage
    });

    try {
      await import("../../src/workers/track-analysis-worker.js");
      listeners.get("message")?.({
        data: { id: 7, type: "surprise-track", payload: {} }
      });
      await vi.waitFor(() => {
        expect(postMessage).toHaveBeenCalledWith({
          id: 7,
          ok: false,
          error: {
            name: "Error",
            message: "Unknown track analysis worker message type: surprise-track"
          }
        });
      });
    } finally {
      vi.unstubAllGlobals();
      globalThis.self = originalSelf;
    }
  });
});
