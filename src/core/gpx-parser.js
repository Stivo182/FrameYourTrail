import { createActivityProvenance } from "./activity-provenance.js";
import { haversineMeters } from "./haversine.js";
import { speedMpsToKmh } from "./speed-calibration.js";
import {
  isValidLatitude,
  isValidLongitude,
  parseOptionalDateInfo,
  parseOptionalInteger,
  parseOptionalNumber
} from "./track-source-primitives.js";
import {
  getChildText,
  getDirectChildrenByLocalName,
  serializeElements
} from "./xml-parser-helpers.js";

export class GpxParseError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message);
    this.name = "GpxParseError";
    this.code = code;
  }
}

const ZERO_PLACEHOLDER_MIN_POINTS = 20;
const ZERO_PLACEHOLDER_ZERO_RATIO = 0.95;
const ZERO_PLACEHOLDER_MAX_NON_ZERO_RATIO = 0.03;
const ZERO_PLACEHOLDER_MIN_NON_ZERO_METERS = 20;
const ZERO_ELEVATION_EPSILON_METERS = 0.01;
const FLAT_TIMESTAMP_MIN_POINTS = 2;
// Treat regular short-cadence time as synthetic only when geometry contradictions repeat,
// so isolated GPS spikes in otherwise plausible activities do not erase real timestamps.
const SYNTHETIC_TIMESTAMP_MIN_TIMED_PAIRS = 6;
const SYNTHETIC_TIMESTAMP_MAX_REGULAR_CADENCE_SECONDS = 15;
const SYNTHETIC_TIMESTAMP_REGULAR_CADENCE_SHARE = 0.8;
const SYNTHETIC_TIMESTAMP_CADENCE_TOLERANCE_RATIO = 0.1;
const SYNTHETIC_TIMESTAMP_MIN_CADENCE_TOLERANCE_SECONDS = 1;
const SYNTHETIC_TIMESTAMP_IMPOSSIBLE_SPEED_MPS = 100;
const SYNTHETIC_TIMESTAMP_MIN_IMPOSSIBLE_SPEED_COUNT = 6;
const SYNTHETIC_TIMESTAMP_MIN_IMPOSSIBLE_SPEED_SHARE = 0.6;
const GARMIN_TRACK_STATS_EXTENSION_NAMESPACE =
  "http://www.garmin.com/xmlschemas/TrackStatsExtension/v1";
const GENERIC_CURRENT_TRACK_PREFIXES = [
  "current track",
  "current activity",
  "current route",
  "\u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u0442\u0440\u0435\u043a",
  "\u0442\u0435\u043a\u0443\u0449\u0430\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c",
  "\u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043c\u0430\u0440\u0448\u0440\u0443\u0442",
  "actividad actual",
  "track actual",
  "ruta actual",
  "activite actuelle",
  "trace actuelle",
  "itineraire actuel",
  "aktuelle aktivitat",
  "aktueller track",
  "aktuelle route",
  "aktuelle strecke"
];
const GENERIC_DEFAULT_TRACK_EXACT_NAMES = [
  "track",
  "route",
  "activity",
  "workout",
  "untitled",
  "untitled track",
  "untitled route",
  "untitled activity",
  "new track",
  "new route",
  "new activity",
  "\u0442\u0440\u0435\u043a",
  "\u043c\u0430\u0440\u0448\u0440\u0443\u0442",
  "\u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c",
  "\u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0430",
  "\u0431\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f",
  "\u0431\u0435\u0437\u044b\u043c\u044f\u043d\u043d\u044b\u0439 \u0442\u0440\u0435\u043a",
  "\u043d\u043e\u0432\u044b\u0439 \u0442\u0440\u0435\u043a",
  "\u043d\u043e\u0432\u044b\u0439 \u043c\u0430\u0440\u0448\u0440\u0443\u0442",
  "\u043d\u043e\u0432\u0430\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c",
  "sin titulo",
  "sin nombre",
  "ruta",
  "actividad",
  "entrenamiento",
  "ruta sin titulo",
  "nueva ruta",
  "nueva actividad",
  "sans titre",
  "trace",
  "activite",
  "parcours",
  "itineraire",
  "trace sans titre",
  "nouvelle trace",
  "nouvel itineraire",
  "unbenannt",
  "track ohne titel",
  "strecke",
  "aktivitat",
  "training",
  "neuer track",
  "neue strecke"
];
const GENERIC_DEFAULT_TRACK_PREFIXES = [
  "track",
  "activity",
  "workout",
  "untitled",
  "untitled track",
  "untitled activity",
  "new track",
  "new activity",
  "\u0442\u0440\u0435\u043a",
  "\u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c",
  "\u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0430",
  "\u0431\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f",
  "\u0431\u0435\u0437\u044b\u043c\u044f\u043d\u043d\u044b\u0439 \u0442\u0440\u0435\u043a",
  "\u043d\u043e\u0432\u044b\u0439 \u0442\u0440\u0435\u043a",
  "\u043d\u043e\u0432\u0430\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c",
  "sin titulo",
  "sin nombre",
  "actividad",
  "entrenamiento",
  "ruta sin titulo",
  "nueva actividad",
  "sans titre",
  "trace sans titre",
  "nouvelle trace",
  "unbenannt",
  "track ohne titel",
  "aktivitat",
  "training",
  "neuer track"
];
const SUMMARY_FIELD_ALIASES = {
  totalDistanceMeters: ["distancemeters", "distance", "totaldistance", "totaldistancemeters"],
  totalDistance3dMeters: [
    "distance3dmeters",
    "totaldistance3d",
    "totaldistance3dmeters",
    "threedistance",
    "threedistancemeters"
  ],
  totalDurationSeconds: [
    "durationseconds",
    "timerseconds",
    "totaltime",
    "totaldurationseconds",
    "timertime",
    "totalelapsedtime"
  ],
  movingDurationSeconds: ["movingdurationseconds", "movingseconds", "movingtime", "movingduration"],
  stoppedDurationSeconds: [
    "stoppeddurationseconds",
    "stoppedseconds",
    "stoppedtime",
    "stoppedduration",
    "stoptime",
    "pausetime"
  ],
  averageSpeedKmh: ["averagespeedkmh", "avgspeedkmh"],
  movingAverageSpeedKmh: ["movingaveragespeedkmh", "movingavgspeedkmh", "movingspeed"],
  maxSpeedKmh: ["maxspeedkmh", "maxspeed", "maximumspeedkmh", "topspeedkmh"],
  elevationGainMeters: [
    "ascent",
    "ascentmeters",
    "totalascent",
    "elevationgain",
    "gain",
    "elevationgainmeters"
  ],
  elevationLossMeters: [
    "descent",
    "descentmeters",
    "totaldescent",
    "elevationloss",
    "loss",
    "elevationlossmeters"
  ],
  minElevationMeters: [
    "minelevation",
    "minelevationmeters",
    "minheightmeters",
    "minaltitudemeters",
    "minimumaltitude",
    "minimumelevation"
  ],
  maxElevationMeters: [
    "maxelevation",
    "maxelevationmeters",
    "maxheightmeters",
    "maxaltitudemeters",
    "maximumaltitude",
    "maximumelevation"
  ],
  elevationRangeMeters: [
    "elevationrangemeters",
    "altituderangemeters",
    "heightrangemeters",
    "elevationrange",
    "altituderange",
    "heightrange"
  ]
};
const SUMMARY_ALIAS_TO_FIELDS = buildSummaryAliasToFields(SUMMARY_FIELD_ALIASES);

/**
 * @typedef {import("./route-types.js").TrackPoint} TrackPoint
 */

/**
 * @typedef {object} GpxNormalizationProvenance
 * @property {"zero_filled_elevation_placeholder" | "flat_timestamp_placeholder" | "synthetic_timestamp_placeholder"} type
 * @property {number} appliedPointCount
 * @property {number[]} [segmentKeys]
 * @property {string} reason
 */

/**
 * @typedef {object} ParsedGpx
 * @property {string} fileName
 * @property {string} name
 * @property {TrackPoint[]} points
 * @property {TrackPoint[]} [rawPoints]
 * @property {boolean} hasElevation
 * @property {boolean} hasTime
 * @property {"barometric" | "gpx" | "terrain" | "none"} elevationSource
 * @property {import("./route-types.js").RouteActivityProvenance | null} [activity]
 * @property {Record<string, unknown> | null} [importedSummary]
 * @property {{
 *   format: "gpx",
 *   pointCount: number,
 *   segmentCount: number,
 *   normalizations: GpxNormalizationProvenance[],
 *   rawExtensions: { gpx: string[], metadata: string[], tracks: string[] }
 * }} [provenance]
 */

/**
 * @param {string} source
 * @param {string} fileName
 * @returns {ParsedGpx}
 */
export function parseGpx(source, fileName) {
  if (!source.trim().startsWith("<")) {
    throw new GpxParseError("File is not XML", "not_xml");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(source, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];

  if (parserError) {
    throw new GpxParseError("XML cannot be parsed", "invalid_xml");
  }

  const pointNodes = [
    ...Array.from(doc.getElementsByTagName("trkpt")),
    ...Array.from(doc.getElementsByTagName("rtept"))
  ];
  const pointNodeSet = new Set(pointNodes);
  const trackSegments = getPointContainers(
    Array.from(doc.getElementsByTagName("trkseg")),
    pointNodeSet,
    "trkpt"
  );
  const routeContainers = getPointContainers(
    Array.from(doc.getElementsByTagName("rte")),
    pointNodeSet,
    "rtept"
  );
  const segmentIndexes = getSegmentIndexes(trackSegments, routeContainers);

  if (pointNodes.length === 0) {
    throw new GpxParseError("GPX does not contain points", "empty_track");
  }

  /** @type {TrackPoint[]} */
  const rawPoints = pointNodes.map((node, index) => {
    const latitudeText = node.getAttribute("lat");
    const longitudeText = node.getAttribute("lon");
    const latitude = latitudeText === null ? Number.NaN : Number(latitudeText);
    const longitude = longitudeText === null ? Number.NaN : Number(longitudeText);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
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

    const elevationText = getChildText(node, "ele");
    const timeText = getChildText(node, "time");
    const elevation = parseOptionalNumber(elevationText);
    const geoidHeight = parseOptionalNumber(getChildText(node, "geoidheight"));
    const timeInfo = parseOptionalDateInfo(timeText);
    const extensionElements = getDirectExtensionElements(node);
    const explicitElevationSource = getExplicitElevationSource(extensionElements);
    const elevationDatum = getExplicitElevationDatum(extensionElements) ?? "unknown";
    const normalizedElevation = normalizeElevation(elevation, elevationDatum, geoidHeight);
    const elevationSource = getPointElevationSource(
      normalizedElevation.elevation,
      explicitElevationSource
    );

    return {
      latitude,
      longitude,
      elevation: normalizedElevation.elevation,
      elevationSource,
      elevationDatum,
      elevationNormalization: normalizedElevation.normalization,
      timeText,
      timeZoneStatus: timeInfo.timeZoneStatus,
      timestamp: timeInfo.timestamp,
      segmentIndex: getSegmentIndex(node, segmentIndexes),
      geoidHeight,
      fix: getChildText(node, "fix"),
      satellites: parseOptionalInteger(getChildText(node, "sat")),
      hdop: parseOptionalNumber(getChildText(node, "hdop")),
      vdop: parseOptionalNumber(getChildText(node, "vdop")),
      pdop: parseOptionalNumber(getChildText(node, "pdop")),
      rawExtensions: serializeElements(extensionElements)
    };
  });
  const physicalSegmentKeys = getPhysicalSegmentKeys(pointNodes);
  const elevationNormalization = normalizePlaceholderElevations(rawPoints);
  const timestampNormalization = normalizePlaceholderTimestamps(
    elevationNormalization.points,
    physicalSegmentKeys
  );
  const syntheticTimestampNormalization = normalizeSyntheticTimestamps(
    timestampNormalization.points,
    physicalSegmentKeys
  );
  const points = syntheticTimestampNormalization.points;
  const normalizations = [
    ...elevationNormalization.normalizations,
    ...timestampNormalization.normalizations,
    ...syntheticTimestampNormalization.normalizations
  ];

  const hasElevation = points.some(
    (point) => point.elevation !== null && Number.isFinite(point.elevation)
  );
  const hasTime = points.some(
    (point) => point.timestamp instanceof Date && !Number.isNaN(point.timestamp.valueOf())
  );

  const displayName = findDisplayName(doc, fileName);

  return {
    fileName,
    name: displayName,
    points,
    hasElevation,
    hasTime,
    elevationSource: getParsedElevationSource(points),
    activity: extractActivity(doc),
    importedSummary: extractImportedSummary(doc),
    provenance: {
      format: "gpx",
      pointCount: points.length,
      segmentCount: getSegmentCount(trackSegments, routeContainers, pointNodes),
      normalizations,
      rawExtensions: {
        gpx: getDirectExtensionFragments(doc.documentElement),
        metadata: Array.from(doc.getElementsByTagName("metadata")).flatMap((node) =>
          getDirectExtensionFragments(node)
        ),
        tracks: Array.from(doc.getElementsByTagName("trk")).flatMap((node) =>
          getDirectExtensionFragments(node)
        )
      }
    }
  };
}

/**
 * @param {Document} doc
 */
function extractActivity(doc) {
  const trackActivity = extractActivityFromNodes(
    Array.from(doc.getElementsByTagName("trk")),
    "gpx_track_type"
  );

  if (trackActivity) {
    return trackActivity;
  }

  return extractActivityFromNodes(Array.from(doc.getElementsByTagName("rte")), "gpx_route_type");
}

/**
 * @param {Element[]} nodes
 * @param {"gpx_track_type" | "gpx_route_type"} source
 */
function extractActivityFromNodes(nodes, source) {
  for (const node of nodes) {
    const raw = getChildText(node, "type");

    if (raw === null) {
      continue;
    }

    const activity = createActivityProvenance(raw, source);

    if (activity !== null) {
      return activity;
    }
  }

  return null;
}

/**
 * @param {TrackPoint[]} points
 * @returns {{ points: TrackPoint[], normalizations: GpxNormalizationProvenance[] }}
 */
function normalizePlaceholderElevations(points) {
  if (!hasZeroFilledPlaceholderElevations(points)) {
    return { points, normalizations: [] };
  }

  return {
    points: points.map((point) => ({
      ...point,
      elevation: null,
      elevationSource: point.elevationSource === "barometric" ? "barometric" : "none",
      elevationNormalization: null
    })),
    normalizations: [
      {
        type: "zero_filled_elevation_placeholder",
        appliedPointCount: points.length,
        reason: "dominant_zero_series_with_sparse_non_zero_outliers"
      }
    ]
  };
}

/**
 * @param {TrackPoint[]} points
 * @returns {boolean}
 */
function hasZeroFilledPlaceholderElevations(points) {
  const elevations = points
    .map((point) => point.elevation)
    .filter((elevation) => Number.isFinite(elevation))
    .map(Number);

  if (elevations.length < ZERO_PLACEHOLDER_MIN_POINTS) {
    return false;
  }

  const zeroCount = elevations.filter(
    (elevation) => Math.abs(elevation) <= ZERO_ELEVATION_EPSILON_METERS
  ).length;
  const nonZeroElevations = elevations.filter(
    (elevation) => Math.abs(elevation) > ZERO_ELEVATION_EPSILON_METERS
  );
  const zeroRatio = zeroCount / elevations.length;
  const nonZeroRatio = nonZeroElevations.length / elevations.length;
  const maxNonZeroElevation = Math.max(
    ...nonZeroElevations.map((elevation) => Math.abs(elevation))
  );

  return (
    nonZeroElevations.length > 0 &&
    zeroRatio >= ZERO_PLACEHOLDER_ZERO_RATIO &&
    nonZeroRatio <= ZERO_PLACEHOLDER_MAX_NON_ZERO_RATIO &&
    maxNonZeroElevation >= ZERO_PLACEHOLDER_MIN_NON_ZERO_METERS
  );
}

/**
 * @param {TrackPoint[]} points
 * @param {number[]} segmentKeys
 * @returns {{ points: TrackPoint[], normalizations: GpxNormalizationProvenance[] }}
 */
function normalizePlaceholderTimestamps(points, segmentKeys = []) {
  const placeholderSegments = getFlatTimestampSegmentIndexes(points, segmentKeys);

  if (placeholderSegments.size === 0) {
    return { points, normalizations: [] };
  }

  const appliedPointCount = points.filter((point, index) =>
    placeholderSegments.has(getPointSegmentKey(point, segmentKeys, index))
  ).length;

  return {
    points: points.map((point, index) =>
      placeholderSegments.has(getPointSegmentKey(point, segmentKeys, index))
        ? {
            ...point,
            timestamp: null,
            timeZoneStatus: "none"
          }
        : point
    ),
    normalizations: [
      {
        type: "flat_timestamp_placeholder",
        appliedPointCount,
        segmentKeys: [...placeholderSegments],
        reason: "flat_timestamp_segment"
      }
    ]
  };
}

/**
 * @param {TrackPoint[]} points
 * @param {number[]} segmentKeys
 * @returns {{ points: TrackPoint[], normalizations: GpxNormalizationProvenance[] }}
 */
function normalizeSyntheticTimestamps(points, segmentKeys = []) {
  const syntheticSegments = getSyntheticTimestampSegmentIndexes(points, segmentKeys);

  if (syntheticSegments.size === 0) {
    return { points, normalizations: [] };
  }

  const appliedPointCount = points.filter((point, index) =>
    syntheticSegments.has(getPointSegmentKey(point, segmentKeys, index))
  ).length;

  return {
    points: points.map((point, index) =>
      syntheticSegments.has(getPointSegmentKey(point, segmentKeys, index))
        ? {
            ...point,
            timestamp: null,
            timeZoneStatus: "none"
          }
        : point
    ),
    normalizations: [
      {
        type: "synthetic_timestamp_placeholder",
        appliedPointCount,
        segmentKeys: [...syntheticSegments],
        reason: "regular_cadence_with_repeated_impossible_geometry"
      }
    ]
  };
}

/**
 * @param {TrackPoint[]} points
 * @returns {Set<number>}
 */
function getSyntheticTimestampSegmentIndexes(points, segmentKeys = []) {
  const segments = new Map();

  for (const [index, point] of points.entries()) {
    const segmentIndex = getPointSegmentKey(point, segmentKeys, index);
    const segmentPoints = segments.get(segmentIndex) ?? [];

    segmentPoints.push(point);
    segments.set(segmentIndex, segmentPoints);
  }

  const syntheticSegments = new Set();

  for (const [segmentIndex, segmentPoints] of segments) {
    if (hasBroadGeometryTimeContradictions(segmentPoints)) {
      syntheticSegments.add(segmentIndex);
    }
  }

  return syntheticSegments;
}

/**
 * @param {TrackPoint[]} points
 * @returns {boolean}
 */
function hasBroadGeometryTimeContradictions(points) {
  const timedPairs = getTimedPointPairs(points);

  if (timedPairs.length < SYNTHETIC_TIMESTAMP_MIN_TIMED_PAIRS) {
    return false;
  }

  const remainingPairs = removeOutAndBackSpikePairs(timedPairs);

  if (remainingPairs.length === 0) {
    return false;
  }

  const regularPairShare = getRegularCadenceShare(timedPairs);
  const impossibleSpeedCount = remainingPairs.filter(
    (pair) => pair.speedMetersPerSecond > SYNTHETIC_TIMESTAMP_IMPOSSIBLE_SPEED_MPS
  ).length;
  const impossibleSpeedShare = impossibleSpeedCount / remainingPairs.length;

  return (
    regularPairShare >= SYNTHETIC_TIMESTAMP_REGULAR_CADENCE_SHARE &&
    (impossibleSpeedShare >= SYNTHETIC_TIMESTAMP_MIN_IMPOSSIBLE_SPEED_SHARE ||
      impossibleSpeedCount >= SYNTHETIC_TIMESTAMP_MIN_IMPOSSIBLE_SPEED_COUNT)
  );
}

/**
 * @param {TrackPoint[]} points
 * @returns {{ from: TrackPoint, to: TrackPoint, seconds: number, speedMetersPerSecond: number, distanceMeters: number }[]}
 */
function getTimedPointPairs(points) {
  /** @type {{ from: TrackPoint, to: TrackPoint, seconds: number, speedMetersPerSecond: number, distanceMeters: number }[]} */
  const timedPairs = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];

    const previousTime = getPointTimestampMs(previous);
    const pointTime = getPointTimestampMs(point);

    if (previousTime === null || pointTime === null) {
      continue;
    }

    const seconds = (pointTime - previousTime) / 1000;

    if (seconds <= 0 || !Number.isFinite(seconds)) {
      continue;
    }

    const distanceMeters = haversineMeters(previous, point);

    timedPairs.push({
      from: previous,
      to: point,
      seconds,
      speedMetersPerSecond: distanceMeters / seconds,
      distanceMeters
    });
  }

  return timedPairs;
}

/**
 * @param {{ from: TrackPoint, to: TrackPoint, seconds: number, speedMetersPerSecond: number }[]} timedPairs
 */
function removeOutAndBackSpikePairs(timedPairs) {
  const spikePairIndexes = new Set();

  for (let index = 0; index < timedPairs.length - 1; index += 1) {
    const outbound = timedPairs[index];
    const inbound = timedPairs[index + 1];
    const previous = timedPairs[index - 1];
    const next = timedPairs[index + 2];

    if (
      isOutAndBackSpikePair(outbound, inbound) &&
      isPlausibleTimedPair(previous) &&
      isPlausibleTimedPair(next)
    ) {
      spikePairIndexes.add(index);
      spikePairIndexes.add(index + 1);
    }
  }

  return timedPairs.filter((_pair, index) => !spikePairIndexes.has(index));
}

/**
 * @param {{ from: TrackPoint, to: TrackPoint, seconds: number, speedMetersPerSecond: number }} outbound
 * @param {{ from: TrackPoint, to: TrackPoint, seconds: number, speedMetersPerSecond: number }} inbound
 */
function isOutAndBackSpikePair(outbound, inbound) {
  if (
    outbound.to !== inbound.from ||
    outbound.speedMetersPerSecond <= SYNTHETIC_TIMESTAMP_IMPOSSIBLE_SPEED_MPS ||
    inbound.speedMetersPerSecond <= SYNTHETIC_TIMESTAMP_IMPOSSIBLE_SPEED_MPS
  ) {
    return false;
  }

  const combinedSeconds = outbound.seconds + inbound.seconds;

  if (combinedSeconds <= 0 || !Number.isFinite(combinedSeconds)) {
    return false;
  }

  const directDistanceMeters = haversineMeters(outbound.from, inbound.to);
  const directSpeedMetersPerSecond = directDistanceMeters / combinedSeconds;

  return directSpeedMetersPerSecond <= SYNTHETIC_TIMESTAMP_IMPOSSIBLE_SPEED_MPS;
}

/**
 * @param {{ speedMetersPerSecond: number } | undefined} pair
 */
function isPlausibleTimedPair(pair) {
  return (
    pair === undefined || pair.speedMetersPerSecond <= SYNTHETIC_TIMESTAMP_IMPOSSIBLE_SPEED_MPS
  );
}

/**
 * @param {{ seconds: number }[]} timedPairs
 */
function getRegularCadenceShare(timedPairs) {
  const intervals = timedPairs.map((pair) => pair.seconds).sort((left, right) => left - right);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];

  if (
    !Number.isFinite(medianInterval) ||
    medianInterval > SYNTHETIC_TIMESTAMP_MAX_REGULAR_CADENCE_SECONDS
  ) {
    return 0;
  }

  const tolerance = Math.max(
    SYNTHETIC_TIMESTAMP_MIN_CADENCE_TOLERANCE_SECONDS,
    medianInterval * SYNTHETIC_TIMESTAMP_CADENCE_TOLERANCE_RATIO
  );
  const regularCount = intervals.filter(
    (interval) => Math.abs(interval - medianInterval) <= tolerance
  ).length;

  return regularCount / intervals.length;
}

/**
 * @param {TrackPoint} point
 * @returns {number | null}
 */
function getPointTimestampMs(point) {
  const timestamp = point.timestamp;
  const value = timestamp instanceof Date ? timestamp.valueOf() : Number.NaN;

  return Number.isFinite(value) ? value : null;
}

/**
 * @param {TrackPoint[]} points
 * @returns {Set<number>}
 */
function getFlatTimestampSegmentIndexes(points, segmentKeys = []) {
  const segments = new Map();

  for (const [index, point] of points.entries()) {
    const segmentIndex = getPointSegmentKey(point, segmentKeys, index);
    const segmentPoints = segments.get(segmentIndex) ?? [];

    segmentPoints.push(point);
    segments.set(segmentIndex, segmentPoints);
  }

  const placeholderSegments = new Set();

  for (const [segmentIndex, segmentPoints] of segments) {
    if (hasFlatTimestampSegment(segmentPoints)) {
      placeholderSegments.add(segmentIndex);
    }
  }

  return placeholderSegments;
}

/**
 * @param {TrackPoint[]} points
 */
function hasFlatTimestampSegment(points) {
  const timestamps = [];

  for (const point of points) {
    const timestamp = point.timestamp;

    if (timestamp instanceof Date && !Number.isNaN(timestamp.valueOf())) {
      timestamps.push(timestamp.valueOf());
    }
  }

  if (timestamps.length < FLAT_TIMESTAMP_MIN_POINTS) {
    return false;
  }

  return timestamps.every((timestamp) => timestamp === timestamps[0]);
}

/**
 * @param {TrackPoint} point
 */
function getPointSegmentIndex(point) {
  return Number.isFinite(point.segmentIndex) ? point.segmentIndex : 0;
}

/**
 * @param {TrackPoint} point
 * @param {number[]} segmentKeys
 * @param {number} index
 */
function getPointSegmentKey(point, segmentKeys, index) {
  return Number.isFinite(segmentKeys[index]) ? segmentKeys[index] : getPointSegmentIndex(point);
}

/**
 * @param {Document} doc
 * @returns {string}
 */
function findName(doc) {
  const trackName = doc
    .getElementsByTagName("trk")[0]
    ?.getElementsByTagName("name")[0]?.textContent;
  const metadataName = doc
    .getElementsByTagName("metadata")[0]
    ?.getElementsByTagName("name")[0]?.textContent;
  return (trackName || metadataName || "").trim();
}

/**
 * @param {Document} doc
 * @param {string} fileName
 */
function findDisplayName(doc, fileName) {
  const gpxName = findName(doc);

  return gpxName && !isGenericTrackName(gpxName) ? gpxName : stripExtension(fileName);
}

/**
 * @param {string} name
 */
function isGenericTrackName(name) {
  const normalized = normalizeGenericTrackName(name);

  if (
    GENERIC_DEFAULT_TRACK_EXACT_NAMES.some(
      (defaultName) => normalized === normalizeGenericTrackName(defaultName)
    )
  ) {
    return true;
  }

  return [...GENERIC_CURRENT_TRACK_PREFIXES, ...GENERIC_DEFAULT_TRACK_PREFIXES].some((prefix) =>
    isGenericTrackNameForPrefix(normalized, normalizeGenericTrackName(prefix))
  );
}

/**
 * @param {string} value
 */
function normalizeGenericTrackName(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * @param {string} normalized
 * @param {string} prefix
 */
function isGenericTrackNameForPrefix(normalized, prefix) {
  if (normalized === prefix) {
    return true;
  }

  if (!normalized.startsWith(prefix)) {
    return false;
  }

  const suffix = normalized.slice(prefix.length).trimStart();

  if (!suffix) {
    return true;
  }

  const dateSuffix = suffix.replace(/^[:\-.#\u2013\u2014]\s*/u, "");
  return /^\d/u.test(dateSuffix);
}

/**
 * @param {Element[]} trackSegments
 * @param {Element[]} routeContainers
 * @returns {Map<Element, number>}
 */
function getSegmentIndexes(trackSegments, routeContainers) {
  const segmentIndexes = new Map();

  for (const segment of trackSegments) {
    segmentIndexes.set(segment, segmentIndexes.size);
  }

  for (const route of routeContainers) {
    segmentIndexes.set(route, segmentIndexes.size);
  }

  return segmentIndexes;
}

/**
 * @param {Element[]} containers
 * @param {Set<Element>} pointNodes
 * @param {string} pointLocalName
 * @returns {Element[]}
 */
function getPointContainers(containers, pointNodes, pointLocalName) {
  return containers.filter((container) =>
    getDirectChildrenByLocalName(container, pointLocalName).some((point) => pointNodes.has(point))
  );
}

/**
 * @param {Element[]} pointNodes
 * @returns {number[]}
 */
function getPhysicalSegmentKeys(pointNodes) {
  const segmentKeys = new Map();

  return pointNodes.map((node) => {
    const segment = node.parentElement ?? node;
    const existingKey = segmentKeys.get(segment);

    if (existingKey !== undefined) {
      return existingKey;
    }

    const key = segmentKeys.size;
    segmentKeys.set(segment, key);
    return key;
  });
}

/**
 * @param {Element} node
 * @param {Map<Element, number>} segmentIndexes
 * @returns {number}
 */
function getSegmentIndex(node, segmentIndexes) {
  const segment = node.parentElement;
  return segment ? (segmentIndexes.get(segment) ?? 0) : 0;
}

/**
 * @param {Element[]} trackSegments
 * @param {Element[]} routeContainers
 * @param {Element[]} pointNodes
 * @returns {number}
 */
function getSegmentCount(trackSegments, routeContainers, pointNodes) {
  return trackSegments.length + routeContainers.length || (pointNodes.length ? 1 : 0);
}

/**
 * @param {Element | null} node
 * @returns {Element[]}
 */
function getDirectExtensionElements(node) {
  const extensions = Array.from(node?.children ?? []).filter(
    (child) => child.localName === "extensions"
  );

  return extensions.flatMap((extension) => Array.from(extension.children));
}

/**
 * @param {Element | null} node
 * @returns {string[]}
 */
function getDirectExtensionFragments(node) {
  return serializeElements(getDirectExtensionElements(node));
}

/**
 * @param {Element[]} elements
 * @returns {"barometric" | null}
 */
function getExplicitElevationSource(elements) {
  for (const element of flattenElements(elements)) {
    const name = normalizeName(element.localName);
    const value = element.textContent?.trim().toLowerCase();

    if ((name === "elevationsource" || name === "altitudesource") && value === "barometric") {
      return "barometric";
    }
  }

  return null;
}

/**
 * @param {Element[]} elements
 * @returns {"msl" | "ellipsoid" | null}
 */
function getExplicitElevationDatum(elements) {
  for (const element of flattenElements(elements)) {
    const name = normalizeName(element.localName);
    const value = element.textContent?.trim().toLowerCase();

    if (
      (name === "elevationdatum" || name === "heightreference") &&
      (value === "ellipsoid" || value === "msl")
    ) {
      return value;
    }
  }

  return null;
}

/**
 * @param {Element[]} elements
 * @returns {Element[]}
 */
function flattenElements(elements) {
  return elements.flatMap((element) => [element, ...flattenElements(Array.from(element.children))]);
}

/**
 * @param {number | null} elevation
 * @param {"msl" | "ellipsoid" | "unknown"} datum
 * @param {number | null} geoidHeight
 * @returns {{ elevation: number | null, normalization: { applied: boolean, from: "ellipsoid", to: "msl", geoidHeightMeters: number } | null }}
 */
function normalizeElevation(elevation, datum, geoidHeight) {
  if (elevation === null || datum !== "ellipsoid" || geoidHeight === null) {
    return { elevation, normalization: null };
  }

  return {
    elevation: elevation - geoidHeight,
    normalization: {
      applied: true,
      from: "ellipsoid",
      to: "msl",
      geoidHeightMeters: geoidHeight
    }
  };
}

/**
 * @param {number | null} elevation
 * @param {"barometric" | null} explicitSource
 * @returns {"barometric" | "gpx" | "none"}
 */
function getPointElevationSource(elevation, explicitSource) {
  if (explicitSource) {
    return explicitSource;
  }

  if (elevation === null) {
    return "none";
  }

  return "gpx";
}

/**
 * @param {TrackPoint[]} points
 * @returns {"barometric" | "terrain" | "gpx" | "none"}
 */
function getParsedElevationSource(points) {
  const sources = points.map((point) => point.elevationSource);

  if (sources.includes("barometric")) {
    return "barometric";
  }

  if (sources.includes("terrain")) {
    return "terrain";
  }

  if (sources.includes("gpx")) {
    return "gpx";
  }

  return "none";
}

/**
 * @param {Document} doc
 * @returns {Record<string, unknown> | null}
 */
function extractImportedSummary(doc) {
  const fields = collectSummaryFields(doc);
  const hasAnyField = Object.values(fields).some((value) => Number.isFinite(value));

  return hasAnyField
    ? {
        mode: "imported_summary",
        ...fields,
        sourceTag: "gpx_extensions"
      }
    : null;
}

/**
 * @param {Document} doc
 * @returns {Record<string, number | null>}
 */
function collectSummaryFields(doc) {
  const fields = createEmptySummaryFields();

  for (const node of getExtensionDescendantElements(doc)) {
    assignSummaryValue(fields, node.localName, node.textContent?.trim() ?? null, node.namespaceURI);

    for (const attribute of Array.from(node.attributes)) {
      assignSummaryValue(fields, attribute.localName, attribute.value, attribute.namespaceURI);
    }
  }

  return fields;
}

/**
 * @returns {Record<string, number | null>}
 */
function createEmptySummaryFields() {
  return Object.fromEntries(
    Object.keys(SUMMARY_FIELD_ALIASES).map((fieldName) => [fieldName, null])
  );
}

/**
 * @param {Document} doc
 * @returns {Element[]}
 */
function getExtensionDescendantElements(doc) {
  const extensionRoots = Array.from(doc.getElementsByTagName("extensions")).filter(
    (node) => !isInsideExtensions(node)
  );

  return extensionRoots.flatMap((extension) => flattenElements(Array.from(extension.children)));
}

/**
 * @param {Record<string, number | null>} fields
 * @param {string} name
 * @param {string | null} text
 * @param {string | null} namespaceURI
 */
function assignSummaryValue(fields, name, text, namespaceURI = null) {
  const normalizedName = normalizeName(name);
  const fieldNames = SUMMARY_ALIAS_TO_FIELDS.get(normalizedName) ?? [];
  const parsedValue = parseOptionalNumber(text);

  if (parsedValue === null) {
    return;
  }

  const value = normalizeSummaryValue(normalizedName, namespaceURI, parsedValue);

  for (const fieldName of fieldNames) {
    if (fields[fieldName] === null) {
      fields[fieldName] = value;
    }
  }
}

/**
 * @param {string} normalizedName
 * @param {string | null} namespaceURI
 * @param {number} value
 */
function normalizeSummaryValue(normalizedName, namespaceURI, value) {
  if (
    namespaceURI === GARMIN_TRACK_STATS_EXTENSION_NAMESPACE &&
    (normalizedName === "movingspeed" || normalizedName === "maxspeed")
  ) {
    return speedMpsToKmh(value);
  }

  return value;
}

/**
 * @param {Record<string, string[]>} aliasesByField
 * @returns {Map<string, string[]>}
 */
function buildSummaryAliasToFields(aliasesByField) {
  const aliasToFields = new Map();

  for (const [fieldName, aliases] of Object.entries(aliasesByField)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeName(alias);
      const fieldNames = aliasToFields.get(normalizedAlias) ?? [];

      fieldNames.push(fieldName);
      aliasToFields.set(normalizedAlias, fieldNames);
    }
  }

  return aliasToFields;
}

/**
 * @param {Element} node
 * @returns {boolean}
 */
function isInsideExtensions(node) {
  let current = node.parentElement;

  while (current) {
    if (current.localName === "extensions") {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

/**
 * @param {string} name
 */
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * @param {string} fileName
 * @returns {string}
 */
function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}
