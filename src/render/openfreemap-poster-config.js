export const POSTER_BACKGROUND_MAP_PALETTE = Object.freeze({
  background: "#f0eee3",
  land: "#f0eee3",
  park: "#d7dfd0",
  sand: "#e8ddbf",
  rock: "#EEE5DC",
  farmland: "#d8d8b5",
  residential: "#e2ddd5",
  commercial: "#ddcecc",
  industrial: "#F4E2DC",
  civic: "#e4dec7",
  recreation: "#d8dfce",
  aerowayArea: "#e4e2e0",
  water: "#d6e3e0",
  waterLine: "#7ba8a8",
  waterLabel: "#416b73",
  glacier: "#dbe9e8",
  building: "#d7d0c2",
  buildingOutline: "#ccc5bb",
  road: "#ddd5c5",
  trail: "#8f8b63",
  aerialway: "#9f9a8d",
  boundary: "#b7b1a4",
  label: "#5f6c61",
  labelHalo: "#fbfaf3"
});

export const POSTER_AREA_DEFINITIONS = Object.freeze([
  Object.freeze({
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["ice"]),
    subclassValues: Object.freeze(["glacier", "ice_shelf"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.glacier
  }),
  Object.freeze({
    supplementalLayerId: "poster-landcover-sand",
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["sand"]),
    subclassValues: Object.freeze(["beach", "sand", "dune"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.sand
  }),
  Object.freeze({
    supplementalLayerId: "poster-landcover-rock",
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["rock"]),
    subclassValues: Object.freeze(["bare_rock", "scree"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.rock
  }),
  Object.freeze({
    supplementalLayerId: "poster-landcover-farmland",
    sourceLayer: "landcover",
    classification: "positive-filter",
    classValues: Object.freeze(["farmland"]),
    subclassValues: Object.freeze(["farmland", "farm", "orchard", "vineyard", "plant_nursery"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.farmland
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-residential",
    sourceLayer: "landuse",
    classification: "positive-filter",
    hidden: true,
    classValues: Object.freeze(["residential", "suburb", "quarter", "neighbourhood"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.residential
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-commercial",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze(["commercial", "retail"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.commercial
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-industrial",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze(["industrial", "garages", "railway", "military", "dam"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.industrial
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-civic",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze([
      "bus_station",
      "university",
      "kindergarten",
      "college",
      "library",
      "hospital",
      "school"
    ]),
    color: POSTER_BACKGROUND_MAP_PALETTE.civic
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-recreation",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze([
      "stadium",
      "playground",
      "theme_park",
      "zoo",
      "pitch",
      "track",
      "cemetery"
    ]),
    color: POSTER_BACKGROUND_MAP_PALETTE.recreation
  }),
  Object.freeze({
    supplementalLayerId: "poster-landuse-quarry",
    sourceLayer: "landuse",
    classification: "positive-filter",
    classValues: Object.freeze(["quarry"]),
    color: POSTER_BACKGROUND_MAP_PALETTE.rock
  }),
  Object.freeze({
    supplementalLayerId: "poster-aeroway-fill",
    sourceLayer: "aeroway",
    classification: "source-layer",
    supplementalFilter: Object.freeze([
      "match",
      Object.freeze(["geometry-type"]),
      Object.freeze(["MultiPolygon", "Polygon"]),
      true,
      false
    ]),
    color: POSTER_BACKGROUND_MAP_PALETTE.aerowayArea
  })
]);

export const POSTER_BACKGROUND_MAP_PATTERN_LAYER_IDS = new Set([
  "landcover_wetland",
  "road_area_pattern"
]);
export const POSTER_BACKGROUND_MAP_PATTERN_OVERLAY_OPACITY = 0.25;

export const SUPPLEMENTAL_POSTER_AREA_BARRIER_SOURCE_LAYERS = new Set([
  "water",
  "waterway",
  "transportation",
  "building"
]);

const OPENFREEMAP_SUPPORTED_NAME_FIELDS = Object.freeze([
  "name_en",
  "name:en",
  "name",
  "name:latin"
]);

const OPENFREEMAP_HAS_SUPPORTED_NAME_FILTER = Object.freeze([
  "any",
  ...OPENFREEMAP_SUPPORTED_NAME_FIELDS.map((nameField) => ["has", nameField])
]);

export const OPENFREEMAP_NAME_TEXT_FIELD = Object.freeze([
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
  ["coalesce", ...OPENFREEMAP_SUPPORTED_NAME_FIELDS.map((nameField) => ["get", nameField])]
]);

export const SUPPLEMENTAL_POSTER_LABEL_PAINT = Object.freeze({
  "text-color": POSTER_BACKGROUND_MAP_PALETTE.label,
  "text-halo-color": POSTER_BACKGROUND_MAP_PALETTE.labelHalo,
  "text-halo-width": 1
});

const SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT = Object.freeze({
  "text-color": POSTER_BACKGROUND_MAP_PALETTE.waterLabel,
  "text-halo-color": POSTER_BACKGROUND_MAP_PALETTE.labelHalo,
  "text-halo-width": 1
});

const OPENFREEMAP_LINE_NAME_FILTER = Object.freeze([
  "all",
  ["has", "name"],
  ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]
]);

const OPENFREEMAP_POINT_NAME_FILTER = Object.freeze([
  "all",
  ["has", "name"],
  ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false]
]);

const OPENFREEMAP_LIGHTHOUSE_TERMS = Object.freeze(["lighthouse", "light house", "\u706f\u53f0"]);
const OPENFREEMAP_LIGHTHOUSE_NAME_FILTER = Object.freeze([
  "any",
  ...OPENFREEMAP_SUPPORTED_NAME_FIELDS.map((nameField) =>
    createOpenFreeMapLighthouseNameFilter(nameField)
  )
]);

/**
 * @param {string} nameField
 */
function createOpenFreeMapLighthouseNameFilter(nameField) {
  return [
    "let",
    "normalizedName",
    ["downcase", ["coalesce", ["get", nameField], ""]],
    [
      "any",
      ...OPENFREEMAP_LIGHTHOUSE_TERMS.map((term) => [
        "!=",
        ["index-of", term, ["var", "normalizedName"]],
        -1
      ]),
      ["==", ["var", "normalizedName"], "light"],
      ["==", ["slice", ["var", "normalizedName"], -6], " light"]
    ]
  ];
}

export const SUPPLEMENTAL_POSTER_LABEL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "poster-park-label",
    sourceLayer: "park",
    minzoom: 10,
    textSize: 11
  }),
  Object.freeze({
    id: "poster-mountain-peak-label",
    sourceLayer: "mountain_peak",
    minzoom: 9,
    textSize: 10
  }),
  Object.freeze({
    id: "poster-waterway-label",
    sourceLayer: "waterway",
    minzoom: 9,
    maxzoom: 14,
    textSize: ["interpolate", ["linear"], ["zoom"], 9, 8, 12, 9.5, 13, 10],
    filter: OPENFREEMAP_LINE_NAME_FILTER,
    paint: SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 60
    }
  }),
  Object.freeze({
    id: "poster-water-name-line-label",
    sourceLayer: "water_name",
    minzoom: 7,
    maxzoom: 14,
    textSize: ["interpolate", ["linear"], ["zoom"], 7, 9, 10, 10, 13, 11],
    filter: OPENFREEMAP_LINE_NAME_FILTER,
    paint: SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 180
    }
  }),
  Object.freeze({
    id: "poster-water-name-point-label",
    sourceLayer: "water_name",
    minzoom: 7,
    maxzoom: 14,
    textSize: ["interpolate", ["linear"], ["zoom"], 7, 9, 10, 10, 13, 11],
    filter: OPENFREEMAP_POINT_NAME_FILTER,
    paint: SUPPLEMENTAL_POSTER_WATER_LABEL_PAINT,
    layout: {
      "symbol-placement": "point"
    }
  }),
  Object.freeze({
    id: "poster-tourist-poi-label",
    sourceLayer: "poi",
    minzoom: 14,
    maxzoom: 15,
    textSize: 9,
    filter: [
      "all",
      ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      ["has", "name"],
      ["<", ["to-number", ["get", "rank"], 99], 10],
      [
        "any",
        ["match", ["get", "class"], ["attraction", "castle", "museum"], true, false],
        [
          "match",
          ["coalesce", ["get", "subclass"], ""],
          ["shrine", "temple", "viewpoint"],
          true,
          false
        ],
        [
          "all",
          ["==", ["get", "class"], "place_of_worship"],
          ["match", ["coalesce", ["get", "subclass"], ""], ["", "buddhist", "shinto"], true, false]
        ]
      ]
    ],
    layout: {
      "symbol-placement": "point"
    }
  }),
  Object.freeze({
    id: "poster-highway-name-motorway",
    sourceLayer: "transportation_name",
    minzoom: 10,
    textSize: 11,
    filter: [
      "all",
      ["has", "name"],
      ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      ["==", ["get", "class"], "motorway"]
    ],
    layout: {
      "symbol-placement": "line"
    }
  }),
  Object.freeze({
    id: "poster-aerialway-label",
    sourceLayer: "transportation_name",
    textSize: 10,
    filter: ["all", ["has", "name"], ["==", ["get", "class"], "aerialway"]],
    layout: {
      "symbol-placement": "line"
    }
  }),
  Object.freeze({
    id: "poster-shipway-label",
    sourceLayer: "transportation_name",
    textSize: 10,
    filter: ["all", ["has", "name"], ["==", ["get", "class"], "ferry"]],
    layout: {
      "symbol-placement": "line"
    }
  }),
  Object.freeze({
    id: "poster-lighthouse-label",
    sourceLayer: "poi",
    minzoom: 12,
    textSize: 9,
    filter: [
      "all",
      ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      OPENFREEMAP_HAS_SUPPORTED_NAME_FILTER,
      ["match", ["get", "class"], ["attraction", "museum"], true, false],
      OPENFREEMAP_LIGHTHOUSE_NAME_FILTER
    ],
    layout: {
      "symbol-placement": "point"
    }
  })
]);

export const OPENFREEMAP_ROAD_LABEL_MINZOOMS = Object.freeze({
  "highway-name-major": 10,
  "highway-name-minor": 11,
  "highway-name-path": 12
});
