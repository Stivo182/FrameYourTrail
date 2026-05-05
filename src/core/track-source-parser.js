import { GpxParseError, parseGpx } from "./gpx-parser.js";
import { createRouteSource, ROUTE_FORMATS } from "./route-source.js";
import { parseTcx } from "./tcx-parser.js";
export { getTrackSourceFormat, isSupportedTrackSourceFile } from "./track-source-format.js";
import { getTrackSourceFormat } from "./track-source-format.js";

/**
 * @param {string | ArrayBuffer} source
 * @param {string} fileName
 * @param {{ mediaType?: string }} [options]
 * @returns {Promise<import("./route-source.js").NormalizedRouteSource>}
 */
export async function parseTrackSource(source, fileName, options = {}) {
  const format = getTrackSourceFormat(fileName, options.mediaType);

  if (format === ROUTE_FORMATS.fit) {
    if (!(source instanceof ArrayBuffer)) {
      throw new GpxParseError("FIT source must be binary", "parse_error");
    }

    const { parseFit } = await import("./fit-parser.js");

    return createRouteSource(await parseFit(source, fileName), {
      format,
      parser: "fit-file-parser"
    });
  }

  if (format === ROUTE_FORMATS.tcx) {
    if (typeof source !== "string") {
      throw new GpxParseError("TCX source must be text", "parse_error");
    }

    return createRouteSource(parseTcx(source, fileName), {
      format,
      parser: "tcx-parser"
    });
  }

  if (format !== ROUTE_FORMATS.gpx) {
    throw new GpxParseError("Unsupported track format", "unsupported_format");
  }

  if (typeof source !== "string") {
    throw new GpxParseError("GPX source must be text", "parse_error");
  }

  return createRouteSource(parseGpx(source, fileName), {
    format,
    parser: "gpx-parser"
  });
}
