/**
 * @typedef {import("../core/route-types.js").RouteSource} RouteSource
 * @typedef {{
 *   source: string | ArrayBuffer,
 *   fileName: string,
 *   mediaType: string,
 *   fileSizeBytes: number,
 *   previousAnalysisMode: string,
 *   previousDefaultMode: string,
 *   terrainElevationProviderEnabled: boolean
 * }} TrackSourceAnalysisPayload
 * @typedef {Record<string, unknown>} TrackAnalysisClient
 * @typedef {Record<string, unknown>} TrackAnalysisFallbackPipeline
 */

/**
 * @param {object} [dependencies]
 * @param {() => Promise<TrackAnalysisClient>} [dependencies.loadWorkerClient]
 * @param {() => Promise<TrackAnalysisFallbackPipeline>} [dependencies.loadFallbackPipeline]
 */
export function createTrackAnalysisAdapter(dependencies = {}) {
  const loadWorkerClient = dependencies.loadWorkerClient ?? loadDefaultWorkerClient;
  const loadFallbackPipeline = dependencies.loadFallbackPipeline ?? loadDefaultFallbackPipeline;
  /** @type {Promise<TrackAnalysisClient> | undefined} */
  let trackAnalysisClientPromise;
  /** @type {Promise<TrackAnalysisFallbackPipeline> | undefined} */
  let fallbackPipelinePromise;

  function getTrackAnalysisClient() {
    trackAnalysisClientPromise ??= loadWorkerClient();
    return trackAnalysisClientPromise;
  }

  function getFallbackPipeline() {
    fallbackPipelinePromise ??= loadFallbackPipeline();
    return fallbackPipelinePromise;
  }

  /**
   * @param {TrackSourceAnalysisPayload} payload
   */
  async function analyzeTrackSource(payload) {
    try {
      const trackAnalysisClient = await getTrackAnalysisClient();
      return await requireAnalysisMethod(
        trackAnalysisClient.analyzeTrackSource,
        "analyzeTrackSource"
      )(payload);
    } catch {
      const { analyzeTrackSourceForUi } = await getFallbackPipeline();
      return requireAnalysisMethod(analyzeTrackSourceForUi, "analyzeTrackSourceForUi")(payload);
    }
  }

  /**
   * @param {RouteSource} parsed
   * @param {string} analysisMode
   */
  async function analyzeParsedTrack(parsed, analysisMode) {
    try {
      const trackAnalysisClient = await getTrackAnalysisClient();
      return await requireAnalysisMethod(
        trackAnalysisClient.analyzeParsedTrack,
        "analyzeParsedTrack"
      )(parsed, analysisMode);
    } catch {
      const { analyzeParsedTrackForUi } = await getFallbackPipeline();
      return requireAnalysisMethod(analyzeParsedTrackForUi, "analyzeParsedTrackForUi")(
        parsed,
        analysisMode
      );
    }
  }

  /**
   * @param {RouteSource} parsed
   * @param {{ mode?: "replace" }} options
   */
  async function enrichParsedTrackFromTerrain(parsed, options) {
    try {
      const trackAnalysisClient = await getTrackAnalysisClient();
      return await requireAnalysisMethod(
        trackAnalysisClient.enrichParsedTrackFromTerrain,
        "enrichParsedTrackFromTerrain"
      )(parsed, options);
    } catch {
      const { enrichParsedTrackFromTerrainForUi } = await getFallbackPipeline();
      return requireAnalysisMethod(
        enrichParsedTrackFromTerrainForUi,
        "enrichParsedTrackFromTerrainForUi"
      )(parsed, options);
    }
  }

  return {
    analyzeTrackSource,
    analyzeParsedTrack,
    enrichParsedTrackFromTerrain
  };
}

function loadDefaultWorkerClient() {
  return import("./track-analysis-worker-client.js").then(({ createTrackAnalysisWorkerClient }) =>
    createTrackAnalysisWorkerClient()
  );
}

function loadDefaultFallbackPipeline() {
  return import("./track-analysis-pipeline.js");
}

/**
 * @param {unknown} method
 * @param {string} name
 * @returns {(...args: any[]) => any}
 */
function requireAnalysisMethod(method, name) {
  if (typeof method !== "function") {
    throw new Error(`Track analysis method is unavailable: ${name}`);
  }

  return /** @type {(...args: any[]) => any} */ (method);
}
