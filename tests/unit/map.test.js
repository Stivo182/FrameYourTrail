import { featureFilter, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { haversineMeters } from "../../src/core/geo.js";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import {
  DEFAULT_MAP_STYLE_ID,
  MAP_STYLE_OPTIONS,
  getMapTextLabelBoundaryIndex,
  getMapStyleDefinition,
  loadMapStyle,
  normalizeMapStyleId
} from "../../src/render/map-styles.js";
import {
  ROUTE_LINE_COLOR,
  createEndpointGeoJson,
  createRouteMapRenderer,
  createRouteSpeedGradient,
  createTrackGeoJson,
  initRouteMap,
  renderStaticRouteFallback
} from "../../src/render/map.js";

const maplibreMock = vi.hoisted(() => {
  /** @type {any[]} */
  const instances = [];
  /** @type {any[]} */
  const pendingEvents = [];
  let autoResolveEvents = true;
  let initialLoaded = false;
  let fitBoundsZoom = 0;
  let addSourceFailureId;
  let addLayerFailureId;
  /** @type {(bounds: any, options: any) => any} */
  let cameraForBoundsResolver = () => undefined;
  const Map = vi.fn((options) => {
    let currentZoom = fitBoundsZoom;
    const instance = {
      options,
      /** @type {((event: { error: Error }) => void)[]} */
      errorListeners: [],
      sources: new globalThis.Map(),
      /** @type {any[]} */
      layers: [],
      /** @type {any[]} */
      styleLayers: [...options.style.layers],
      on: vi.fn((event, handler) => {
        if (event === "error") {
          instance.errorListeners.push(handler);
        }

        return instance;
      }),
      once: vi.fn((event, handler) => {
        if (event === "load" && initialLoaded) {
          return instance;
        }

        if (event === "load" || event === "idle") {
          if (autoResolveEvents) {
            queueMicrotask(() => handler({}));
          } else {
            pendingEvents.push({ event, handler, instance });
          }
        }

        return instance;
      }),
      addSource: vi.fn((id, source) => {
        if (id === addSourceFailureId) {
          throw new Error(`Failed to add source: ${id}`);
        }

        instance.sources.set(id, source);
      }),
      addLayer: vi.fn((layer, beforeId) => {
        if (layer.id === addLayerFailureId) {
          throw new Error(`Failed to add layer: ${layer.id}`);
        }

        instance.layers.push(layer);

        if (beforeId === undefined) {
          instance.styleLayers.push(layer);
          return;
        }

        const insertionIndex = instance.styleLayers.findIndex(
          (styleLayer) => styleLayer.id === beforeId
        );

        if (insertionIndex === -1) {
          throw new Error(`Unknown beforeId: ${beforeId}`);
        }

        instance.styleLayers.splice(insertionIndex, 0, layer);
      }),
      removeSource: vi.fn((id) => {
        instance.sources.delete(id);
      }),
      removeLayer: vi.fn((id) => {
        const layerIndex = instance.layers.findIndex((layer) => layer.id === id);
        const styleLayerIndex = instance.styleLayers.findIndex((layer) => layer.id === id);

        if (layerIndex !== -1) {
          instance.layers.splice(layerIndex, 1);
        }

        if (styleLayerIndex !== -1) {
          instance.styleLayers.splice(styleLayerIndex, 1);
        }
      }),
      fitBounds: vi.fn(() => {
        currentZoom = fitBoundsZoom;
      }),
      getZoom: vi.fn(() => currentZoom),
      cameraForBounds: vi.fn((bounds, options) => cameraForBoundsResolver(bounds, options)),
      jumpTo: vi.fn((camera) => {
        if (Number.isFinite(camera?.zoom)) {
          currentZoom = camera.zoom;
        }
      }),
      remove: vi.fn(),
      loaded: vi.fn(() => initialLoaded),
      fireError: vi.fn((error) => {
        if (instance.errorListeners.length === 0) {
          console.error(error);
          return;
        }

        for (const listener of instance.errorListeners) {
          listener({ error });
        }
      })
    };

    instances.push(instance);
    return instance;
  });

  return {
    instances,
    pendingEvents,
    Map,
    setAutoResolveEvents(value) {
      autoResolveEvents = value;
    },
    setInitialLoaded(value) {
      initialLoaded = value;
    },
    setFitBoundsZoom(value) {
      fitBoundsZoom = value;
    },
    setAddSourceFailureId(value) {
      addSourceFailureId = value;
    },
    setAddLayerFailureId(value) {
      addLayerFailureId = value;
    },
    setCameraForBoundsResolver(value) {
      cameraForBoundsResolver = value;
    }
  };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: maplibreMock.Map
  }
}));

const points = [
  { latitude: 43.1, longitude: 42.1, elevation: 620 },
  { latitude: 43.2, longitude: 42.2, elevation: 740 }
];

function readOpenFreeMapLibertyContractFixture() {
  return JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../fixtures/openfreemap-liberty-contract.json"),
      "utf8"
    )
  );
}

function readOpenFreeMapProviderFeatureContractFixture() {
  return JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, "../fixtures/openfreemap-provider-feature-contract.json"),
      "utf8"
    )
  );
}

const speedSeries = [
  {
    index: 1,
    startDistanceFromStartMeters: 0,
    distanceFromStartMeters: 100,
    distanceMeters: 100,
    durationSeconds: 72,
    rawSpeedKmh: 5,
    speedKmh: 5
  },
  {
    index: 2,
    startDistanceFromStartMeters: 100,
    distanceFromStartMeters: 200,
    distanceMeters: 100,
    durationSeconds: 36,
    rawSpeedKmh: 10,
    speedKmh: 10
  },
  {
    index: 3,
    startDistanceFromStartMeters: 200,
    distanceFromStartMeters: 300,
    distanceMeters: 100,
    durationSeconds: 24,
    rawSpeedKmh: 15,
    speedKmh: 15
  }
];

const segmentedPoints = [
  { latitude: 43.1, longitude: 42.1, elevation: 620 },
  { latitude: 43.101, longitude: 42.102, elevation: 640 },
  { latitude: 43.103, longitude: 42.105, elevation: 700 },
  { latitude: 43.105, longitude: 42.108, elevation: 690 }
];

function createLanduseFillFixture(id, classValue) {
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

const NATIVE_LANDUSE_CLASS_FIXTURES = [
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
];

const EXPECTED_LANDUSE_AREA_GROUPS = [
  {
    id: "poster-landuse-residential",
    classes: ["residential", "suburb", "quarter", "neighbourhood"],
    color: "#e2ddd5"
  },
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
];

const OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT = [
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]],
  ["coalesce", ["get", "name_en"], ["get", "name:en"], ["get", "name"], ["get", "name:latin"]]
];

const POSTER_LABEL_PAINT_CONTRACT = {
  "text-color": "#5f6c61",
  "text-halo-color": "#fbfaf3",
  "text-halo-width": 1
};

const POSTER_WATER_LABEL_PAINT_CONTRACT = {
  "text-color": "#416b73",
  "text-halo-color": "#fbfaf3",
  "text-halo-width": 1
};

const POSTER_TRAIL_LABEL_PAINT_CONTRACT = {
  "text-color": "#8f8b63",
  "text-halo-color": "#fbfaf3",
  "text-halo-width": 1
};

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

function getRouteSegmentDistances(routePoints) {
  const distances = [];

  for (let index = 1; index < routePoints.length; index += 1) {
    distances.push(haversineMeters(routePoints[index - 1], routePoints[index]));
  }

  return distances;
}

function getRouteDistance(routePoints) {
  return getRouteSegmentDistances(routePoints).reduce((total, distance) => total + distance, 0);
}

function createSpeedSeriesForDistances(distances, speedsKmh) {
  let distanceFromStartMeters = 0;

  return distances.map((distanceMeters, index) => {
    const startDistanceFromStartMeters = distanceFromStartMeters;
    distanceFromStartMeters += distanceMeters;
    const speedKmh = speedsKmh[index] ?? speedsKmh.at(-1) ?? 0;

    return {
      index: index + 1,
      startDistanceFromStartMeters,
      distanceFromStartMeters,
      distanceMeters,
      durationSeconds: (distanceMeters / Math.max(speedKmh, 0.1)) * 3.6,
      rawSpeedKmh: speedKmh,
      speedKmh
    };
  });
}

function cloneOpenFreeMapStyle() {
  return JSON.parse(JSON.stringify(openFreeMapStyle));
}

function createOpenFreeMapStyleResponse() {
  return new Response(JSON.stringify(cloneOpenFreeMapStyle()), {
    headers: { "Content-Type": "application/json" }
  });
}

describe("map helpers", () => {
  beforeEach(() => {
    maplibreMock.instances.length = 0;
    maplibreMock.pendingEvents.length = 0;
    maplibreMock.setAutoResolveEvents(true);
    maplibreMock.setInitialLoaded(false);
    maplibreMock.setFitBoundsZoom(13);
    maplibreMock.setAddSourceFailureId(undefined);
    maplibreMock.setAddLayerFailureId(undefined);
    maplibreMock.setCameraForBoundsResolver(() => undefined);
    maplibreMock.Map.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createOpenFreeMapStyleResponse())
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes a fixed no-key map style catalog", () => {
    expect(DEFAULT_MAP_STYLE_ID).toBe("openfreemap_poster");
    expect(MAP_STYLE_OPTIONS.map((style) => style.id)).toEqual([
      "openfreemap_poster",
      "osm_standard",
      "cyclosm"
    ]);
    expect(MAP_STYLE_OPTIONS.some((style) => /maptiler/i.test(style.id))).toBe(false);
    expect(getMapStyleDefinition("cyclosm")).toMatchObject({ id: "cyclosm", kind: "raster" });
    expect(normalizeMapStyleId("cyclosm")).toBe("cyclosm");
    expect(normalizeMapStyleId("missing")).toBe(DEFAULT_MAP_STYLE_ID);
  });

  it("exports one fail-safe geometry-to-text-label boundary", () => {
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "early-arrow", type: "symbol" },
        { id: "road", type: "line" },
        { id: "building", type: "fill" },
        { id: "late-arrow", type: "symbol", layout: { "icon-image": "oneway" } },
        { id: "place-label", type: "symbol", layout: { "text-field": ["get", "name"] } },
        { id: "road-label", type: "symbol", layout: { "text-field": ["get", "name"] } }
      ])
    ).toBe(4);
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "place-label", type: "symbol", layout: { "text-field": ["get", "name"] } },
        { id: "road-label", type: "symbol", layout: { "text-field": ["get", "name"] } }
      ])
    ).toBe(0);
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "early-arrow", type: "symbol" },
        { id: "early-shield", type: "symbol" }
      ])
    ).toBe(2);
    expect(
      getMapTextLabelBoundaryIndex([
        { id: "background", type: "background" },
        { id: "road", type: "line" }
      ])
    ).toBe(2);
    expect(getMapTextLabelBoundaryIndex([])).toBe(0);
  });

  it("generates cloned raster MapLibre styles with attribution", async () => {
    const firstStyle = await loadMapStyle("osm_standard");
    const secondStyle = await loadMapStyle("osm_standard");

    expect(firstStyle).not.toBe(secondStyle);
    expect(firstStyle.sources["osm-standard-raster"]).toMatchObject({
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: expect.stringContaining("OpenStreetMap")
    });
    expect(firstStyle.layers).toEqual([
      {
        id: "osm-standard-raster",
        type: "raster",
        source: "osm-standard-raster"
      }
    ]);
    firstStyle.layers.push({ id: "mutation", type: "background" });
    expect(secondStyle.layers).toHaveLength(1);
  });

  it("times out OpenFreeMap style requests when the fetcher stalls", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise(() => {}));

    try {
      const stylePromise = loadMapStyle("openfreemap_poster", {
        timeoutMs: 5,
        setTimeout: window.setTimeout.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        fetcher
      });
      const assertion = expect(stylePromise).rejects.toThrow(/timeout/i);

      await vi.advanceTimersByTimeAsync(5);

      await assertion;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves the exact captured Liberty contract across original and renamed sources", async () => {
    const fixture = readOpenFreeMapLibertyContractFixture();
    const retainedLayerIds = fixture.layers.map((layer) => layer.id);
    const expectedGeneratedVectorLayerIds = new Set([
      "poster-landuse-residential",
      "poster-landuse-commercial",
      "poster-landuse-industrial",
      "poster-landuse-civic",
      "poster-landuse-recreation",
      "poster-landuse-quarry",
      "poster-landcover-sand",
      "poster-landcover-rock",
      "poster-landcover-farmland",
      "poster-trail-line",
      "poster-aerialway-line",
      "poster-shipway-line",
      "poster-building-outline",
      "poster-park-label",
      "poster-mountain-peak-label",
      "poster-waterway-label",
      "poster-water-name-line-label",
      "poster-water-name-point-label",
      "poster-tourist-poi-label",
      "poster-highway-name-motorway",
      "poster-aerialway-label",
      "poster-shipway-label",
      "poster-lighthouse-label"
    ]);
    const orderingAnchorIds = [
      "road_one_way_arrow",
      "bridge_path_pedestrian",
      "poster-trail-line",
      "poster-shipway-line",
      "building",
      "building-3d",
      "poster-building-outline",
      "boundary_2"
    ];

    expect(validateStyleMin(fixture)).toEqual([]);
    expect(fixture.metadata.capturedFrom).toEqual(expect.any(String));
    expect(new URL(fixture.metadata.capturedFrom).protocol).toBe("https:");
    expect(fixture.metadata.capturedOn).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(fixture.metadata.capturedOn))).toBe(false);
    expect(fixture.metadata.curatedScope).toEqual(expect.any(String));
    expect(fixture.metadata.curatedScope.trim()).not.toBe("");
    expect(retainedLayerIds.length).toBeGreaterThan(0);
    expect(retainedLayerIds.every((layerId) => typeof layerId === "string" && layerId !== "")).toBe(
      true
    );
    expect(new Set(retainedLayerIds).size).toBe(retainedLayerIds.length);

    const renamedStyle = JSON.parse(JSON.stringify(fixture));
    renamedStyle.sources["contract-liberty-vector"] = renamedStyle.sources.openmaptiles;
    delete renamedStyle.sources.openmaptiles;
    renamedStyle.layers = renamedStyle.layers.map((layer) =>
      layer.source === "openmaptiles" ? { ...layer, source: "contract-liberty-vector" } : layer
    );

    expect(validateStyleMin(renamedStyle)).toEqual([]);

    const originalPosterStyle = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(fixture), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const renamedPosterStyle = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(renamedStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const retainedLayerIdSet = new Set(retainedLayerIds);
    const generatedVectorLayerIdsByStyle = [];

    for (const { style, expectedVectorSource } of [
      { style: originalPosterStyle, expectedVectorSource: "openmaptiles" },
      { style: renamedPosterStyle, expectedVectorSource: "contract-liberty-vector" }
    ]) {
      const finalLayerIds = style.layers.map((layer) => layer.id);
      const finalLayerIndex = (id) => finalLayerIds.indexOf(id);
      const generatedVectorLayers = style.layers.filter(
        (layer) =>
          layer.id.startsWith("poster-") &&
          "source" in layer &&
          typeof layer["source-layer"] === "string"
      );
      const generatedVectorLayerIds = generatedVectorLayers.map((layer) => layer.id);
      const nativeTextLabelIds = fixture.layers
        .filter(
          (styleLayer) =>
            styleLayer.type === "symbol" &&
            styleLayer.layout &&
            Object.hasOwn(styleLayer.layout, "text-field")
        )
        .map((styleLayer) => styleLayer.id);
      const supplementalTextLabelIds = style.layers
        .filter(
          (styleLayer) =>
            styleLayer.id.startsWith("poster-") &&
            styleLayer.type === "symbol" &&
            styleLayer.layout &&
            Object.hasOwn(styleLayer.layout, "text-field")
        )
        .map((styleLayer) => styleLayer.id);

      expect(validateStyleMin(style)).toEqual([]);
      expect(generatedVectorLayerIds.length).toBeGreaterThan(0);
      expect(new Set(generatedVectorLayerIds)).toEqual(expectedGeneratedVectorLayerIds);
      expect(
        new Set(generatedVectorLayers.flatMap((layer) => ("source" in layer ? [layer.source] : [])))
      ).toEqual(new Set([expectedVectorSource]));
      expect(
        style.layers.filter((layer) => retainedLayerIdSet.has(layer.id)).map((layer) => layer.id)
      ).toEqual(retainedLayerIds);
      expect(finalLayerIds).toEqual(expect.arrayContaining(orderingAnchorIds));
      expect(nativeTextLabelIds.length).toBeGreaterThan(0);
      expect(supplementalTextLabelIds.length).toBeGreaterThan(0);

      expect(finalLayerIndex("road_one_way_arrow")).toBeLessThan(
        finalLayerIndex("bridge_path_pedestrian")
      );
      expect(finalLayerIndex("bridge_path_pedestrian")).toBeLessThan(
        finalLayerIndex("poster-trail-line")
      );
      expect(finalLayerIndex("poster-shipway-line")).toBeLessThan(finalLayerIndex("building"));
      expect(finalLayerIndex("poster-shipway-line")).toBeLessThan(finalLayerIndex("boundary_2"));
      expect(finalLayerIndex("poster-building-outline")).toBeGreaterThan(
        finalLayerIndex("building-3d")
      );
      expect(finalLayerIndex("poster-building-outline")).toBeLessThan(
        finalLayerIndex("boundary_2")
      );
      expect(Math.max(...supplementalTextLabelIds.map(finalLayerIndex))).toBeLessThan(
        Math.min(...nativeTextLabelIds.map(finalLayerIndex))
      );

      generatedVectorLayerIdsByStyle.push(new Set(generatedVectorLayerIds));
    }

    expect(generatedVectorLayerIdsByStyle[0]).toEqual(generatedVectorLayerIdsByStyle[1]);
    expect(renamedPosterStyle.sources).not.toHaveProperty("openmaptiles");
    expect(
      renamedPosterStyle.layers.some(
        (layer) => "source" in layer && layer.source === "openmaptiles"
      )
    ).toBe(false);
  });

  it("matches captured provider features with generated supplemental filters", async () => {
    const libertyFixture = readOpenFreeMapLibertyContractFixture();
    const providerFixture = readOpenFreeMapProviderFeatureContractFixture();
    const requiredMetadataFields = ["tilesetUrlTemplate", "capturedOn", "decoder", "curatedScope"];

    for (const field of requiredMetadataFields) {
      expect(providerFixture.metadata[field], field).toEqual(expect.any(String));
      expect(providerFixture.metadata[field].trim(), field).not.toBe("");
    }

    expect(providerFixture.metadata.tilesetUrlTemplate).toContain("{z}");
    expect(providerFixture.metadata.tilesetUrlTemplate).toContain("{x}");
    expect(providerFixture.metadata.tilesetUrlTemplate).toContain("{y}");
    expect(providerFixture.features.length).toBeGreaterThan(0);

    const featureIds = [];
    const featureProvenance = [];

    for (const feature of providerFixture.features) {
      for (const field of ["id", "posterLayerId", "sourceLayer", "geometryType"]) {
        expect(feature[field], `${feature.id}.${field}`).toEqual(expect.any(String));
        expect(feature[field].trim(), `${feature.id}.${field}`).not.toBe("");
      }

      expect(Number.isInteger(feature.tile.z)).toBe(true);
      expect(Number.isInteger(feature.tile.x)).toBe(true);
      expect(Number.isInteger(feature.tile.y)).toBe(true);
      expect(feature.featureIndex).toEqual(expect.any(String));
      expect(feature.featureIndex).not.toBe("");
      expect(feature.featureId).toEqual(expect.any(String));
      expect(feature.featureId).not.toBe("");
      expect(feature.tile.url).toBe(
        providerFixture.metadata.tilesetUrlTemplate
          .replace("{z}", String(feature.tile.z))
          .replace("{x}", String(feature.tile.x))
          .replace("{y}", String(feature.tile.y))
      );

      featureIds.push(feature.id);
      featureProvenance.push(
        [
          feature.tile.z,
          feature.tile.x,
          feature.tile.y,
          feature.sourceLayer,
          feature.featureIndex,
          feature.featureId
        ].join("/")
      );
    }

    expect(new Set(featureIds).size).toBe(featureIds.length);
    expect(new Set(featureProvenance).size).toBe(featureProvenance.length);

    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(libertyFixture), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });

    for (const feature of providerFixture.features) {
      const posterLayer = style.layers.find((layer) => layer.id === feature.posterLayerId);

      expect(posterLayer).toBeDefined();
      if (!posterLayer || !("filter" in posterLayer) || posterLayer.filter === undefined) {
        throw new Error(`Expected filtered poster layer for ${feature.id}`);
      }

      expect(posterLayer["source-layer"]).toBe(feature.sourceLayer);
      expect(["LineString", "Point"]).toContain(feature.geometryType);

      const compiledFilter = featureFilter(posterLayer.filter).filter;

      expect(
        compiledFilter(
          { zoom: feature.tile.z },
          {
            type: feature.geometryType,
            properties: feature.properties
          }
        )
      ).toBe(true);
    }
  });

  it("fails closed for ambiguous supplemental source layers while preserving exact owners", async () => {
    const ambiguousStyle = cloneOpenFreeMapStyle();
    ambiguousStyle.sources.posterPlaces = {
      type: "vector",
      url: "https://example.test/places.json"
    };
    ambiguousStyle.layers.splice(
      2,
      0,
      {
        id: "mountain-peak-owner",
        type: "circle",
        source: "posterPlaces",
        "source-layer": "mountain_peak"
      },
      {
        id: "alternate-water-name-owner",
        type: "circle",
        source: "posterPlaces",
        "source-layer": "water_name"
      }
    );

    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(ambiguousStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerSource = (id) => {
      const styleLayer = layer(id);

      return styleLayer && "source" in styleLayer ? styleLayer.source : undefined;
    };

    expect(layerSource("poster-park-label")).toBe("openmaptiles");
    expect(layerSource("poster-mountain-peak-label")).toBe("posterPlaces");
    expect(layerSource("poster-trail-line")).toBe("openmaptiles");
    expect(layerSource("poster-building-outline")).toBe("openmaptiles");
    expect(layer("poster-water-name-line-label")).toBeUndefined();
    expect(layer("poster-water-name-point-label")).toBeUndefined();
    expect(layer("poster-tourist-poi-label")).toBeUndefined();
    expect(layer("poster-lighthouse-label")).toBeUndefined();
  });

  it("adds supplemental named park and mountain peak labels to the poster OpenFreeMap style", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const parkLabel = layer("poster-park-label");
    const mountainPeakLabel = layer("poster-mountain-peak-label");

    expect(parkLabel).toMatchObject({
      id: "poster-park-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "park",
      minzoom: 10,
      filter: ["has", "name"],
      layout: expect.objectContaining({
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-size": 11
      }),
      paint: POSTER_LABEL_PAINT_CONTRACT
    });
    expect(mountainPeakLabel).toMatchObject({
      id: "poster-mountain-peak-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "mountain_peak",
      minzoom: 9,
      filter: ["has", "name"],
      layout: expect.objectContaining({
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-size": 10
      }),
      paint: POSTER_LABEL_PAINT_CONTRACT
    });
    expect(layer("poster-landcover-label")).toBeUndefined();
    expect(layer("poster-landuse-label")).toBeUndefined();
  });

  it("adds compact medium-zoom water labels to the poster OpenFreeMap style", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);

    expect(layer("poster-waterway-label")).toMatchObject({
      id: "poster-waterway-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "waterway",
      minzoom: 9,
      maxzoom: 14,
      filter: [
        "all",
        ["has", "name"],
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]
      ],
      layout: expect.objectContaining({
        "symbol-placement": "line",
        "symbol-spacing": 60,
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 8, 12, 9.5, 13, 10]
      }),
      paint: POSTER_WATER_LABEL_PAINT_CONTRACT
    });
    expect(layer("poster-water-name-line-label")).toMatchObject({
      id: "poster-water-name-line-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      minzoom: 7,
      maxzoom: 14,
      filter: [
        "all",
        ["has", "name"],
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]
      ],
      layout: expect.objectContaining({
        "symbol-placement": "line",
        "symbol-spacing": 180,
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 9, 10, 10, 13, 11]
      }),
      paint: POSTER_WATER_LABEL_PAINT_CONTRACT
    });
    expect(layer("poster-water-name-point-label")).toMatchObject({
      id: "poster-water-name-point-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "water_name",
      minzoom: 7,
      maxzoom: 14,
      filter: [
        "all",
        ["has", "name"],
        ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false]
      ],
      layout: expect.objectContaining({
        "symbol-placement": "point",
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 9, 10, 10, 13, 11]
      }),
      paint: POSTER_WATER_LABEL_PAINT_CONTRACT
    });
  });

  it("inserts supplemental labels after geometry and before every native text label", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);
    const finalGeometryLayerIndex = layerIndex("poster-building-outline");
    const nativeTextLabelIds = openFreeMapStyle.layers
      .filter(
        (styleLayer) =>
          styleLayer.type === "symbol" &&
          styleLayer.layout &&
          Object.hasOwn(styleLayer.layout, "text-field")
      )
      .map((styleLayer) => styleLayer.id);
    const supplementalLabelIds = style.layers
      .filter((styleLayer) => styleLayer.type === "symbol" && styleLayer.id.startsWith("poster-"))
      .map((styleLayer) => styleLayer.id);

    expect(supplementalLabelIds).toEqual([
      "poster-park-label",
      "poster-mountain-peak-label",
      "poster-waterway-label",
      "poster-water-name-line-label",
      "poster-water-name-point-label",
      "poster-tourist-poi-label",
      "poster-highway-name-motorway",
      "poster-aerialway-label",
      "poster-shipway-label",
      "poster-lighthouse-label"
    ]);
    expect(nativeTextLabelIds).toEqual([
      "waterway_line_label",
      "water_name_point_label",
      "water_name_line_label",
      "place-label",
      "highway-name-major",
      "highway-name-minor",
      "highway-name-path"
    ]);
    expect(layerIndex("oneway-arrow")).toBeLessThan(finalGeometryLayerIndex);

    for (const supplementalLabelId of supplementalLabelIds) {
      expect(layerIndex(supplementalLabelId)).toBeGreaterThan(finalGeometryLayerIndex);

      for (const nativeTextLabelId of nativeTextLabelIds) {
        expect(layerIndex(supplementalLabelId)).toBeLessThan(layerIndex(nativeTextLabelId));
      }
    }
  });

  it("normalizes interleaved native text labels into one stable high-priority tier", async () => {
    const interleavedStyle = cloneOpenFreeMapStyle();
    const nativeTextLayers = interleavedStyle.layers.filter(
      (styleLayer) =>
        styleLayer.type === "symbol" &&
        styleLayer.layout &&
        Object.hasOwn(styleLayer.layout, "text-field")
    );
    const nonTextLayers = interleavedStyle.layers.filter(
      (styleLayer) => !nativeTextLayers.includes(styleLayer)
    );
    const onewayArrowIndex = nonTextLayers.findIndex(
      (styleLayer) => styleLayer.id === "oneway-arrow"
    );

    interleavedStyle.layers = [
      ...nonTextLayers.slice(0, onewayArrowIndex),
      nativeTextLayers[0],
      nonTextLayers[onewayArrowIndex],
      nativeTextLayers[1],
      ...nonTextLayers.slice(onewayArrowIndex + 1),
      ...nativeTextLayers.slice(2)
    ];

    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(interleavedStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const finalLayerIds = style.layers.map((styleLayer) => styleLayer.id);
    const nativeTextLabelIds = nativeTextLayers.map((styleLayer) => styleLayer.id);
    const supplementalLabelIds = style.layers
      .filter((styleLayer) => styleLayer.type === "symbol" && styleLayer.id.startsWith("poster-"))
      .map((styleLayer) => styleLayer.id);
    const finalNonSymbolIndex = style.layers.findLastIndex(
      (styleLayer) => styleLayer.type !== "symbol"
    );
    const textLabelBoundaryIndex = getMapTextLabelBoundaryIndex(style.layers);

    expect(validateStyleMin(style)).toEqual([]);
    expect(finalLayerIds.filter((id) => nativeTextLabelIds.includes(id))).toEqual(
      nativeTextLabelIds
    );
    expect(finalLayerIds.filter((id) => nonTextLayers.some((layer) => layer.id === id))).toEqual(
      nonTextLayers.map((layer) => layer.id)
    );
    expect(Math.min(...nativeTextLabelIds.map((id) => finalLayerIds.indexOf(id)))).toBeGreaterThan(
      finalNonSymbolIndex
    );
    expect(Math.max(...supplementalLabelIds.map((id) => finalLayerIds.indexOf(id)))).toBeLessThan(
      Math.min(...nativeTextLabelIds.map((id) => finalLayerIds.indexOf(id)))
    );
    expect(style.layers[textLabelBoundaryIndex]?.id).toBe(supplementalLabelIds[0]);
  });

  it("adds poster OpenFreeMap trail, aerialway, and motorway name detail without duplicating other road labels", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);

    expect(layer("poster-trail-line")).toMatchObject({
      id: "poster-trail-line",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["path", "track"], true, false],
        ["match", ["get", "brunnel"], ["bridge", "tunnel"], false, true]
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "#8f8b63",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 14, 1.1, 16, 1.6],
        "line-dasharray": [1.2, 1.1],
        "line-opacity": 0.78
      }
    });
    expect(layer("poster-aerialway-line")).toMatchObject({
      id: "poster-aerialway-line",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["==", ["get", "class"], "aerialway"]
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "#9f9a8d",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 14, 0.9, 16, 1.25],
        "line-dasharray": [0.7, 1.3],
        "line-opacity": 0.82
      }
    });
    expect(layerIndex("poster-trail-line")).toBeGreaterThan(layerIndex("aeroway-taxiway"));
    expect(layerIndex("poster-aerialway-line")).toBeGreaterThan(layerIndex("poster-trail-line"));
    expect(layerIndex("poster-aerialway-line")).toBeLessThan(layerIndex("place-label"));
    expect(layerIndex("poster-trail-line")).toBeLessThan(layerIndex("highway-name-major"));

    expect(layer("poster-aerialway-label")).toMatchObject({
      id: "poster-aerialway-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      filter: ["all", ["has", "name"], ["==", ["get", "class"], "aerialway"]],
      layout: expect.objectContaining({
        "symbol-placement": "line",
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-size": 10
      }),
      paint: POSTER_LABEL_PAINT_CONTRACT
    });

    expect(layer("poster-highway-name-motorway")).toMatchObject({
      id: "poster-highway-name-motorway",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 10,
      filter: [
        "all",
        ["has", "name"],
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["==", ["get", "class"], "motorway"]
      ],
      layout: expect.objectContaining({
        "symbol-placement": "line",
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-size": 11
      }),
      paint: POSTER_LABEL_PAINT_CONTRACT
    });

    expect(layer("highway-name-major")).toMatchObject({
      minzoom: 10,
      paint: POSTER_LABEL_PAINT_CONTRACT
    });
    expect(layer("highway-name-minor")).toMatchObject({
      minzoom: 11,
      paint: POSTER_LABEL_PAINT_CONTRACT
    });
    expect(layer("highway-name-path")).toMatchObject({
      minzoom: 12,
      paint: POSTER_TRAIL_LABEL_PAINT_CONTRACT
    });
    expect(
      style.layers
        .filter((styleLayer) => /^poster-highway-name/.test(styleLayer.id))
        .map((styleLayer) => styleLayer.id)
    ).toEqual(["poster-highway-name-motorway"]);
    expect(layer("poster-landcover-label")).toBeUndefined();
    expect(layer("poster-landuse-label")).toBeUndefined();
  });

  it("keeps supplemental trail linework off upstream bridge and tunnel features", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const trailLayer = style.layers.find((styleLayer) => styleLayer.id === "poster-trail-line");

    if (trailLayer?.type !== "line") {
      throw new Error("Expected poster trail line layer");
    }

    const compiledTrailFilter = featureFilter(trailLayer.filter).filter;
    const matchesTrailFeature = (properties) =>
      compiledTrailFilter(
        { zoom: 14 },
        {
          type: "LineString",
          properties
        }
      );

    expect(matchesTrailFeature({ class: "path" })).toBe(true);
    expect(matchesTrailFeature({ class: "track" })).toBe(true);
    expect(matchesTrailFeature({ class: "path", brunnel: "ford" })).toBe(true);
    expect(matchesTrailFeature({ class: "path", brunnel: "bridge" })).toBe(false);
    expect(matchesTrailFeature({ class: "track", brunnel: "tunnel" })).toBe(false);
  });

  it("places the building outline after later buildings when a boundary appears first", async () => {
    const invertedStyle = cloneOpenFreeMapStyle();
    invertedStyle.layers = [
      { id: "background", type: "background" },
      {
        id: "road",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation"
      },
      {
        id: "admin-boundary-early",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary"
      },
      {
        id: "building-late",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building"
      },
      {
        id: "admin-boundary-late",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary"
      },
      {
        id: "place-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        layout: { "text-field": ["get", "name"] }
      }
    ];
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(invertedStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const finalLayerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);

    expect(finalLayerIndex("admin-boundary-early")).toBeLessThan(finalLayerIndex("building-late"));
    expect(finalLayerIndex("poster-building-outline")).toBe(finalLayerIndex("building-late") + 1);
    expect(finalLayerIndex("admin-boundary-late")).toBe(
      finalLayerIndex("poster-building-outline") + 1
    );
    expect(finalLayerIndex("poster-park-label")).toBe(finalLayerIndex("admin-boundary-late") + 1);
  });

  it("uses the administrative tier as the transport ceiling without building geometry", async () => {
    const boundaryOnlyStyle = cloneOpenFreeMapStyle();
    boundaryOnlyStyle.layers = [
      { id: "background", type: "background" },
      {
        id: "road",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation"
      },
      {
        id: "admin-boundary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary"
      },
      {
        id: "place-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        layout: { "text-field": ["get", "name"] }
      }
    ];
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(boundaryOnlyStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const finalLayerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);

    expect(finalLayerIndex("poster-trail-line")).toBe(finalLayerIndex("road") + 1);
    expect(finalLayerIndex("poster-building-outline")).toBe(
      finalLayerIndex("poster-shipway-line") + 1
    );
    expect(finalLayerIndex("admin-boundary")).toBe(finalLayerIndex("poster-building-outline") + 1);
    expect(finalLayerIndex("poster-park-label")).toBe(finalLayerIndex("admin-boundary") + 1);
  });

  it("scopes poster OpenFreeMap tourist landmark labels and reuses path labels for trail names", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);

    expect(layer("poster-trail-label")).toBeUndefined();
    expect(layer("highway-name-path")).toMatchObject({
      minzoom: 12,
      paint: {
        "text-color": "#8f8b63",
        "text-halo-color": "#fbfaf3",
        "text-halo-width": 1
      }
    });
    expect(layer("poster-tourist-poi-label")).toMatchObject({
      id: "poster-tourist-poi-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom: 14,
      maxzoom: 15,
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
            [
              "match",
              ["coalesce", ["get", "subclass"], ""],
              ["", "buddhist", "shinto"],
              true,
              false
            ]
          ]
        ]
      ],
      layout: expect.objectContaining({
        "symbol-placement": "point",
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        "text-size": 9
      }),
      paint: {
        "text-color": "#5f6c61",
        "text-halo-color": "#fbfaf3",
        "text-halo-width": 1
      }
    });
  });

  it("adds poster OpenFreeMap maritime detail and matches explicit lighthouse terms", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);
    const lighthouseLabelLayer = layer("poster-lighthouse-label");

    expect(layer("poster-shipway-line")).toMatchObject({
      id: "poster-shipway-line",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["==", ["get", "class"], "ferry"]
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "#7ba8a8",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 12, 0.7, 15, 1],
        "line-dasharray": [1, 1.8],
        "line-opacity": 0.7
      }
    });
    expect(layerIndex("poster-shipway-line")).toBeGreaterThan(layerIndex("poster-aerialway-line"));
    expect(layerIndex("poster-shipway-line")).toBeLessThan(layerIndex("place-label"));

    expect(layer("poster-shipway-label")).toMatchObject({
      id: "poster-shipway-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      filter: ["all", ["has", "name"], ["==", ["get", "class"], "ferry"]],
      layout: expect.objectContaining({
        "symbol-placement": "line",
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-size": 10
      }),
      paint: POSTER_LABEL_PAINT_CONTRACT
    });

    expect(lighthouseLabelLayer).toMatchObject({
      id: "poster-lighthouse-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom: 12,
      filter: expect.any(Array),
      layout: expect.objectContaining({
        "symbol-placement": "point",
        "text-field": OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
        "text-size": 9
      }),
      paint: POSTER_LABEL_PAINT_CONTRACT
    });
    if (lighthouseLabelLayer?.type !== "symbol") {
      throw new Error("Expected poster lighthouse label symbol layer");
    }

    const compiledLighthouseFilter = featureFilter(lighthouseLabelLayer.filter).filter;
    const matchesLighthouseFeature = (properties) =>
      compiledLighthouseFilter(
        { zoom: 12 },
        {
          type: "Point",
          properties
        }
      );
    const acceptedLighthouseProperties = [
      { class: "attraction", name: "Harbor Lighthouse" },
      { class: "museum", name: "Old Light House" },
      { class: "attraction", name: "Light" },
      { class: "attraction", name: "Boston Light" },
      { class: "attraction", name: "Cape Light" },
      { class: "attraction", name: "Cape \u706f\u53f0" },
      { class: "attraction", name_en: "Boston Light" },
      { class: "museum", "name:latin": "Harbor Lighthouse" },
      { class: "attraction", "name:en": "Westerheversand Lighthouse" }
    ];
    const rejectedLighthouseProperties = [
      { class: "attraction", name: "Red Light District" },
      { class: "museum", name: "Piccadilly Lights" },
      { class: "attraction", name: "Twilight" },
      { class: "attraction", name: "Starlight" },
      { class: "restaurant", name: "Cape Light" }
    ];

    expect(acceptedLighthouseProperties.map(matchesLighthouseFeature)).toEqual(
      acceptedLighthouseProperties.map(() => true)
    );
    expect(rejectedLighthouseProperties.map(matchesLighthouseFeature)).toEqual(
      rejectedLighthouseProperties.map(() => false)
    );
    expect(layerIndex("poster-lighthouse-label")).toBeGreaterThan(
      layerIndex("poster-shipway-label")
    );
  });

  it("builds a muted poster red-orange-green MapLibre gradient from speed samples", () => {
    const gradient = createRouteSpeedGradient(speedSeries);

    expect(gradient).toEqual([
      "interpolate",
      ["linear"],
      ["line-progress"],
      0,
      "#b94a3a",
      0.333333,
      "#b94a3a",
      0.666667,
      "#d99a3a",
      1,
      "#6f8f4d"
    ]);
  });

  it("avoids duplicate large sample sorting when building a route speed gradient", () => {
    const originalSort = Array.prototype.sort;
    let largeSorts = 0;

    Array.prototype.sort = function patchedSort(...args) {
      if (this.length >= 128) {
        largeSorts += 1;
      }

      return Reflect.apply(originalSort, this, args);
    };

    try {
      const largeSpeedSeries = Array.from({ length: 160 }, (_, index) => {
        const startDistanceFromStartMeters = index * 100;
        const distanceFromStartMeters = startDistanceFromStartMeters + 100;
        const speedKmh = 8 + (index % 17);

        return {
          index: index + 1,
          startDistanceFromStartMeters,
          distanceFromStartMeters,
          distanceMeters: 100,
          durationSeconds: (100 / speedKmh) * 3.6,
          rawSpeedKmh: speedKmh,
          speedKmh
        };
      });

      const gradient = createRouteSpeedGradient(largeSpeedSeries, 16000);

      expect(gradient).not.toBeNull();
      expect(largeSorts).toBeLessThanOrEqual(2);
    } finally {
      Array.prototype.sort = originalSort;
    }
  });

  it("returns no gradient when speed data cannot create a useful range", () => {
    expect(createRouteSpeedGradient([])).toBeNull();
    expect(
      createRouteSpeedGradient([
        {
          index: 1,
          startDistanceFromStartMeters: 0,
          distanceFromStartMeters: 100,
          distanceMeters: 100,
          durationSeconds: 60,
          rawSpeedKmh: 8,
          speedKmh: 8
        },
        {
          index: 2,
          startDistanceFromStartMeters: 100,
          distanceFromStartMeters: 200,
          distanceMeters: 100,
          durationSeconds: 60,
          rawSpeedKmh: 8,
          speedKmh: 8
        }
      ])
    ).toBeNull();
  });

  it("returns no gradient when speed samples do not cover the rendered route distance", () => {
    expect(createRouteSpeedGradient(speedSeries, 400)).toBeNull();
    expect(
      createRouteSpeedGradient(
        [
          { ...speedSeries[0], startDistanceFromStartMeters: 20, distanceFromStartMeters: 120 },
          { ...speedSeries[1], startDistanceFromStartMeters: 120, distanceFromStartMeters: 220 },
          { ...speedSeries[2], startDistanceFromStartMeters: 220, distanceFromStartMeters: 320 }
        ],
        320
      )
    ).toBeNull();
  });

  it("exports the default route line color", () => {
    expect(ROUTE_LINE_COLOR).toBe("#c95b2e");
  });

  it("creates GeoJSON from track points", () => {
    const geojson = createTrackGeoJson(points);

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features[0].geometry.coordinates).toEqual([
      [42.1, 43.1, 620],
      [42.2, 43.2, 740]
    ]);
  });

  it("creates localized start and finish endpoint GeoJSON", () => {
    const geojson = createEndpointGeoJson(points, createI18n("de", LOCALES));

    expect(geojson.features).toHaveLength(2);
    expect(geojson.features[0].properties).toMatchObject({ kind: "start", label: "Start" });
    expect(geojson.features[1].properties).toMatchObject({ kind: "finish", label: "Ziel" });
    expect(geojson.features[0].geometry.coordinates).toEqual([42.1, 43.1]);
    expect(geojson.features[1].geometry.coordinates).toEqual([42.2, 43.2]);
  });

  it("renders a localized static SVG route fallback", () => {
    const host = document.createElement("div");
    renderStaticRouteFallback(host, points, createI18n("fr", LOCALES));

    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelector("svg")?.getAttribute("aria-label")).toBe(
      "Itinéraire sans fond de carte"
    );
    expect(host.querySelector("[data-static-route]")).not.toBeNull();
    expect(host.querySelectorAll("[data-static-route-segment]")).toHaveLength(0);
    expect(host.querySelector("[data-static-route-halo]")).not.toBeNull();
    expect(host.querySelector("[data-static-start]")).not.toBeNull();
    expect(host.querySelector("[data-static-finish]")).not.toBeNull();
    expect(host.textContent).toContain("Le fond de carte est indisponible");
  });

  it("renders localized start and finish labels in the static SVG route fallback", () => {
    const host = document.createElement("div");
    renderStaticRouteFallback(host, points, createI18n("en"));

    const startMarker = /** @type {SVGCircleElement | null} */ (
      host.querySelector("[data-static-start]")
    );
    const finishMarker = /** @type {SVGCircleElement | null} */ (
      host.querySelector("[data-static-finish]")
    );
    const startLabel = /** @type {SVGTextElement | null} */ (
      host.querySelector("[data-static-start-label]")
    );
    const finishLabel = /** @type {SVGTextElement | null} */ (
      host.querySelector("[data-static-finish-label]")
    );

    expect(startLabel?.textContent).toBe("Start");
    expect(finishLabel?.textContent).toBe("Finish");
    expect(startLabel?.getAttribute("text-anchor")).toBe("start");
    expect(Number(startLabel?.getAttribute("x"))).toBeGreaterThan(
      Number(startMarker?.getAttribute("cx"))
    );
    expect(finishLabel?.getAttribute("text-anchor")).toBe("end");
    expect(Number(finishLabel?.getAttribute("x"))).toBeLessThan(
      Number(finishMarker?.getAttribute("cx"))
    );
    expect(Number(finishLabel?.getAttribute("y"))).toBeGreaterThan(
      Number(finishMarker?.getAttribute("cy"))
    );
  });

  it("renders colored static SVG route segments when speed data is usable", () => {
    const host = document.createElement("div");
    const mapSpeedSeries = createSpeedSeriesForDistances(
      getRouteSegmentDistances(segmentedPoints),
      [5, 10, 15]
    );

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), mapSpeedSeries);

    const segments = Array.from(
      host.querySelectorAll("[data-static-route-segment]"),
      (segment) => /** @type {SVGPathElement} */ (segment)
    );

    expect(segments.length).toBe(3);
    expect(segments[0].getAttribute("data-static-route")).toBe("");
    expect(segments.map((segment) => segment.getAttribute("stroke"))).toEqual([
      "#b94a3a",
      "#d99a3a",
      "#6f8f4d"
    ]);
    expect(segments.map((segment) => segment.style.stroke)).toEqual([
      "#b94a3a",
      "#d99a3a",
      "#6f8f4d"
    ]);
    expect(host.querySelector("[data-static-route-halo]")).not.toBeNull();
    expect(host.querySelector("[data-static-start]")).not.toBeNull();
    expect(host.querySelector("[data-static-finish]")).not.toBeNull();
  });

  it("renders colored static SVG segments through zero-distance speed samples", () => {
    const host = document.createElement("div");
    const routeDistances = getRouteSegmentDistances(segmentedPoints);
    const jitterSpeedSeries = [
      {
        index: 1,
        startDistanceFromStartMeters: 0,
        distanceFromStartMeters: routeDistances[0],
        distanceMeters: routeDistances[0],
        durationSeconds: 120,
        rawSpeedKmh: 0,
        speedKmh: 0
      },
      {
        index: 2,
        startDistanceFromStartMeters: routeDistances[0],
        distanceFromStartMeters: routeDistances[0],
        distanceMeters: 0,
        durationSeconds: 30,
        rawSpeedKmh: 5,
        speedKmh: 5
      },
      {
        index: 3,
        startDistanceFromStartMeters: routeDistances[0],
        distanceFromStartMeters: routeDistances[0] + routeDistances[2],
        distanceMeters: routeDistances[2],
        durationSeconds: 30,
        rawSpeedKmh: 10,
        speedKmh: 10
      }
    ];

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), jitterSpeedSeries);

    const segments = Array.from(
      host.querySelectorAll("[data-static-route-segment]"),
      (segment) => /** @type {SVGPathElement} */ (segment)
    );

    expect(segments.length).toBe(3);
    expect(segments.map((segment) => segment.getAttribute("stroke"))).toEqual([
      "#b94a3a",
      "#d99a3a",
      "#6f8f4d"
    ]);
    expect(host.querySelectorAll("[data-static-route]")).toHaveLength(3);
  });

  it("keeps colored static SVG route segments continuous when a speed sample is missing", () => {
    const host = document.createElement("div");
    const routeDistances = getRouteSegmentDistances(segmentedPoints);
    const gappedSpeedSeries = [
      {
        index: 1,
        startDistanceFromStartMeters: 0,
        distanceFromStartMeters: routeDistances[0],
        distanceMeters: routeDistances[0],
        durationSeconds: 120,
        rawSpeedKmh: 5,
        speedKmh: 5
      },
      {
        index: 3,
        startDistanceFromStartMeters: routeDistances[0],
        distanceFromStartMeters: routeDistances[0] + routeDistances[2],
        distanceMeters: routeDistances[2],
        durationSeconds: 30,
        rawSpeedKmh: 15,
        speedKmh: 15
      }
    ];

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), gappedSpeedSeries);

    const segments = Array.from(
      host.querySelectorAll("[data-static-route-segment]"),
      (segment) => /** @type {SVGPathElement} */ (segment)
    );

    expect(segments.length).toBe(3);
    expect(segments.map((segment) => segment.getAttribute("stroke"))).toEqual([
      "#b94a3a",
      "#b94a3a",
      "#6f8f4d"
    ]);
  });

  it("keeps a single static route when speed samples do not create a useful range", () => {
    const host = document.createElement("div");
    const flatSpeedSeries = createSpeedSeriesForDistances(
      getRouteSegmentDistances(segmentedPoints),
      [8, 8, 8]
    );

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), flatSpeedSeries);

    expect(host.querySelectorAll("[data-static-route-segment]")).toHaveLength(0);
    expect(host.querySelectorAll("[data-static-route]")).toHaveLength(1);
  });

  it("retries failed OpenFreeMap style requests and reuses cloned sanitized styles", async () => {
    const host = document.createElement("div");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(initRouteMap(host, points, createI18n("en"))).resolves.toMatchObject({
      status: "fallback"
    });
    await expect(initRouteMap(host, points, createI18n("en"))).resolves.toMatchObject({
      status: "ready"
    });
    await expect(initRouteMap(host, segmentedPoints, createI18n("en"))).resolves.toMatchObject({
      status: "ready"
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(maplibreMock.Map).toHaveBeenCalledTimes(2);

    const firstStyle = maplibreMock.Map.mock.calls[0][0].style;
    const secondStyle = maplibreMock.Map.mock.calls[1][0].style;
    const mutationMarker = ["==", ["get", "mutated"], true];

    expect(firstStyle).not.toBe(secondStyle);
    expect(firstStyle.layers).not.toBe(secondStyle.layers);
    expect(firstStyle.layers[0]).not.toBe(secondStyle.layers[0]);
    expect(firstStyle.layers[0].filter).not.toBe(secondStyle.layers[0].filter);
    expect(secondStyle.layers[0].filter).toEqual(firstStyle.layers[0].filter);

    firstStyle.layers[0].filter.push(mutationMarker);

    expect(secondStyle.layers[0].filter).not.toContainEqual(mutationMarker);
  });

  it("initializes MapLibre with the poster background palette", async () => {
    const host = document.createElement("div");

    await initRouteMap(host, points, createI18n("en"));

    const mapStyle = maplibreMock.Map.mock.calls[0][0].style;
    const layer = (id) => mapStyle.layers.find((styleLayer) => styleLayer.id === id);
    const layerPaint = (id) => mapStyle.layers.find((layer) => layer.id === id)?.paint;
    const layerIndex = (id) => mapStyle.layers.findIndex((styleLayer) => styleLayer.id === id);

    expect(layerPaint("background")?.["background-color"]).toBe("#f0eee3");
    expect(layerPaint("park")).toEqual({
      "fill-color": "#d7dfd0"
    });
    expect(layerPaint("water")?.["fill-color"]).toBe("#d6e3e0");
    expect(layerPaint("waterway_river")?.["line-color"]).toBe("#7ba8a8");
    expect(layerPaint("waterway_other")?.["line-color"]).toBe("#7ba8a8");
    expect(layer("waterway_line_label")).toMatchObject({
      minzoom: 10,
      layout: expect.objectContaining({
        "text-font": ["Noto Sans Regular"],
        "text-letter-spacing": 0,
        "text-max-width": 8
      }),
      paint: {
        "text-color": "#416b73",
        "text-halo-color": "#fbfaf3",
        "text-halo-width": 1
      }
    });
    expect(layer("water_name_point_label")).toMatchObject({
      layout: expect.objectContaining({
        "text-font": ["Noto Sans Regular"],
        "text-letter-spacing": 0,
        "text-max-width": 8
      }),
      paint: {
        "text-color": "#416b73",
        "text-halo-color": "#fbfaf3",
        "text-halo-width": 1
      }
    });
    expect(layer("water_name_line_label")).toMatchObject({
      layout: expect.objectContaining({
        "text-font": ["Noto Sans Regular"],
        "text-letter-spacing": 0,
        "text-max-width": 8
      }),
      paint: {
        "text-color": "#416b73",
        "text-halo-color": "#fbfaf3",
        "text-halo-width": 1
      }
    });
    expect.soft(layer("landcover_wetland-poster-fill")).toEqual({
      id: "landcover_wetland-poster-fill",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      minzoom: 12,
      maxzoom: 18,
      filter: ["==", ["get", "class"], "wetland"],
      layout: { visibility: "visible" },
      metadata: { fixture: "live-wetland" },
      paint: {
        "fill-antialias": true,
        "fill-color": "#d7dfd0",
        "fill-opacity": 0.8,
        "fill-translate-anchor": "map"
      }
    });
    expect.soft(layer("landcover_wetland")).toEqual({
      id: "landcover_wetland",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      minzoom: 12,
      maxzoom: 18,
      filter: ["==", ["get", "class"], "wetland"],
      layout: { visibility: "visible" },
      metadata: { fixture: "live-wetland" },
      paint: {
        "fill-antialias": true,
        "fill-opacity": 0.25,
        "fill-pattern": "wetland_bg_11",
        "fill-translate-anchor": "map"
      }
    });
    expect.soft(layer("road_area_pattern-poster-fill")).toEqual({
      id: "road_area_pattern-poster-fill",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 13,
      maxzoom: 19,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      layout: { visibility: "visible" },
      metadata: { fixture: "live-pedestrian" },
      paint: { "fill-color": "#f0eee3" }
    });
    expect.soft(layer("road_area_pattern")).toEqual({
      id: "road_area_pattern",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 13,
      maxzoom: 19,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      layout: { visibility: "visible" },
      metadata: { fixture: "live-pedestrian" },
      paint: {
        "fill-opacity": 0.25,
        "fill-pattern": "pedestrian_polygon"
      }
    });
    expect(layerIndex("landcover_wetland-poster-fill") + 1).toBe(layerIndex("landcover_wetland"));
    expect(layerIndex("road_area_pattern-poster-fill") + 1).toBe(layerIndex("road_area_pattern"));
    expect(layer("landcover_scrub_pattern-poster-fill")).toBeUndefined();
    expect(layerPaint("landcover_scrub_pattern")).toEqual({
      "fill-color": "#d7dfd0"
    });
    expect(layerPaint("landcover")).toEqual({
      "fill-color": "#dbe9e8"
    });
    expect(layerPaint("building")).toMatchObject({
      "fill-color": "#d7d0c2",
      "fill-outline-color": "#ccc5bb"
    });
    expect(layerPaint("building-3d")?.["fill-extrusion-color"]).toBe("#d7d0c2");
    expect(layer("poster-building-outline")).toMatchObject({
      id: "poster-building-outline",
      type: "line",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      paint: {
        "line-color": "#ccc5bb",
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.35, 14, 0.45, 16, 0.65, 20, 0.95],
        "line-opacity": 0.9
      }
    });
    expect(layerIndex("poster-building-outline")).toBeGreaterThan(layerIndex("building-3d"));
    expect(layerIndex("poster-building-outline")).toBeLessThan(layerIndex("place-label"));
    expect(layerPaint("road-minor")?.["line-color"]).toBe("#ddd5c5");
    expect(layerPaint("mountain-path")?.["line-color"]).toBe("#8f8b63");
    expect(layerPaint("park_outline")).toEqual({
      "line-color": "#b7b1a4"
    });
    expect(layerPaint("aeroway-runway")?.["line-color"]).toBe("#ddd5c5");
    expect(layerPaint("aeroway-taxiway")?.["line-color"]).toBe("#ddd5c5");
    expect(layerPaint("place-label")).toMatchObject({
      "text-color": "#5f6c61",
      "text-halo-color": "#fbfaf3"
    });
  });

  it("classifies only positive natural and agricultural conditions on upstream landcover fills", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layerPaint = (id) => style.layers.find((layer) => layer.id === id)?.paint;

    expect(layerPaint("natural-area-a")?.["fill-color"]).toBe("#e8ddbf");
    expect(layerPaint("natural-area-b")?.["fill-color"]).toBe("#EEE5DC");
    expect(layerPaint("natural-area-c")?.["fill-color"]).toBe("#e8ddbf");
    expect(layerPaint("agricultural-landcover")?.["fill-color"]).toBe("#d8d8b5");
    expect(layerPaint("natural-area-mixed-any")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("natural-area-mixed-match")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("landcover-sand-negative")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("park-surface-decoy")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("agricultural-landuse-decoy")?.["fill-color"]).toBe("#d7dfd0");
  });

  it("uses the OpenMapTiles ice class and glacier or ice-shelf subclasses exactly", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);

    expect(layer("landcover")).toMatchObject({
      filter: ["==", ["get", "class"], "ice"],
      paint: { "fill-color": "#dbe9e8" }
    });
    expect(layer("landcover-glacier")).toMatchObject({
      filter: ["==", ["get", "subclass"], "glacier"],
      paint: { "fill-color": "#dbe9e8" }
    });
    expect(layer("landcover-ice-shelf")).toMatchObject({
      filter: ["==", ["get", "subclass"], "ice_shelf"],
      paint: { "fill-color": "#dbe9e8" }
    });
    expect(layer("landcover-glacier-class-decoy")).toMatchObject({
      filter: ["==", ["get", "class"], "glacier"],
      paint: { "fill-color": "#d7dfd0" }
    });
    expect(layer("landcover-ice-subclass-decoy")).toMatchObject({
      filter: ["==", ["get", "subclass"], "ice"],
      paint: { "fill-color": "#d7dfd0" }
    });
  });

  it("classifies current and representative landuse fills without broadening mixed filters", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layerPaint = (id) => style.layers.find((layer) => layer.id === id)?.paint;
    const fixtureClasses = [
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
    ];

    for (const [layerId, classValue] of fixtureClasses) {
      const expectedGroup = EXPECTED_LANDUSE_AREA_GROUPS.find((group) =>
        group.classes.includes(classValue)
      );

      expect(layerPaint(layerId)?.["fill-color"]).toBe(expectedGroup?.color);
    }

    expect(layerPaint("unknown-landuse-class")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("mixed-landuse-any")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("mixed-landuse-match")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("negative-landuse-class")?.["fill-color"]).toBe("#d7dfd0");
    expect(layerPaint("landcover-residential-decoy")?.["fill-color"]).toBe("#d7dfd0");
  });

  it("supplements only landuse class values missing from native fill coverage", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);
    const nativeClassValues = new Set(
      NATIVE_LANDUSE_CLASS_FIXTURES.map(([, classValue]) => classValue)
    );
    const expectedGroups = EXPECTED_LANDUSE_AREA_GROUPS.flatMap((group) => {
      const residualClasses = group.classes.filter(
        (classValue) => !nativeClassValues.has(classValue)
      );

      return residualClasses.length === 0 ? [] : [{ ...group, classes: residualClasses }];
    });
    const supplementalLayers = style.layers.filter(
      (styleLayer) =>
        styleLayer.type === "fill" &&
        styleLayer["source-layer"] === "landuse" &&
        styleLayer.id.startsWith("poster-landuse-")
    );

    expect(supplementalLayers.map((styleLayer) => styleLayer.id)).toEqual(
      expectedGroups.map((group) => group.id)
    );

    for (const group of expectedGroups) {
      expect(layer(group.id)).toMatchObject({
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter:
          group.classes.length === 1
            ? ["==", ["get", "class"], group.classes[0]]
            : ["match", ["get", "class"], group.classes, true, false],
        paint: { "fill-color": group.color }
      });
      expect(layerIndex(group.id)).toBeLessThan(layerIndex("landcover-residential-decoy"));
      expect(layerIndex(group.id)).toBeLessThan(layerIndex("water"));
      expect(layerIndex(group.id)).toBeLessThan(layerIndex("road-minor"));
      expect(layerIndex(group.id)).toBeLessThan(layerIndex("building"));
      expect(layerIndex(group.id)).toBeLessThan(layerIndex("place-label"));
    }

    expect(layer("poster-landuse-quarry")).toBeUndefined();
  });

  it("uses only rendered exhaustive positive native class coverage", async () => {
    const coverageStyle = cloneOpenFreeMapStyle();
    coverageStyle.layers = coverageStyle.layers.filter(
      (styleLayer) => !(styleLayer.type === "fill" && styleLayer["source-layer"] === "landuse")
    );
    coverageStyle.layers.splice(
      2,
      0,
      {
        id: "native-residential-limited",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        minzoom: 10,
        maxzoom: 12,
        filter: ["==", ["get", "class"], "residential"],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-suburb-reversed",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["==", "suburb", ["get", "class"]],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-commercial-group",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["match", ["get", "class"], ["commercial", "retail"], true, false],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-industrial-any-coverage",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: [
          "any",
          ["==", ["get", "class"], "industrial"],
          ["==", ["get", "class"], "garages"]
        ],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-civic-match-coverage",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: [
          "match",
          ["get", "class"],
          ["university", "kindergarten"],
          true,
          "college",
          false,
          false
        ],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-railway-negative-decoy",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["!=", ["get", "class"], "railway"],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-cross-semantic-decoy",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["match", ["get", "class"], ["military", "school"], true, false],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-nonboolean-decoy",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["match", ["get", "class"], "dam", 1, false],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-subclass-only-decoy",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["==", ["get", "subclass"], "quarry"],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "foreign-quarter-decoy",
        type: "fill",
        source: "foreign-tiles",
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "quarter"],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-conjunctive-decoy",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: [
          "all",
          ["==", ["get", "class"], "quarter"],
          ["==", ["get", "class"], "neighbourhood"]
        ],
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-quarter-hidden",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "quarter"],
        layout: { visibility: "none" },
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-neighbourhood-transparent",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "neighbourhood"],
        paint: { "fill-color": "#ffffff", "fill-opacity": 0 }
      },
      {
        id: "native-dam-data-opacity",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "dam"],
        paint: { "fill-color": "#ffffff", "fill-opacity": ["get", "opacity"] }
      },
      {
        id: "native-railway-visible-opacity",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "railway"],
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.7 }
      }
    );

    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(coverageStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerFilter = (id) => {
      const styleLayer = layer(id);

      return styleLayer && "filter" in styleLayer ? styleLayer.filter : undefined;
    };

    expect(layer("native-residential-limited")).toMatchObject({ minzoom: 10, maxzoom: 12 });
    expect(layerFilter("poster-landuse-residential")).toEqual([
      "match",
      ["get", "class"],
      ["quarter", "neighbourhood"],
      true,
      false
    ]);
    expect(layer("poster-landuse-commercial")).toBeUndefined();
    expect(layerFilter("poster-landuse-industrial")).toEqual([
      "match",
      ["get", "class"],
      ["military", "dam"],
      true,
      false
    ]);
    expect(layerFilter("poster-landuse-civic")).toEqual([
      "match",
      ["get", "class"],
      ["bus_station", "college", "library", "hospital", "school"],
      true,
      false
    ]);
    expect(layerFilter("poster-landuse-quarry")).toEqual(["==", ["get", "class"], "quarry"]);
  });

  it("composes supplemental areas at their native semantic tiers", async () => {
    const liveLikeStyle = cloneOpenFreeMapStyle();
    const nativeLayer = (id) => liveLikeStyle.layers.find((styleLayer) => styleLayer.id === id);
    liveLikeStyle.layers = [
      nativeLayer("background"),
      createLanduseFillFixture("native-landuse-residential", "residential"),
      {
        id: "native-landuse-generic",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        paint: { "fill-color": "#ffffff" }
      },
      {
        id: "native-landcover-generic",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "grass"],
        paint: { "fill-color": "#ffffff" }
      },
      nativeLayer("landcover_wetland"),
      nativeLayer("aeroway-runway"),
      nativeLayer("aeroway-taxiway"),
      nativeLayer("water"),
      nativeLayer("road-minor"),
      nativeLayer("building"),
      nativeLayer("place-label")
    ];

    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(liveLikeStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);
    const supplementalLanduseIds = EXPECTED_LANDUSE_AREA_GROUPS.map((group) => group.id);
    const supplementalLandcoverIds = [
      "poster-landcover-sand",
      "poster-landcover-rock",
      "poster-landcover-farmland"
    ];
    const supplementalAreaIds = [
      ...supplementalLanduseIds,
      ...supplementalLandcoverIds,
      "poster-aeroway-fill"
    ];

    expect(Math.max(...supplementalLanduseIds.map(layerIndex))).toBeLessThan(
      layerIndex("native-landcover-generic")
    );
    expect(layerIndex("native-landcover-generic")).toBeLessThan(
      Math.min(...supplementalLandcoverIds.map(layerIndex))
    );
    expect(Math.max(...supplementalLandcoverIds.map(layerIndex)) + 1).toBe(
      layerIndex("landcover_wetland-poster-fill")
    );
    expect(layerIndex("landcover_wetland-poster-fill") + 1).toBe(layerIndex("landcover_wetland"));
    expect(layer("poster-aeroway-fill")).toMatchObject({
      type: "fill",
      source: "openmaptiles",
      "source-layer": "aeroway",
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      paint: { "fill-color": "#e4e2e0" }
    });
    expect(layerIndex("poster-aeroway-fill") + 1).toBe(layerIndex("aeroway-runway"));
    expect(layerIndex("aeroway-runway")).toBeLessThan(layerIndex("aeroway-taxiway"));

    for (const areaLayerId of supplementalAreaIds) {
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("water"));
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("road-minor"));
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("building"));
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("place-label"));
    }
  });

  it("places landuse supplements below landcover when landcover source ownership is ambiguous", async () => {
    const ambiguousStyle = cloneOpenFreeMapStyle();
    ambiguousStyle.sources.alternateLandcover = {
      type: "vector",
      url: "https://example.test/alternate-landcover.json"
    };
    ambiguousStyle.layers.splice(2, 0, {
      id: "alternate-landcover-owner",
      type: "fill",
      source: "alternateLandcover",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "grass"],
      paint: { "fill-color": "#ffffff" }
    });

    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(ambiguousStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);
    const supplementalLanduseIds = EXPECTED_LANDUSE_AREA_GROUPS.flatMap((group) =>
      layerIndex(group.id) === -1 ? [] : [group.id]
    );

    expect(supplementalLanduseIds.length).toBeGreaterThan(0);
    expect(Math.max(...supplementalLanduseIds.map(layerIndex))).toBeLessThan(
      layerIndex("alternate-landcover-owner")
    );
  });

  it("treats a native aeroway fill and its zoom policy as authoritative", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);

    expect(layer("aeroway_fill")).toMatchObject({
      "source-layer": "aeroway",
      minzoom: 11,
      filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
      paint: {
        "fill-color": "#e4e2e0",
        "fill-opacity": 0.7
      }
    });
    expect(layer("poster-aeroway-fill")).toBeUndefined();
    expect(layerIndex("aeroway_fill")).toBeLessThan(layerIndex("aeroway_gate"));
    expect(layer("aeroway_gate")).toMatchObject({
      type: "symbol",
      filter: ["==", ["get", "class"], "gate"],
      paint: { "icon-color": "#76543f" }
    });
    expect(layer("aeroway-runway")?.paint?.["line-color"]).toBe("#ddd5c5");
    expect(layer("aeroway-taxiway")?.paint?.["line-color"]).toBe("#ddd5c5");
  });

  it("treats a visible unfiltered native aeroway fill as complete polygon coverage", async () => {
    const unfilteredStyle = cloneOpenFreeMapStyle();
    unfilteredStyle.layers = unfilteredStyle.layers.map((styleLayer) => {
      if (styleLayer.id !== "aeroway_fill") {
        return styleLayer;
      }

      const unfilteredLayer = { ...styleLayer };
      delete unfilteredLayer.filter;
      return unfilteredLayer;
    });

    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(
        async () =>
          new Response(JSON.stringify(unfilteredStyle), {
            headers: { "Content-Type": "application/json" }
          })
      )
    });

    expect(
      style.layers.find((styleLayer) => styleLayer.id === "poster-aeroway-fill")
    ).toBeUndefined();
  });

  it("keeps the aeroway fallback without rendered full-domain native coverage", async () => {
    const variants = [
      {
        id: "aeroway-class-narrowed",
        filter: ["==", ["get", "class"], "apron"]
      },
      {
        id: "aeroway-wrong-geometry",
        filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false]
      },
      {
        id: "aeroway-extra-constraint",
        filter: [
          "all",
          ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
          ["==", ["get", "class"], "apron"]
        ]
      },
      {
        id: "aeroway-hidden",
        layout: { visibility: "none" }
      },
      {
        id: "aeroway-transparent",
        paint: { "fill-opacity": 0 }
      },
      {
        id: "aeroway-data-opacity",
        paint: { "fill-opacity": ["get", "opacity"] }
      }
    ];

    for (const variant of variants) {
      const narrowedStyle = cloneOpenFreeMapStyle();
      narrowedStyle.layers = narrowedStyle.layers.map((styleLayer) =>
        styleLayer.id === "aeroway_fill" ? { ...styleLayer, ...variant } : styleLayer
      );

      const style = await loadMapStyle("openfreemap_poster", {
        fetcher: vi.fn(
          async () =>
            new Response(JSON.stringify(narrowedStyle), {
              headers: { "Content-Type": "application/json" }
            })
        )
      });

      expect(
        style.layers.find((styleLayer) => styleLayer.id === "poster-aeroway-fill"),
        variant.id
      ).toMatchObject({
        type: "fill",
        source: "openmaptiles",
        "source-layer": "aeroway",
        filter: ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        paint: { "fill-color": "#e4e2e0" }
      });
    }
  });

  it("supplements only natural area class values missing from native fill coverage", async () => {
    const style = await loadMapStyle("openfreemap_poster", {
      fetcher: vi.fn(async () => createOpenFreeMapStyleResponse())
    });
    const layer = (id) => style.layers.find((styleLayer) => styleLayer.id === id);
    const layerIndex = (id) => style.layers.findIndex((styleLayer) => styleLayer.id === id);
    const expectedFilters = {
      "poster-landcover-rock": ["==", ["get", "class"], "rock"],
      "poster-landcover-farmland": ["==", ["get", "class"], "farmland"]
    };

    expect(layer("natural-area-a")).toMatchObject({ minzoom: 9, maxzoom: 15 });
    expect(layer("poster-landcover-sand")).toBeUndefined();
    expect(layer("poster-landcover-rock")).toMatchObject({
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: expectedFilters["poster-landcover-rock"],
      paint: { "fill-color": "#EEE5DC" }
    });
    expect(layer("poster-landcover-farmland")).toMatchObject({
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: expectedFilters["poster-landcover-farmland"],
      paint: { "fill-color": "#d8d8b5" }
    });

    for (const areaLayerId of Object.keys(expectedFilters)) {
      expect(layerIndex(areaLayerId)).toBeGreaterThan(layerIndex("background"));
      expect(layerIndex(areaLayerId)).toBeGreaterThan(layerIndex("park"));
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("water"));
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("road-minor"));
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("building"));
      expect(layerIndex(areaLayerId)).toBeLessThan(layerIndex("place-label"));
    }
  });

  it("initializes MapLibre with a requested raster map style", async () => {
    const host = document.createElement("div");

    await initRouteMap(host, points, createI18n("en"), [], {}, "cyclosm");

    const mapStyle = maplibreMock.Map.mock.calls[0][0].style;
    expect(mapStyle.sources["cyclosm-raster"].tiles).toEqual([
      "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      "https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
    ]);
    expect(mapStyle.layers).toEqual([
      {
        id: "cyclosm-raster",
        type: "raster",
        source: "cyclosm-raster"
      }
    ]);
    const map = maplibreMock.instances[0];
    const routeLayerCalls = map.addLayer.mock.calls.filter(([layer]) =>
      ["route-line-halo", "route-line"].includes(layer.id)
    );

    expect(map.styleLayers.map((layer) => layer.id)).toEqual([
      "cyclosm-raster",
      "route-line-halo",
      "route-line",
      "route-endpoint-circles",
      "route-endpoint-labels"
    ]);
    expect(routeLayerCalls.map((call) => call.length)).toEqual([1, 1]);
  });

  it("continues when a map style is already loaded before subscribing to load", async () => {
    vi.useFakeTimers();
    maplibreMock.setInitialLoaded(true);
    const host = document.createElement("div");

    try {
      const renderPromise = initRouteMap(host, points, createI18n("en"), [], {}, "cyclosm");

      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(12000);

      await expect(renderPromise).resolves.toMatchObject({ status: "ready" });
      expect(maplibreMock.instances[0].loaded).toHaveBeenCalled();
      expect(host.querySelector(".static-map-fallback")).toBeNull();
      expect(maplibreMock.instances[0].fitBounds).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back when MapLibre load completes but idle stalls", async () => {
    vi.useFakeTimers();
    maplibreMock.setAutoResolveEvents(false);
    const host = document.createElement("div");

    try {
      const renderPromise = initRouteMap(
        host,
        points,
        createI18n("en"),
        [],
        { idleTimeoutMs: 5 },
        "cyclosm"
      );

      await vi.waitFor(() => {
        expect(maplibreMock.instances).toHaveLength(1);
      });

      const loadEvent = maplibreMock.pendingEvents.find((item) => item.event === "load");
      loadEvent.handler({});
      await vi.waitFor(() => {
        expect(maplibreMock.pendingEvents.some((item) => item.event === "idle")).toBe(true);
      });
      await vi.advanceTimersByTimeAsync(5);

      await expect(renderPromise).resolves.toMatchObject({ status: "fallback" });
      expect(maplibreMock.instances[0].remove).toHaveBeenCalledTimes(1);
      expect(host.querySelector(".static-map-fallback")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the static fallback in place when reusable renderer idle readiness stalls", async () => {
    vi.useFakeTimers();
    maplibreMock.setAutoResolveEvents(false);
    const renderer = createRouteMapRenderer();
    const host = document.createElement("div");

    try {
      const renderPromise = renderer.render(host, points, createI18n("en"), []);
      const initialFallback = host.querySelector(".static-map-fallback");
      expect(initialFallback).not.toBeNull();

      await vi.waitFor(() => {
        expect(maplibreMock.instances).toHaveLength(1);
      });

      const loadEvent = maplibreMock.pendingEvents.find((item) => item.event === "load");
      loadEvent.handler({});
      await vi.waitFor(() => {
        expect(maplibreMock.pendingEvents.some((item) => item.event === "idle")).toBe(true);
      });
      await vi.advanceTimersByTimeAsync(12000);

      await expect(renderPromise).resolves.toMatchObject({ status: "fallback" });
      expect(host.querySelector(".static-map-fallback")).toBe(initialFallback);
      expect(maplibreMock.instances[0].remove).toHaveBeenCalledTimes(1);
    } finally {
      renderer.dispose();
      vi.useRealTimers();
    }
  });

  it("forwards the requested map style through the reusable route map renderer", async () => {
    const renderer = createRouteMapRenderer();
    const host = document.createElement("div");

    const renderPromise = renderer.render(host, points, createI18n("en"), [], "osm_standard");

    await expect(renderPromise).resolves.toMatchObject({ status: "ready" });
    expect(maplibreMock.Map.mock.calls[0][0].style.sources["osm-standard-raster"]).toBeDefined();
  });

  it("initializes MapLibre route sources, layers, and bounds", async () => {
    const host = document.createElement("div");
    const routeDistance = getRouteDistance(points);
    const mapSpeedSeries = createSpeedSeriesForDistances(
      [routeDistance / 3, routeDistance / 3, routeDistance / 3],
      [5, 10, 15]
    );

    const result = await initRouteMap(host, points, createI18n("de", LOCALES), mapSpeedSeries);

    expect(result.status).toBe("ready");
    expect(maplibreMock.Map).toHaveBeenCalledWith(
      expect.objectContaining({
        container: host.querySelector(".maplibre-host"),
        interactive: false
      })
    );
    const mapStyle = maplibreMock.Map.mock.calls[0][0].style;
    expect(mapStyle.sources.openmaptiles.url).toBe("https://tiles.openfreemap.org/planet");
    expect(mapStyle.layers.find((layer) => layer.id === "highway-shield")?.filter).toEqual([
      "all",
      ["<=", ["to-number", ["get", "ref_length"], 1000000000000], 6],
      [">=", ["to-number", ["get", "rank"], -1000000000000], 7],
      ["<", ["to-number", ["get", "rank"], 1000000000000], 20],
      ["match", ["get", "network"], ["us-highway"], true, false],
      [">=", ["to-number", ["get", "ref_length"], -1000000000000], 1]
    ]);

    const map = maplibreMock.instances[0];
    expect(map.sources.get("route").lineMetrics).toBe(true);
    expect(map.sources.get("route").data.features[0].geometry.coordinates).toEqual([
      [42.1, 43.1, 620],
      [42.2, 43.2, 740]
    ]);
    expect(
      map.sources.get("route-endpoints").data.features.map((feature) => feature.properties)
    ).toEqual([
      { kind: "start", label: "Start" },
      { kind: "finish", label: "Ziel" }
    ]);
    expect(map.layers.map((layer) => layer.id)).toEqual([
      "route-line-halo",
      "route-line",
      "route-endpoint-circles",
      "route-endpoint-labels"
    ]);
    const finalStyleLayerIds = map.styleLayers.map((layer) => layer.id);
    const finalLayerIndex = (id) => finalStyleLayerIds.indexOf(id);

    expect(finalLayerIndex("highway-shield")).toBeLessThan(
      finalLayerIndex("poster-building-outline")
    );
    expect(finalStyleLayerIds.slice(finalLayerIndex("poster-building-outline"), -2)).toEqual([
      "poster-building-outline",
      "route-line-halo",
      "route-line",
      "poster-park-label",
      "poster-mountain-peak-label",
      "poster-waterway-label",
      "poster-water-name-line-label",
      "poster-water-name-point-label",
      "poster-tourist-poi-label",
      "poster-highway-name-motorway",
      "poster-aerialway-label",
      "poster-shipway-label",
      "poster-lighthouse-label",
      "waterway_line_label",
      "water_name_point_label",
      "water_name_line_label",
      "place-label",
      "highway-name-major",
      "highway-name-minor",
      "highway-name-path"
    ]);
    expect(finalStyleLayerIds.slice(-2)).toEqual([
      "route-endpoint-circles",
      "route-endpoint-labels"
    ]);
    const routeLayer = map.layers.find((layer) => layer.id === "route-line");
    expect(routeLayer.paint["line-gradient"]).toEqual(
      createRouteSpeedGradient(mapSpeedSeries, routeDistance)
    );
    expect(routeLayer.paint["line-color"]).toBeUndefined();
    const endpointLabelLayer = map.layers.find((layer) => layer.id === "route-endpoint-labels");
    expect(endpointLabelLayer.layout["text-font"]).toEqual(["Noto Sans Regular"]);
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [42.1, 43.1],
        [42.2, 43.2]
      ],
      { padding: 48, duration: 0 }
    );
    expect(host.querySelector(".static-map-fallback")).toBeNull();
  });

  it("nudges near-detail OpenFreeMap route maps at the safe-padding zoom boundary", async () => {
    const host = document.createElement("div");
    maplibreMock.setFitBoundsZoom(12.84);
    maplibreMock.setCameraForBoundsResolver((_bounds, options) => ({
      zoom: options.padding === 40 ? 13 : 13.04
    }));

    await initRouteMap(host, points, createI18n("en"));

    const map = maplibreMock.instances[0];
    const expectedBounds = [
      [42.1, 43.1],
      [42.2, 43.2]
    ];

    expect(map.fitBounds).toHaveBeenCalledWith(expectedBounds, {
      padding: 48,
      duration: 0
    });
    expect(map.cameraForBounds).toHaveBeenCalledWith(expectedBounds, { padding: 40 });
    expect(map.jumpTo).toHaveBeenCalledWith({ zoom: 13 });
    expect(map.getZoom()).toBe(13);
  });

  it("keeps the initial padded fit when detail zoom only fits without endpoint padding", async () => {
    const host = document.createElement("div");
    maplibreMock.setFitBoundsZoom(12.84);
    maplibreMock.setCameraForBoundsResolver((_bounds, options) => ({
      zoom: options.padding === 0 ? 13.04 : 12.92
    }));

    await initRouteMap(host, points, createI18n("en"));

    const map = maplibreMock.instances[0];
    const expectedBounds = [
      [42.1, 43.1],
      [42.2, 43.2]
    ];

    expect(map.fitBounds).toHaveBeenCalledWith(expectedBounds, {
      padding: 48,
      duration: 0
    });
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(map.getZoom()).toBe(12.84);
    expect(map.cameraForBounds).toHaveBeenCalledWith(expectedBounds, { padding: 40 });
  });

  it.each(["osm_standard", "cyclosm"])("never nudges the %s raster style", async (mapStyleId) => {
    const host = document.createElement("div");
    maplibreMock.setFitBoundsZoom(12.84);
    maplibreMock.setCameraForBoundsResolver(() => ({ zoom: 13.04 }));

    await initRouteMap(host, points, createI18n("en"), [], {}, mapStyleId);

    const map = maplibreMock.instances[0];

    expect(map.cameraForBounds).not.toHaveBeenCalled();
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(map.getZoom()).toBe(12.84);
  });

  it("keeps the fitted zoom for routes too wide to safely reach building source zoom", async () => {
    const host = document.createElement("div");
    maplibreMock.setFitBoundsZoom(12.4);
    maplibreMock.setCameraForBoundsResolver(() => ({ zoom: 12.92 }));

    await initRouteMap(host, points, createI18n("en"));

    const map = maplibreMock.instances[0];
    const expectedBounds = [
      [42.1, 43.1],
      [42.2, 43.2]
    ];

    expect(map.cameraForBounds).toHaveBeenCalledWith(expectedBounds, { padding: 40 });
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(map.getZoom()).toBe(12.4);
  });

  it.each([
    ["missing", undefined],
    ["non-finite", { zoom: Number.NaN }]
  ])("keeps the fitted zoom when the safe-padding camera zoom is %s", async (_label, camera) => {
    const host = document.createElement("div");
    maplibreMock.setFitBoundsZoom(12.4);
    maplibreMock.setCameraForBoundsResolver(() => camera);

    await initRouteMap(host, points, createI18n("en"));

    const map = maplibreMock.instances[0];

    expect(map.cameraForBounds).toHaveBeenCalledWith(
      [
        [42.1, 43.1],
        [42.2, 43.2]
      ],
      { padding: 40 }
    );
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(map.getZoom()).toBe(12.4);
  });

  it("does not resolve a detail camera when the fitted OpenFreeMap zoom is already detailed", async () => {
    const host = document.createElement("div");
    maplibreMock.setFitBoundsZoom(13);
    maplibreMock.setCameraForBoundsResolver(() => ({ zoom: 14 }));

    await initRouteMap(host, points, createI18n("en"));

    const map = maplibreMock.instances[0];

    expect(map.cameraForBounds).not.toHaveBeenCalled();
    expect(map.jumpTo).not.toHaveBeenCalled();
    expect(map.getZoom()).toBe(13);
  });

  it("removes a pending MapLibre instance when initialization is aborted", async () => {
    maplibreMock.setAutoResolveEvents(false);
    const host = document.createElement("div");
    const controller = new AbortController();

    const renderPromise = initRouteMap(host, points, createI18n("en"), [], {
      signal: controller.signal
    });
    await vi.waitFor(() => {
      expect(maplibreMock.instances).toHaveLength(1);
    });

    controller.abort();

    await expect(renderPromise).resolves.toMatchObject({ status: "cancelled" });
    expect(maplibreMock.instances[0].remove).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".static-map-fallback")).toBeNull();
    expect(host.querySelector(".maplibre-host")).toBeNull();
  });

  it("cancels stale MapLibre work before rendering a replacement route map", async () => {
    maplibreMock.setAutoResolveEvents(false);
    const renderer = createRouteMapRenderer();
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");

    const firstRender = renderer.render(firstHost, points, createI18n("en"), []);
    await vi.waitFor(() => {
      expect(maplibreMock.instances).toHaveLength(1);
    });

    const secondRender = renderer.render(secondHost, segmentedPoints, createI18n("en"), []);
    await vi.waitFor(() => {
      expect(maplibreMock.instances).toHaveLength(2);
    });

    await expect(firstRender).resolves.toMatchObject({ status: "cancelled" });
    expect(maplibreMock.instances[0].remove).toHaveBeenCalledTimes(1);
    expect(secondHost.querySelector(".static-map-fallback")).not.toBeNull();

    renderer.dispose();
    await expect(secondRender).resolves.toMatchObject({ status: "cancelled" });
    expect(maplibreMock.instances[1].remove).toHaveBeenCalledTimes(1);
  });

  it("keeps the static fallback until MapLibre reaches tile idle", async () => {
    maplibreMock.setAutoResolveEvents(false);
    const renderer = createRouteMapRenderer();
    const host = document.createElement("div");
    document.body.append(host);

    try {
      const render = renderer.render(host, points, createI18n("en"), []);
      let renderSettled = false;
      render.finally(() => {
        renderSettled = true;
      });
      await vi.waitFor(() => {
        expect(maplibreMock.instances).toHaveLength(1);
      });

      const container = maplibreMock.instances[0].options.container;
      expect(container).toBeInstanceOf(HTMLElement);
      expect(container.isConnected).toBe(true);
      expect(host.querySelector(".static-map-fallback")).not.toBeNull();
      expect(Array.from(host.children, (child) => child.className)).toEqual([
        "maplibre-host",
        "static-map-fallback"
      ]);

      const loadEvent = maplibreMock.pendingEvents.find((item) => item.event === "load");
      loadEvent.handler({});
      await vi.waitFor(() => {
        expect(maplibreMock.pendingEvents.some((item) => item.event === "idle")).toBe(true);
      });
      await vi.waitFor(() => {
        expect(maplibreMock.instances[0].fitBounds).toHaveBeenCalled();
      });
      await Promise.resolve();
      expect(host.querySelector(".static-map-fallback")).not.toBeNull();
      expect(host.querySelector(".maplibre-host")).not.toBeNull();
      expect(renderSettled).toBe(false);

      const idleEvent = maplibreMock.pendingEvents.find((item) => item.event === "idle");
      idleEvent.handler({});

      await expect(render).resolves.toMatchObject({ status: "ready" });
      expect(host.querySelector(".static-map-fallback")).toBeNull();
      expect(host.querySelector(".maplibre-host")).not.toBeNull();
    } finally {
      renderer.dispose();
      host.remove();
    }
  });

  it("removes ready MapLibre instances on dispose and before replacement renders", async () => {
    const renderer = createRouteMapRenderer();
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");

    const firstRender = await renderer.render(firstHost, points, createI18n("en"), []);
    expect(firstRender.status).toBe("ready");
    expect(maplibreMock.instances[0].remove).not.toHaveBeenCalled();

    renderer.dispose();
    expect(maplibreMock.instances[0].remove).toHaveBeenCalledTimes(1);

    await renderer.render(firstHost, points, createI18n("en"), []);
    expect(maplibreMock.instances[1].remove).not.toHaveBeenCalled();

    const replacementRender = renderer.render(secondHost, segmentedPoints, createI18n("en"), []);
    expect(maplibreMock.instances[1].remove).toHaveBeenCalledTimes(1);
    await expect(replacementRender).resolves.toMatchObject({ status: "ready" });
    expect(maplibreMock.instances[2].remove).not.toHaveBeenCalled();

    renderer.dispose();
    expect(maplibreMock.instances[2].remove).toHaveBeenCalledTimes(1);
  });

  it("keeps a single route color when MapLibre speed data is unavailable", async () => {
    const host = document.createElement("div");

    await initRouteMap(host, points, createI18n("en"));

    const map = maplibreMock.instances[0];
    const routeLayer = map.layers.find((layer) => layer.id === "route-line");

    expect(routeLayer.paint["line-color"]).toBe(ROUTE_LINE_COLOR);
    expect(routeLayer.paint["line-gradient"]).toBeUndefined();
  });

  it("keeps post-load MapLibre style expression errors out of the browser console", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");

    try {
      await initRouteMap(host, points, createI18n("en"));

      const map = maplibreMock.instances[0];
      const expressionError = new Error(
        "Expected value to be of type number, but found null instead."
      );

      map.fireError(expressionError);

      expect(map.on).toHaveBeenCalledWith("error", expect.any(Function));
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("initializes MapLibre with a continuous indexed speed gradient around route gaps", async () => {
    const host = document.createElement("div");
    const routeDistances = getRouteSegmentDistances(segmentedPoints);
    const gappedSpeedSeries = [
      {
        index: 1,
        startDistanceFromStartMeters: 0,
        distanceFromStartMeters: routeDistances[0],
        distanceMeters: routeDistances[0],
        durationSeconds: 120,
        rawSpeedKmh: 5,
        speedKmh: 5
      },
      {
        index: 3,
        startDistanceFromStartMeters: routeDistances[0],
        distanceFromStartMeters: routeDistances[0] + routeDistances[2],
        distanceMeters: routeDistances[2],
        durationSeconds: 30,
        rawSpeedKmh: 15,
        speedKmh: 15
      }
    ];

    await initRouteMap(host, segmentedPoints, createI18n("en"), gappedSpeedSeries);

    const map = maplibreMock.instances[0];
    const routeSource = map.sources.get("route");
    const routeLayer = map.layers.find((layer) => layer.id === "route-line");

    expect(routeSource.lineMetrics).toBe(true);
    expect(routeSource.data.features).toHaveLength(1);
    expect(routeLayer.paint["line-gradient"][2]).toEqual(["line-progress"]);
    expect(routeLayer.paint["line-gradient"]).toContain("#b94a3a");
    expect(routeLayer.paint["line-gradient"]).toContain("#6f8f4d");
    expect(routeLayer.paint["line-color"]).toBeUndefined();
  });
});
