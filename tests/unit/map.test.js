import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { haversineMeters } from "../../src/core/geo.js";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import {
  DEFAULT_MAP_STYLE_ID,
  MAP_STYLE_OPTIONS,
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
  const Map = vi.fn((options) => {
    const instance = {
      options,
      /** @type {((event: { error: Error }) => void)[]} */
      errorListeners: [],
      sources: new globalThis.Map(),
      /** @type {any[]} */
      layers: [],
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
        instance.sources.set(id, source);
      }),
      addLayer: vi.fn((layer) => {
        instance.layers.push(layer);
      }),
      fitBounds: vi.fn(),
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
      id: "landcover_wetland",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: {
        "fill-pattern": "wetland_bg_11"
      }
    },
    {
      id: "road_area_pattern",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "transportation",
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
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      paint: {
        "fill-color": "#cbd5e1"
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
      id: "place-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      paint: {
        "text-color": "#1f2937",
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

describe("map helpers", () => {
  beforeEach(() => {
    maplibreMock.instances.length = 0;
    maplibreMock.pendingEvents.length = 0;
    maplibreMock.setAutoResolveEvents(true);
    maplibreMock.setInitialLoaded(false);
    maplibreMock.Map.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: vi.fn(async () => cloneOpenFreeMapStyle())
      }))
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
    expect(layerPaint("landcover_wetland-poster-fill")).toEqual({
      "fill-color": "#d7dfd0"
    });
    expect(layerPaint("landcover_wetland")).toEqual({
      "fill-pattern": "wetland_bg_11"
    });
    expect(layerPaint("road_area_pattern-poster-fill")).toEqual({
      "fill-color": "#f0eee3"
    });
    expect(layerPaint("road_area_pattern")).toEqual({
      "fill-pattern": "pedestrian_polygon"
    });
    expect(layerIndex("landcover_wetland-poster-fill")).toBeLessThan(
      layerIndex("landcover_wetland")
    );
    expect(layerIndex("road_area_pattern-poster-fill")).toBeLessThan(
      layerIndex("road_area_pattern")
    );
    expect(layer("landcover_scrub_pattern-poster-fill")).toBeUndefined();
    expect(layerPaint("landcover_scrub_pattern")).toEqual({
      "fill-color": "#d7dfd0"
    });
    expect(layerPaint("building")?.["fill-color"]).toBe("#e3ded2");
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
    expect(mapStyle.layers[0].filter).toEqual([
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
