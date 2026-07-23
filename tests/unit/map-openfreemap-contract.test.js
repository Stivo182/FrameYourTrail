import { featureFilter, validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadMapStyle } from "../../src/render/map-styles.js";
import { cloneOpenFreeMapStyle } from "./helpers/openfreemap-style-fixture.js";

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

describe("OpenFreeMap provider contracts", () => {
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
});
