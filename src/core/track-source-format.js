import { ROUTE_FORMATS } from "./route-source.js";

/**
 * @param {string} fileName
 * @param {string} [mediaType]
 * @returns {"gpx" | "tcx" | "fit" | null}
 */
export function getTrackSourceFormat(fileName, mediaType = "") {
  const normalizedName = fileName.toLowerCase();
  const normalizedMediaType = mediaType.toLowerCase();

  if (normalizedName.endsWith(".gpx")) {
    return ROUTE_FORMATS.gpx;
  }

  if (normalizedName.endsWith(".tcx")) {
    return ROUTE_FORMATS.tcx;
  }

  if (normalizedName.endsWith(".fit")) {
    return ROUTE_FORMATS.fit;
  }

  if (normalizedMediaType.includes("gpx")) {
    return ROUTE_FORMATS.gpx;
  }

  if (normalizedMediaType.includes("tcx")) {
    return ROUTE_FORMATS.tcx;
  }

  if (normalizedMediaType.includes("fit")) {
    return ROUTE_FORMATS.fit;
  }

  if (normalizedMediaType.includes("xml")) {
    return ROUTE_FORMATS.gpx;
  }

  if (normalizedMediaType === "application/octet-stream") {
    return normalizedName.endsWith(".fit") ? ROUTE_FORMATS.fit : null;
  }

  return null;
}

/**
 * @param {File | null | undefined} file
 * @returns {file is File}
 */
export function isSupportedTrackSourceFile(file) {
  return Boolean(file && getTrackSourceFormat(file.name, file.type));
}
