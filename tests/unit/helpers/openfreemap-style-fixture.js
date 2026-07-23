import { deepFreeze } from "./fixture-utils.js";

export function createLanduseFillFixture(id, classValue) {
  return {
    id,
    type: "fill",
    source: "openmaptiles",
    "source-layer": "landuse",
    filter: ["==", ["get", "class"], classValue],
    paint: {
      "fill-color": "#ffffff"
    }
  };
}

function createLandcoverFillFixture(id, propertyName, propertyValue) {
  return {
    id,
    type: "fill",
    source: "openmaptiles",
    "source-layer": "landcover",
    filter: ["==", ["get", propertyName], propertyValue],
    paint: {
      "fill-color": "#ffffff"
    }
  };
}

export const NATIVE_LANDUSE_CLASS_FIXTURES = deepFreeze([
  ["landuse_residential", "residential"],
  ["landuse_pitch", "pitch"],
  ["landuse_track", "track"],
  ["landuse_cemetery", "cemetery"],
  ["landuse_hospital", "hospital"],
  ["landuse_school", "school"],
  ["missing-landuse-suburb", "suburb"],
  ["missing-landuse-retail", "retail"],
  ["missing-landuse-military", "military"],
  ["missing-landuse-bus-station", "bus_station"],
  ["missing-landuse-zoo", "zoo"],
  ["missing-landuse-quarry", "quarry"]
]);

export const EXPECTED_LANDUSE_AREA_GROUPS = deepFreeze([
  {
    id: "poster-landuse-commercial",
    classes: ["commercial", "retail"],
    color: "#ddcecc"
  },
  {
    id: "poster-landuse-industrial",
    classes: ["industrial", "garages", "railway", "military", "dam"],
    color: "#F4E2DC"
  },
  {
    id: "poster-landuse-civic",
    classes: [
      "bus_station",
      "university",
      "kindergarten",
      "college",
      "library",
      "hospital",
      "school"
    ],
    color: "#e4dec7"
  },
  {
    id: "poster-landuse-recreation",
    classes: ["stadium", "playground", "theme_park", "zoo", "pitch", "track", "cemetery"],
    color: "#d8dfce"
  },
  {
    id: "poster-landuse-quarry",
    classes: ["quarry"],
    color: "#EEE5DC"
  }
]);

export const OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT = deepFreeze([
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
  ["coalesce", ["get", "name_en"], ["get", "name:en"], ["get", "name"], ["get", "name:latin"]]
]);

export const POSTER_LABEL_PAINT_CONTRACT = deepFreeze({
  "text-color": "#5f6c61",
  "text-halo-color": "#fbfaf3",
  "text-halo-width": 1
});

export const POSTER_WATER_LABEL_PAINT_CONTRACT = deepFreeze({
  "text-color": "#416b73",
  "text-halo-color": "#fbfaf3",
  "text-halo-width": 1
});

export const POSTER_TRAIL_LABEL_PAINT_CONTRACT = deepFreeze({
  "text-color": "#8f8b63",
  "text-halo-color": "#fbfaf3",
  "text-halo-width": 1
});

const openFreeMapStyle = {
  version: 8,
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet"
    }
  },
  layers: [
    {
      id: "highway-shield",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      filter: [
        "all",
        ["<=", ["get", "ref_length"], 6],
        [">=", ["get", "rank"], 7],
        ["<", ["get", "rank"], 20],
        ["match", ["get", "network"], ["us-highway"], true, false]
      ],
      layout: {
        "icon-image": ["concat", "road_", ["get", "ref_length"]]
      }
    },
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#dbeafe"
      }
    },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: {
        "fill-color": "#6aa84f",
        "fill-outline-color": "#38761d"
      }
    },
    ...NATIVE_LANDUSE_CLASS_FIXTURES.map(([id, classValue]) =>
      createLanduseFillFixture(id, classValue)
    ),
    createLanduseFillFixture("unknown-landuse-class", "allotments"),
    {
      id: "mixed-landuse-any",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: [
        "any",
        ["==", ["get", "class"], "residential"],
        ["==", ["get", "class"], "commercial"]
      ],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "mixed-landuse-match",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["industrial", "school"], true, false],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "negative-landuse-class",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["!=", ["get", "class"], "commercial"],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "landcover-residential-decoy",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "residential"],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "aeroway_fill",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 11,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      paint: {
        "fill-color": "rgba(229, 228, 224, 1)",
        "fill-opacity": 0.7
      }
    },
    {
      id: "aeroway_gate",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "aeroway",
      filter: ["==", ["get", "class"], "gate"],
      layout: {
        "icon-image": "airport_gate"
      },
      paint: {
        "icon-color": "#76543f"
      }
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: {
        "fill-color": "#60a5fa"
      }
    },
    {
      id: "waterway_river",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": "#93c5fd"
      }
    },
    {
      id: "waterway_other",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": "#bfdbfe"
      }
    },
    {
      id: "oneway-arrow",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation",
      layout: {
        "symbol-placement": "line",
        "icon-image": "oneway"
      }
    },
    {
      id: "landcover_wetland",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      minzoom: 12,
      maxzoom: 18,
      filter: ["==", ["get", "class"], "wetland"],
      layout: {
        visibility: "visible"
      },
      metadata: {
        fixture: "live-wetland"
      },
      paint: {
        "fill-antialias": true,
        "fill-opacity": 0.8,
        "fill-pattern": "wetland_bg_11",
        "fill-translate-anchor": "map"
      }
    },
    {
      id: "road_area_pattern",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 13,
      maxzoom: 19,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      layout: {
        visibility: "visible"
      },
      metadata: {
        fixture: "live-pedestrian"
      },
      paint: {
        "fill-pattern": "pedestrian_polygon"
      }
    },
    {
      id: "landcover_scrub_pattern",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: {
        "fill-pattern": "scrub_pattern",
        "fill-outline-color": "#123456"
      }
    },
    createLandcoverFillFixture("landcover", "class", "ice"),
    createLandcoverFillFixture("landcover-glacier", "subclass", "glacier"),
    createLandcoverFillFixture("landcover-ice-shelf", "subclass", "ice_shelf"),
    createLandcoverFillFixture("landcover-glacier-class-decoy", "class", "glacier"),
    createLandcoverFillFixture("landcover-ice-subclass-decoy", "subclass", "ice"),
    {
      id: "natural-area-a",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      minzoom: 9,
      maxzoom: 15,
      filter: [
        "all",
        ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
        ["==", ["get", "class"], "sand"]
      ],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "natural-area-b",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["match", ["get", "subclass"], ["bare_rock", "scree"], true, false],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "natural-area-c",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["match", ["get", "subclass"], ["beach", "dune"], true, false],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "agricultural-landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: [
        "all",
        ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
        ["==", ["get", "class"], "farmland"],
        ["match", ["get", "subclass"], ["orchard", "vineyard"], true, false]
      ],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "natural-area-mixed-any",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["any", ["==", ["get", "class"], "sand"], ["==", ["get", "class"], "grass"]],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "natural-area-mixed-match",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], "sand", true, "grass", true, false],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "landcover-sand-negative",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: [
        "all",
        ["!=", ["get", "class"], "ice"],
        ["match", ["get", "subclass"], ["sand", "bare_rock"], false, true]
      ],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "park-surface-decoy",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      filter: ["==", ["get", "class"], "sand"],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "agricultural-landuse-decoy",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["all", ["==", ["get", "class"], "farmland"], ["==", ["get", "subclass"], "orchard"]],
      paint: {
        "fill-color": "#ffffff"
      }
    },
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: {
        "line-color": "#ffffff"
      }
    },
    {
      id: "mountain-path",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: {
        "line-color": "#ffffff"
      }
    },
    {
      id: "park_outline",
      type: "line",
      source: "openmaptiles",
      "source-layer": "park",
      paint: {
        "line-color": "#38761d",
        "line-dasharray": [1, 1.5]
      }
    },
    {
      id: "aeroway-runway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "aeroway",
      paint: {
        "line-color": "#f2b8a0"
      }
    },
    {
      id: "aeroway-taxiway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "aeroway",
      paint: {
        "line-color": "#f2b8a0"
      }
    },
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      maxzoom: 14,
      paint: {
        "fill-color": "#cbd5e1"
      }
    },
    {
      id: "building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#cbd5e1"
      }
    },
    {
      id: "waterway_line_label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "waterway",
      minzoom: 10,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": 10
      },
      paint: {
        "text-color": "#6b7280",
        "text-halo-color": "#ffffff",
        "text-halo-width": 0.5
      }
    },
    {
      id: "water_name_point_label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      layout: {
        "symbol-placement": "point",
        "text-field": ["get", "name"],
        "text-size": 11
      },
      paint: {
        "text-color": "#6b7280",
        "text-halo-color": "#ffffff"
      }
    },
    {
      id: "water_name_line_label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": 11
      },
      paint: {
        "text-color": "#6b7280",
        "text-halo-color": "#ffffff"
      }
    },
    {
      id: "place-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      layout: {
        "text-field": ["get", "name"]
      },
      paint: {
        "text-color": "#1f2937",
        "text-halo-color": "#ffffff"
      }
    },
    {
      id: "highway-name-major",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 12,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": 12
      },
      paint: {
        "text-color": "#374151",
        "text-halo-color": "#ffffff"
      }
    },
    {
      id: "highway-name-minor",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": 11
      },
      paint: {
        "text-color": "#4b5563",
        "text-halo-color": "#ffffff"
      }
    },
    {
      id: "highway-name-path",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 15,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": 10
      },
      paint: {
        "text-color": "#6b7280",
        "text-halo-color": "#ffffff"
      }
    }
  ]
};

export function cloneOpenFreeMapStyle() {
  return JSON.parse(JSON.stringify(openFreeMapStyle));
}

export function createOpenFreeMapStyleResponse() {
  return new Response(JSON.stringify(cloneOpenFreeMapStyle()), {
    headers: { "Content-Type": "application/json" }
  });
}
