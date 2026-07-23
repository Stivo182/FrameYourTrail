import { featureFilter, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMapTextLabelBoundaryIndex, loadMapStyle } from "../../src/render/map-styles.js";
import {
  OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
  POSTER_LABEL_PAINT_CONTRACT,
  POSTER_TRAIL_LABEL_PAINT_CONTRACT,
  POSTER_WATER_LABEL_PAINT_CONTRACT,
  cloneOpenFreeMapStyle,
  createOpenFreeMapStyleResponse
} from "./helpers/map-fixtures.js";

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

describe("OpenFreeMap poster details", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createOpenFreeMapStyleResponse())
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the retained captured Liberty contract across original and renamed sources", async () => {
    const fixture = readOpenFreeMapLibertyContractFixture();
    const suppressedLayerIds = new Set(["landuse_residential", "highway-shield-non-us"]);
    const retainedLayerIds = fixture.layers
      .map((layer) => layer.id)
      .filter((layerId) => !suppressedLayerIds.has(layerId));
    const expectedGeneratedVectorLayerIds = new Set([
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
        .map((styleLayer) => styleLayer.id)
        .filter((layerId) => !suppressedLayerIds.has(layerId));
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
      expect(finalLayerIds).not.toEqual(expect.arrayContaining([...suppressedLayerIds]));
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
    const nativeTextLabelIds = cloneOpenFreeMapStyle()
      .layers.filter(
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
    const suppressedLayerIds = new Set([
      "highway-shield",
      "landuse_residential",
      "missing-landuse-suburb"
    ]);
    expect(finalLayerIds.filter((id) => nonTextLayers.some((layer) => layer.id === id))).toEqual(
      nonTextLayers.map((layer) => layer.id).filter((id) => !suppressedLayerIds.has(id))
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
});
