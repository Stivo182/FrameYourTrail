import { GpxParseError } from "../core/gpx-parser.js";
import {
  analyzeParsedTrackForUi,
  analyzeTrackSourceForUi,
  enrichParsedTrackFromTerrainForUi
} from "../services/track-analysis-engine.js";

self.addEventListener("message", (event) => {
  void handleMessage(event.data);
});

/**
 * @param {{ id?: number, type?: string, payload?: unknown } | undefined} message
 */
async function handleMessage(message) {
  const { id, type, payload } = message ?? {};

  try {
    let result;

    if (type === "analyze-track-source") {
      result = await analyzeTrackSourceForUi(
        /** @type {Parameters<typeof analyzeTrackSourceForUi>[0]} */ (payload)
      );
    } else if (type === "analyze-parsed-track") {
      result = analyzeParsedTrackForUi(
        /** @type {{ parsed: Parameters<typeof analyzeParsedTrackForUi>[0], analysisMode: string }} */ (
          payload
        ).parsed,
        /** @type {{ parsed: Parameters<typeof analyzeParsedTrackForUi>[0], analysisMode: string }} */ (
          payload
        ).analysisMode
      );
    } else if (type === "enrich-parsed-track-terrain") {
      result = await enrichParsedTrackFromTerrainForUi(
        /** @type {{ parsed: Parameters<typeof enrichParsedTrackFromTerrainForUi>[0], options?: Parameters<typeof enrichParsedTrackFromTerrainForUi>[1] }} */ (
          payload
        ).parsed,
        /** @type {{ parsed: Parameters<typeof enrichParsedTrackFromTerrainForUi>[0], options?: Parameters<typeof enrichParsedTrackFromTerrainForUi>[1] }} */ (
          payload
        ).options
      );
    } else {
      throw new Error(`Unknown track analysis worker message type: ${String(type)}`);
    }

    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: serializeWorkerError(error) });
  }
}

/**
 * @param {unknown} error
 */
function serializeWorkerError(error) {
  if (error instanceof GpxParseError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code
    };
  }

  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : "Track analysis failed"
  };
}
