import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMapStyle } from "../../src/render/map-styles.js";
import {
  EXPECTED_LANDUSE_AREA_GROUPS,
  NATIVE_LANDUSE_CLASS_FIXTURES,
  cloneOpenFreeMapStyle,
  createLanduseFillFixture,
  createOpenFreeMapStyleResponse
} from "./helpers/openfreemap-style-fixture.js";

describe("OpenFreeMap poster areas", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createOpenFreeMapStyleResponse())
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    const fixtureClasses = NATIVE_LANDUSE_CLASS_FIXTURES.filter(([, classValue]) =>
      EXPECTED_LANDUSE_AREA_GROUPS.some((group) => group.classes.includes(classValue))
    );

    for (const [layerId, classValue] of fixtureClasses) {
      const expectedGroup = EXPECTED_LANDUSE_AREA_GROUPS.find((group) =>
        group.classes.includes(classValue)
      );

      expect(layerPaint(layerId)?.["fill-color"]).toBe(expectedGroup?.color);
    }

    expect(layerPaint("landuse_residential")).toBeUndefined();
    expect(layerPaint("missing-landuse-suburb")).toBeUndefined();

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

    expect(layer("native-residential-limited")).toBeUndefined();
    expect(layer("native-suburb-reversed")).toBeUndefined();
    expect(layer("poster-landuse-residential")).toBeUndefined();
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
});
