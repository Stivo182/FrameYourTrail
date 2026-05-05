const en = {
  languageName: "English",
  site: {
    toolbarLabel: "Control panel",
    tagline: "Turn any route into a poster",
    uploadFile: "Choose file",
    exportAria: "Poster export",
    exportLabel: "Export:",
    clipboard: "Clipboard",
    emptyTitle: "Upload a route file to build a route infographic",
    emptyBody: "Map, stats, charts, and export become available after file analysis.",
    languageLabel: "Language"
  },
  messages: {
    unsupportedFile: "Choose a GPX, TCX, FIT, or XML file with a track.",
    parseError: "Could not read the file.",
    notXml: "The file is not XML.",
    invalidXml: "The XML file could not be parsed.",
    emptyTrack: "The route file does not contain route points.",
    missingCoordinates: "A route point does not contain coordinates.",
    coordinatesOutOfBounds: "A route point contains coordinates outside geographic bounds.",
    insufficientPoints: "The route file must contain at least two route points.",
    missingElevation:
      "The route file has no elevation data. Elevation metrics and charts will be hidden.",
    missingTime: "The route file has no time data. Speed and moving time will be hidden.",
    largeFile: "The file is larger than 50 MB. Processing and export may take longer.",
    terrainElevation:
      "Elevation was restored from terrain data and may differ from device altitude.",
    terrainElevationUnavailable: "Terrain elevation is unavailable. Keeping the current metrics.",
    exportError: "Could not export the poster.",
    previewRenderError: "Could not render the poster preview."
  },
  analysis: {
    sourceLabel: "Metrics",
    sourceSelectLabel: "Metric source",
    modeSelectLabel: "Metric source",
    modes: {
      recomputed_filtered: "Recommended",
      recomputed_raw: "From track points",
      recomputed_terrain: "Terrain elevation",
      recomputed_terrain_request: "Fetch terrain elevation",
      imported_summary: "File totals"
    },
    modeDescriptions: {
      recomputed_filtered: "Cleans obvious GPS errors and uses track points.",
      recomputed_raw: "Recalculates metrics from file points after standard cleanup.",
      recomputed_terrain: "Recalculates metrics with terrain elevation.",
      recomputed_terrain_request:
        "Fetches terrain elevation and requires an external lookup over the internet.",
      imported_summary:
        "Uses totals recorded by your device or app and may differ from track points."
    }
  },
  mapStyle: {
    selectLabel: "Map style",
    styles: {
      openfreemap_poster: {
        label: "OpenFreeMap",
        description: "Muted OpenFreeMap style matched to the poster palette."
      },
      osm_standard: {
        label: "OSM Standard",
        description: "Familiar general-purpose OpenStreetMap tiles."
      },
      cyclosm: {
        label: "CyclOSM",
        description: "Bike-oriented tiles with cycling route context."
      }
    }
  },
  poster: {
    mapAria: "Route map",
    elevationTitle: "Elevation profile",
    elevationChartAria: "Elevation profile chart",
    statsAria: "Route statistics",
    coordinatesAria: "Representative route coordinates",
    latitudeLabel: "Latitude",
    longitudeLabel: "Longitude",
    pointSummary: {
      one: "1 track point",
      few: "{count} track points",
      many: "{count} track points",
      other: "{count} track points"
    }
  },
  metrics: {
    distance: "Distance",
    movingTime: "Moving time",
    stoppedTime: "Stopped time",
    totalTime: "Total time",
    averageSpeed: "Average speed",
    movingSpeed: "Moving speed",
    maxSpeed: "Max speed",
    elevationGain: "Elevation gain",
    elevationLoss: "Elevation loss",
    minElevation: "Min elevation",
    maxElevation: "Max elevation",
    elevationRange: "Elevation range"
  },
  map: {
    start: "Start",
    finish: "Finish",
    fallbackAria: "Route without a base map",
    fallbackCaption: "The base map is unavailable, showing the route without OSM."
  },
  charts: {
    elevationUnavailable: "Elevation data unavailable",
    elevationAria: "Route elevation profile",
    elevationSeries: "Elevation profile",
    elevationYAxis: "Elevation, m",
    elevationTooltipDistance: "Distance",
    elevationTooltipElevation: "Elevation",
    minElevation: "Min elevation",
    maxElevation: "Max elevation",
    speedUnavailable: "Speed unavailable",
    speedAria: "Route speed chart",
    speedTitle: "Speed",
    speedLegendRibbon: "ribbon",
    speedLegendAverage: "average",
    speedLegendMoving: "moving",
    slopeUnavailable: "Slope unavailable",
    slopeAria: "Route slope chart",
    slopeTitle: "Slope",
    slopeLegendUp: "climb",
    slopeLegendDown: "descent"
  },
  templates: {
    routeReport: "Route report"
  },
  units: {
    km: "km",
    m: "m",
    kmh: "km/h",
    empty: "—"
  }
};

export default en;
