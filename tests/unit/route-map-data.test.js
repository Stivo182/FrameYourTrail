import { describe, expect, it } from "vitest";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { createEndpointGeoJson, createTrackGeoJson } from "../../src/render/map.js";
import { points } from "./helpers/map-route-fixtures.js";

describe("route map data", () => {
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
});
