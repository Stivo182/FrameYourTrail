import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it, vi } from "vitest";
import { getMapTextLabelBoundaryIndex, loadMapStyle } from "../../src/render/map-styles.js";
import {
  OPENFREEMAP_NAME_TEXT_FIELD_CONTRACT,
  POSTER_LABEL_PAINT_CONTRACT,
  POSTER_WATER_LABEL_PAINT_CONTRACT,
  cloneOpenFreeMapStyle,
  createOpenFreeMapStyleResponse
} from "./helpers/openfreemap-style-fixture.js";

describe("OpenFreeMap poster labels", () => {
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
});
