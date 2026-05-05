/**
 * Shared route and analysis model typedefs.
 *
 * This module intentionally exports no runtime values; it gives checkJs one
 * vocabulary for parser, analysis, state, and render boundaries.
 */

/**
 * @typedef {object} RoutePoint
 * @property {number} latitude
 * @property {number} longitude
 * @property {number | null} elevation
 * @property {"barometric" | "gpx" | "terrain" | "none"} [elevationSource]
 * @property {"msl" | "ellipsoid" | "unknown"} [elevationDatum]
 * @property {{ applied: boolean, from: "ellipsoid", to: "msl", geoidHeightMeters: number } | null} [elevationNormalization]
 * @property {string | null} [timeText]
 * @property {"explicit" | "missing" | "invalid" | "none"} [timeZoneStatus]
 * @property {Date | null} timestamp
 * @property {number} segmentIndex
 * @property {number | null} [distanceMeters]
 * @property {number | null} [geoidHeight]
 * @property {string | null} [fix]
 * @property {number | null} [satellites]
 * @property {number | null} [hdop]
 * @property {number | null} [vdop]
 * @property {number | null} [pdop]
 * @property {string[]} [rawExtensions]
 * @property {{ speedMetersPerSecond: number | null, speedKmh: number | null, runCadence: number | null, watts: number | null } | null} [tcxActivityExtension]
 */

/**
 * Route point shape consumed by parser and analysis internals.
 *
 * @typedef {RoutePoint} TrackPoint
 */

/**
 * Minimal route geometry accepted by renderers that only need coordinates.
 *
 * @typedef {Pick<RoutePoint, "latitude" | "longitude"> & Partial<Pick<RoutePoint, "elevation">>} RouteGeometryPoint
 */

/**
 * @typedef {object} RouteSourceMetadata
 * @property {string} format
 * @property {string | undefined} parser
 * @property {string | undefined} fileName
 * @property {string | undefined} name
 */

/**
 * @typedef {object} TerrainElevationProvenance
 * @property {"fallback" | "replacement"} mode
 * @property {"applied"} status
 * @property {number} pointCount
 */

/**
 * @typedef {Object} RouteNormalizationProvenance
 * @property {"zero_filled_elevation_placeholder" | "flat_timestamp_placeholder" | "synthetic_timestamp_placeholder"} type
 * @property {number} appliedPointCount
 * @property {number[] | undefined} [segmentKeys]
 * @property {string} reason
 */

/**
 * @typedef {Object} RouteActivityProvenance
 * @property {"bike" | "foot" | "water" | "motor"} type
 * @property {"fit_session_sport" | "fit_session_sub_sport" | "tcx_activity_sport" | "gpx_track_type" | "gpx_route_type"} source
 * @property {string} raw
 */

/**
 * @typedef {Record<string, unknown> & {
 *   terrainElevation?: TerrainElevationProvenance | undefined,
 *   normalizations?: RouteNormalizationProvenance[] | undefined,
 *   format?: string | undefined,
 *   pointCount?: number | undefined,
 *   segmentCount?: number | undefined
 * }} RouteSourceProvenance
 */

/**
 * @typedef {object} RouteSource
 * @property {string | undefined} [fileName]
 * @property {string | undefined} [name]
 * @property {RoutePoint[]} points
 * @property {RoutePoint[]} [rawPoints]
 * @property {boolean | undefined} hasElevation
 * @property {boolean | undefined} hasTime
 * @property {"barometric" | "gpx" | "terrain" | "none" | undefined} elevationSource
 * @property {RouteActivityProvenance | null | undefined} [activity]
 * @property {Record<string, unknown> | null | undefined} [importedSummary]
 * @property {RouteSourceMetadata} [source]
 * @property {RouteSourceProvenance} [provenance]
 */

/**
 * @typedef {RouteSource & {
 *   rawPoints: RoutePoint[],
 *   source: RouteSourceMetadata,
 *   provenance: RouteSourceProvenance
 * }} NormalizedRouteSource
 */

/**
 * @typedef {{ distanceFromStartMeters: number, elevation: number, continuousRunId?: number }} ElevationChartSample
 */

/**
 * @typedef {Record<string, unknown> & {
 *   mode?: string,
 *   totalDistanceMeters?: number | null,
 *   distanceSeries: { distanceFromStartMeters: number, elevation?: number | null }[],
 *   elevationSeries?: ElevationChartSample[] | number[],
 *   speedSeries?: unknown[],
 *   routePoints?: RoutePoint[]
 * }} TrackAnalysis
 */

export {};
