import { describe, expect, it } from "vitest";

import {
  createRouteSource,
  getRouteSourceFormat,
  ROUTE_FORMATS
} from "../../src/core/route-source.js";

describe("route source model", () => {
  it("normalizes parsed GPX data without changing analysis fields", () => {
    const rawPoints = [
      {
        latitude: 45.1,
        longitude: 7.1,
        elevation: 1200,
        elevationSource: "gpx",
        timestamp: new Date("2026-05-13T08:00:00Z"),
        segmentIndex: 0
      },
      {
        latitude: 45.2,
        longitude: 7.2,
        elevation: 1300,
        elevationSource: "gpx",
        timestamp: new Date("2026-05-13T08:10:00Z"),
        segmentIndex: 0
      }
    ];
    const points = rawPoints.map((point) => ({ ...point }));
    const importedSummary = {
      totalDistanceMeters: 1000,
      sourceTag: "gpx_extensions"
    };
    const parsed = {
      fileName: "ridge.gpx",
      name: "Ridge",
      points,
      rawPoints,
      hasElevation: true,
      hasTime: true,
      elevationSource: "gpx",
      importedSummary,
      provenance: {
        format: "gpx",
        pointCount: 2,
        segmentCount: 1,
        rawExtensions: {
          gpx: ["<tp:summary />"],
          metadata: [],
          tracks: []
        }
      }
    };

    const result = createRouteSource(parsed, {
      format: ROUTE_FORMATS.gpx,
      parser: "gpx-parser"
    });

    expect(result.fileName).toBe("ridge.gpx");
    expect(result.name).toBe("Ridge");
    expect(result.points).toBe(points);
    expect(result.rawPoints).toBe(rawPoints);
    expect(result.hasElevation).toBe(true);
    expect(result.hasTime).toBe(true);
    expect(result.elevationSource).toBe("gpx");
    expect(result.importedSummary).toBe(importedSummary);
    expect(result.source).toEqual({
      format: "gpx",
      parser: "gpx-parser",
      fileName: "ridge.gpx",
      name: "Ridge"
    });
    expect(result.provenance).toMatchObject({
      format: "gpx",
      pointCount: 2,
      segmentCount: 1,
      rawExtensions: {
        gpx: ["<tp:summary />"],
        metadata: [],
        tracks: []
      }
    });
    expect(getRouteSourceFormat(result)).toBe("gpx");
  });

  it("derives rawPoints from points when the parser did not provide a raw copy", () => {
    const points = [
      { latitude: 45.1, longitude: 7.1, segmentIndex: 0 },
      { latitude: 45.2, longitude: 7.2, segmentIndex: 0 }
    ];
    const parsed = {
      fileName: "ridge.gpx",
      name: "Ridge",
      points
    };

    const result = createRouteSource(parsed, {
      format: ROUTE_FORMATS.gpx,
      parser: "unit-test"
    });

    expect(result.rawPoints).toBe(points);
    expect(result.provenance).toMatchObject({
      format: "gpx",
      pointCount: 2,
      segmentCount: 1
    });
  });

  it("derives segmentCount from unique finite segment indexes when provenance is missing", () => {
    const parsed = {
      fileName: "ridge.gpx",
      name: "Ridge",
      points: [
        { latitude: 45.1, longitude: 7.1, segmentIndex: 0 },
        { latitude: 45.2, longitude: 7.2, segmentIndex: 1 },
        { latitude: 45.3, longitude: 7.3, segmentIndex: 1 },
        { latitude: 45.4, longitude: 7.4, segmentIndex: Number.NaN }
      ]
    };

    const result = createRouteSource(parsed, {
      format: ROUTE_FORMATS.gpx,
      parser: "unit-test"
    });

    expect(result.provenance).toMatchObject({
      format: "gpx",
      pointCount: 4,
      segmentCount: 2
    });
  });

  it("normalizes conflicting parsed provenance format to the source format", () => {
    const result = createRouteSource(
      {
        fileName: "ridge.gpx",
        name: "Ridge",
        points: [],
        provenance: {
          format: "fit",
          pointCount: 2,
          segmentCount: 1
        }
      },
      { format: ROUTE_FORMATS.gpx, parser: "unit-test" }
    );

    expect(result.source.format).toBe("gpx");
    expect(result.provenance.format).toBe("gpx");
  });

  it("accepts FIT as a supported route source format", () => {
    const result = createRouteSource(
      { fileName: "ride.fit", name: "Ride", points: [] },
      { format: ROUTE_FORMATS.fit, parser: "unit-test" }
    );

    expect(result.source.format).toBe("fit");
    expect(result.provenance.format).toBe("fit");
  });

  it("rejects unsupported route source formats before analysis", () => {
    expect(() =>
      createRouteSource(
        { fileName: "route.kml", name: "Route", points: [] },
        { format: "kml", parser: "unit-test" }
      )
    ).toThrow("Unsupported route source format: kml");
  });
});
