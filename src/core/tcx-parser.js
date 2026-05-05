import { createActivityProvenance } from "./activity-provenance.js";
import { GpxParseError } from "./gpx-parser.js";
import {
  isValidLatitude,
  isValidLongitude,
  parseOptionalDateInfo,
  parseOptionalNumber
} from "./track-source-primitives.js";
import {
  findAncestor,
  getChildText,
  getDescendantText,
  getDescendantsByLocalName,
  getDirectChildrenByLocalName,
  serializeElements
} from "./xml-parser-helpers.js";

const ACTIVITY_EXTENSION_NAMESPACE = "http://www.garmin.com/xmlschemas/ActivityExtension/v2";

/**
 * @typedef {import("./route-types.js").TrackPoint} TcxTrackPoint
 */

/**
 * @param {string} source
 * @param {string} fileName
 */
export function parseTcx(source, fileName) {
  if (!source.trim().startsWith("<")) {
    throw new GpxParseError("File is not XML", "not_xml");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, "application/xml");

  if (getDescendantsByLocalName(doc, "parsererror")[0]) {
    throw new GpxParseError("XML cannot be parsed", "invalid_xml");
  }

  const trackpointNodes = getDescendantsByLocalName(doc, "Trackpoint");

  if (trackpointNodes.length === 0) {
    throw new GpxParseError("TCX does not contain points", "empty_track");
  }

  const lapNodes = getDescendantsByLocalName(doc, "Lap");
  const lapIndexes = getLapIndexes(lapNodes);
  const points = trackpointNodes.map((node, index) => parseTrackpoint(node, index, lapIndexes));
  const trackpointExtensions = getTrackpointExtensionProvenance(points);

  return {
    fileName,
    name: getFileDisplayName(fileName),
    points,
    hasElevation: points.some((point) => Number.isFinite(point.elevation)),
    hasTime: points.some((point) => point.timestamp instanceof Date),
    elevationSource: getParsedElevationSource(points),
    activity: extractActivity(trackpointNodes),
    importedSummary: extractImportedSummary(lapNodes),
    provenance: {
      format: "tcx",
      pointCount: points.length,
      segmentCount: lapNodes.length || 1,
      lapCount: lapNodes.length,
      trackpointExtensions
    }
  };
}

/**
 * @param {Element[]} trackpointNodes
 */
function extractActivity(trackpointNodes) {
  const activityNode = trackpointNodes
    .map((node) => findAncestor(node, "Activity"))
    .find((node) => node !== null);
  const raw = activityNode?.getAttribute("Sport") ?? null;

  return raw === null ? null : createActivityProvenance(raw, "tcx_activity_sport");
}

/**
 * @param {Element} node
 * @param {number} index
 * @param {Map<Element, number>} lapIndexes
 * @returns {TcxTrackPoint}
 */
function parseTrackpoint(node, index, lapIndexes) {
  const latitude = parseOptionalNumber(getDescendantText(node, "LatitudeDegrees"));
  const longitude = parseOptionalNumber(getDescendantText(node, "LongitudeDegrees"));

  if (latitude === null || longitude === null) {
    throw new GpxParseError(
      `Point ${index + 1} does not contain coordinates`,
      "missing_coordinates"
    );
  }

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    throw new GpxParseError(
      `Point ${index + 1} contains coordinates outside geographic bounds`,
      "coordinates_out_of_bounds"
    );
  }

  const elevation = parseOptionalNumber(getChildText(node, "AltitudeMeters"));
  const timeText = getChildText(node, "Time");
  const timeInfo = parseOptionalDateInfo(timeText);
  const extensionElements = getDirectChildrenByLocalName(node, "Extensions");

  return {
    latitude,
    longitude,
    elevation,
    elevationSource: elevation === null ? "none" : "gpx",
    timeText,
    timeZoneStatus: timeInfo.timeZoneStatus,
    timestamp: timeInfo.timestamp,
    distanceMeters: parseOptionalNumber(getChildText(node, "DistanceMeters")),
    segmentIndex: getLapIndex(node, lapIndexes),
    rawExtensions: serializeElements(extensionElements),
    tcxActivityExtension: getTcxActivityExtension(extensionElements)
  };
}

/**
 * @param {Element[]} laps
 * @returns {Record<string, unknown> | null}
 */
function extractImportedSummary(laps) {
  if (laps.length === 0) {
    return null;
  }

  const totalDistanceMeters = sumNumbers(laps, "DistanceMeters");
  const totalDurationSeconds = sumNumbers(laps, "TotalTimeSeconds");
  const calories = sumNumbers(laps, "Calories");
  const maxSpeed = maxNumbers(laps, "MaximumSpeed");
  const hasAny =
    totalDistanceMeters !== null ||
    totalDurationSeconds !== null ||
    calories !== null ||
    maxSpeed !== null;

  if (!hasAny) {
    return null;
  }

  return {
    mode: "imported_summary",
    totalDistanceMeters,
    totalDurationSeconds,
    movingDurationSeconds: totalDurationSeconds,
    maxSpeedKmh: maxSpeed === null ? null : maxSpeed * 3.6,
    calories,
    sourceTag: "tcx_lap"
  };
}

/**
 * @param {string} fileName
 */
function getFileDisplayName(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

/**
 * @param {Element[]} laps
 */
function getLapIndexes(laps) {
  const indexes = new Map();
  laps.forEach((lap, index) => indexes.set(lap, index));
  return indexes;
}

/**
 * @param {Element} node
 * @param {Map<Element, number>} lapIndexes
 */
function getLapIndex(node, lapIndexes) {
  const lap = findAncestor(node, "Lap");
  return lap ? (lapIndexes.get(lap) ?? 0) : 0;
}

/**
 * @param {Element[]} extensionElements
 * @returns {{ speedMetersPerSecond: number | null, speedKmh: number | null, runCadence: number | null, watts: number | null } | null}
 */
function getTcxActivityExtension(extensionElements) {
  const tpxElements = getActivityExtensionTpxElements(extensionElements);
  const speedMetersPerSecond = firstActivityExtensionDescendantNumber(tpxElements, "Speed");
  const runCadence = firstActivityExtensionDescendantNumber(tpxElements, "RunCadence");
  const watts = firstActivityExtensionDescendantNumber(tpxElements, "Watts");

  if (speedMetersPerSecond === null && runCadence === null && watts === null) {
    return null;
  }

  return {
    speedMetersPerSecond,
    speedKmh: speedMetersPerSecond === null ? null : speedMetersPerSecond * 3.6,
    runCadence,
    watts
  };
}

/**
 * @param {Element[]} extensionElements
 * @returns {Element[]}
 */
function getActivityExtensionTpxElements(extensionElements) {
  return extensionElements
    .flatMap((extensionElement) => getDescendantsByLocalName(extensionElement, "TPX"))
    .filter((element) => element.namespaceURI === ACTIVITY_EXTENSION_NAMESPACE);
}

/**
 * @param {Element[]} roots
 * @param {string} localName
 * @returns {number | null}
 */
function firstActivityExtensionDescendantNumber(roots, localName) {
  for (const root of roots) {
    const elements = getActivityExtensionDescendantsByLocalName(root, localName);

    for (const element of elements) {
      const value = parseOptionalNumber(element.textContent?.trim() ?? null);

      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

/**
 * @param {TcxTrackPoint[]} points
 */
function getTrackpointExtensionProvenance(points) {
  const extendedPoints = points.filter((point) => point.tcxActivityExtension !== null);

  return {
    source: "tcx_activity_extension",
    pointCount: extendedPoints.length,
    speedCount: extendedPoints.filter(
      (point) => point.tcxActivityExtension?.speedMetersPerSecond !== null
    ).length,
    runCadenceCount: extendedPoints.filter(
      (point) => point.tcxActivityExtension?.runCadence !== null
    ).length,
    wattsCount: extendedPoints.filter((point) => point.tcxActivityExtension?.watts !== null).length
  };
}

/**
 * @param {Element} root
 * @param {string} localName
 * @returns {Element[]}
 */
function getActivityExtensionDescendantsByLocalName(root, localName) {
  return getDescendantsByLocalName(root, localName).filter(
    (element) => element.namespaceURI === ACTIVITY_EXTENSION_NAMESPACE
  );
}

/**
 * @param {TcxTrackPoint[]} points
 * @returns {"gpx" | "none"}
 */
function getParsedElevationSource(points) {
  return points.some((point) => point.elevationSource === "gpx") ? "gpx" : "none";
}

/**
 * @param {Element[]} nodes
 * @param {string} tagName
 */
function sumNumbers(nodes, tagName) {
  const values = nodes
    .map((node) => parseOptionalNumber(getChildText(node, tagName)))
    .filter((value) => value !== null);

  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * @param {Element[]} nodes
 * @param {string} tagName
 */
function maxNumbers(nodes, tagName) {
  const values = nodes
    .map((node) => parseOptionalNumber(getChildText(node, tagName)))
    .filter((value) => value !== null);

  return values.length ? Math.max(...values) : null;
}
