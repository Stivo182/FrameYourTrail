export const ROUTE_FORMATS = Object.freeze({
  gpx: "gpx",
  tcx: "tcx",
  fit: "fit"
});

/**
 * @typedef {import("./route-types.js").RouteSource} RouteSource
 * @typedef {import("./route-types.js").NormalizedRouteSource} NormalizedRouteSource
 */

function assertSupportedFormat(format) {
  if (!Object.values(ROUTE_FORMATS).includes(format)) {
    throw new Error(`Unsupported route source format: ${format}`);
  }
}

function countSegments(points) {
  const segmentIndexes = new Set(
    points
      .map((point) => point.segmentIndex)
      .filter((segmentIndex) => Number.isFinite(segmentIndex))
  );

  return Math.max(1, segmentIndexes.size);
}

/**
 * @param {object} parsed
 * @param {{ format: string, parser?: string }} options
 * @returns {NormalizedRouteSource}
 */
export function createRouteSource(parsed, options) {
  assertSupportedFormat(options.format);

  const points = parsed.points ?? [];
  const rawPoints = parsed.rawPoints ?? points;
  const provenance = parsed.provenance ?? {};

  return {
    ...parsed,
    fileName: parsed.fileName,
    name: parsed.name,
    points,
    rawPoints,
    hasElevation: parsed.hasElevation,
    hasTime: parsed.hasTime,
    elevationSource: parsed.elevationSource,
    activity: parsed.activity ?? null,
    importedSummary: parsed.importedSummary,
    source: {
      format: options.format,
      parser: options.parser,
      fileName: parsed.fileName,
      name: parsed.name
    },
    provenance: {
      ...provenance,
      format: options.format,
      pointCount: provenance.pointCount ?? points.length,
      segmentCount: provenance.segmentCount ?? countSegments(points)
    }
  };
}

/**
 * @param {RouteSource} source
 * @returns {string | undefined}
 */
export function getRouteSourceFormat(source) {
  return source.source?.format;
}
