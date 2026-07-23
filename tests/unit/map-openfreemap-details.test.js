import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it, vi } from "vitest";
import { loadMapStyle } from "../../src/render/map-styles.js";
import {
  OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
  POSTER_LABEL_PAINT_CONTRACT,
  POSTER_TRAIL_LABEL_PAINT_CONTRACT,
  cloneOpenFreeMapStyle,
  createOpenFreeMapStyleResponse
} from "./helpers/openfreemap-style-fixture.js";

describe("OpenFreeMap poster transport and landmarks", () => {
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
});
