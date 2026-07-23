import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import {
  ROUTE_LINE_COLOR,
  createRouteMapRenderer,
  createRouteSpeedGradient,
  initRouteMap
} from "../../src/render/map.js";
import {
  createSpeedSeriesForDistances,
  getRouteDistance,
  getRouteSegmentDistances,
  points,
  segmentedPoints
} from "./helpers/map-route-fixtures.js";
import { createOpenFreeMapStyleResponse } from "./helpers/openfreemap-style-fixture.js";

const maplibreMock = vi.hoisted(() => {
  /** @type {any[]} */
  const instances = [];
  /** @type {any[]} */
  const pendingEvents = [];
  let autoResolveEvents = true;
  let initialLoaded = false;
  let fitBoundsZoom = 0;
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
        instance.sources.set(id, source);
      }),
      addLayer: vi.fn((layer, beforeId) => {
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

describe("MapLibre route renderer", () => {
  beforeEach(() => {
    maplibreMock.instances.length = 0;
    maplibreMock.pendingEvents.length = 0;
    maplibreMock.setAutoResolveEvents(true);
    maplibreMock.setInitialLoaded(false);
    maplibreMock.setFitBoundsZoom(13);
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

  it("retries failed OpenFreeMap style requests and reuses cloned sanitized styles", async () => {
    vi.resetModules();
    const { initRouteMap: initFreshRouteMap } = await import("../../src/render/map.js");
    const host = document.createElement("div");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(initFreshRouteMap(host, points, createI18n("en"))).resolves.toMatchObject({
      status: "fallback"
    });
    await expect(initFreshRouteMap(host, points, createI18n("en"))).resolves.toMatchObject({
      status: "ready"
    });
    await expect(initFreshRouteMap(host, segmentedPoints, createI18n("en"))).resolves.toMatchObject(
      {
        status: "ready"
      }
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(maplibreMock.Map).toHaveBeenCalledTimes(2);

    const firstStyle = maplibreMock.Map.mock.calls[0][0].style;
    const secondStyle = maplibreMock.Map.mock.calls[1][0].style;
    const mutationMarker = ["==", ["get", "mutated"], true];

    expect(firstStyle).not.toBe(secondStyle);
    expect(firstStyle.layers).not.toBe(secondStyle.layers);
    const firstFilteredLayer = firstStyle.layers.find((layer) => Array.isArray(layer.filter));
    const secondFilteredLayer = secondStyle.layers.find(
      (layer) => layer.id === firstFilteredLayer?.id
    );

    expect(firstStyle.layers[0]).not.toBe(secondStyle.layers[0]);
    expect(firstFilteredLayer).toBeDefined();
    expect(secondFilteredLayer).toBeDefined();
    expect(firstFilteredLayer.filter).not.toBe(secondFilteredLayer.filter);
    expect(secondFilteredLayer.filter).toEqual(firstFilteredLayer.filter);

    firstFilteredLayer.filter.push(mutationMarker);

    expect(secondFilteredLayer.filter).not.toContainEqual(mutationMarker);
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
    expect(mapStyle.layers.find((layer) => layer.id === "highway-shield")).toBeUndefined();

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

    expect(finalLayerIndex("highway-shield")).toBe(-1);
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
