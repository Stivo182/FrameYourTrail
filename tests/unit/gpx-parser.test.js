import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GpxParseError, parseGpx } from "../../src/core/gpx-parser.js";

const fixture = (name) => readFileSync(resolve("tests/fixtures", name), "utf8");
const highPrecisionTime = (index) =>
  new Date(Date.UTC(2026, 4, 16, 11, 12, 30) + index * 5000)
    .toISOString()
    .replace(".000Z", ".163733020Z");

describe("parseGpx", () => {
  it("reads explicit activity from direct gpx track type", () => {
    const parsed = parseGpx(
      `<gpx>
        <trk>
          <type>cycling</type>
          <trkseg>
            <trkpt lat="43.1" lon="42.1"><time>2024-05-25T08:00:00Z</time></trkpt>
            <trkpt lat="43.2" lon="42.2"><time>2024-05-25T08:01:00Z</time></trkpt>
          </trkseg>
        </trk>
      </gpx>`,
      "ride.gpx"
    );

    expect(parsed.activity).toEqual({
      type: "bike",
      source: "gpx_track_type",
      raw: "cycling"
    });
  });

  it("reads explicit activity from direct gpx route type", () => {
    const parsed = parseGpx(
      `<gpx>
        <rte>
          <type>hiking</type>
          <rtept lat="43.1" lon="42.1"><time>2024-05-25T08:00:00Z</time></rtept>
          <rtept lat="43.2" lon="42.2"><time>2024-05-25T08:01:00Z</time></rtept>
        </rte>
      </gpx>`,
      "hike.gpx"
    );

    expect(parsed.activity).toEqual({
      type: "foot",
      source: "gpx_route_type",
      raw: "hiking"
    });
    expect(parsed.points.map((point) => point.segmentIndex)).toEqual([0, 0]);
    expect(parsed.provenance?.segmentCount).toBe(1);
  });

  it("does not repeatedly scan every XML node while extracting imported summary", () => {
    const originalGetElementsByTagName = Document.prototype.getElementsByTagName;
    let wildcardScans = 0;

    Document.prototype.getElementsByTagName = function getElementsByTagName(tagName) {
      if (tagName === "*") {
        wildcardScans += 1;
      }

      return originalGetElementsByTagName.call(this, tagName);
    };

    try {
      const points = Array.from(
        { length: 12 },
        (_item, index) =>
          `<trkpt lat="${43 + index * 0.001}" lon="42"><ele>${100 + index}</ele></trkpt>`
      ).join("");

      parseGpx(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`, "scan-budget.gpx");
    } finally {
      Document.prototype.getElementsByTagName = originalGetElementsByTagName;
    }

    expect(wildcardScans).toBeLessThanOrEqual(1);
  });

  it("does not resolve the segment list separately for every track point", () => {
    const originalGetElementsByTagName = Element.prototype.getElementsByTagName;
    let trackSegmentScans = 0;

    Element.prototype.getElementsByTagName = function getElementsByTagName(tagName) {
      if (tagName === "trkseg") {
        trackSegmentScans += 1;
      }

      return originalGetElementsByTagName.call(this, tagName);
    };

    try {
      const points = Array.from(
        { length: 12 },
        (_item, index) =>
          `<trkpt lat="${43 + index * 0.001}" lon="42"><ele>${100 + index}</ele></trkpt>`
      ).join("");

      parseGpx(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`, "segment-budget.gpx");
    } finally {
      Element.prototype.getElementsByTagName = originalGetElementsByTagName;
    }

    expect(trackSegmentScans).toBeLessThanOrEqual(2);
  });

  it("assigns globally unique segment indexes across tracks and routes", () => {
    const result = parseGpx(
      `<gpx>
        <trk>
          <trkseg>
            <trkpt lat="43.1" lon="42.1" />
          </trkseg>
          <trkseg>
            <trkpt lat="43.2" lon="42.2" />
          </trkseg>
        </trk>
        <trk>
          <trkseg>
            <trkpt lat="43.3" lon="42.3" />
          </trkseg>
        </trk>
        <rte>
          <rtept lat="43.4" lon="42.4" />
        </rte>
      </gpx>`,
      "segments.gpx"
    );

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 1, 2, 3]);
    expect(result.provenance?.segmentCount).toBe(4);
  });

  it("ignores empty nested route and segment elements when assigning segment indexes", () => {
    const result = parseGpx(
      `<gpx>
        <metadata>
          <extensions>
            <rte><name>Decorative route metadata</name></rte>
            <trkseg><name>Decorative segment metadata</name></trkseg>
          </extensions>
        </metadata>
        <trk>
          <trkseg>
            <trkpt lat="43.1" lon="42.1" />
          </trkseg>
        </trk>
        <rte>
          <rtept lat="43.2" lon="42.2" />
        </rte>
      </gpx>`,
      "decorative-containers.gpx"
    );

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 1]);
    expect(result.provenance?.segmentCount).toBe(2);
  });

  it("orders all track points before route points even when routes surround tracks", () => {
    const result = parseGpx(
      `<gpx>
        <rte>
          <rtept lat="43.4" lon="42.4" />
        </rte>
        <trk>
          <name>First Track</name>
          <trkseg>
            <trkpt lat="43.1" lon="42.1" />
          </trkseg>
        </trk>
        <rte>
          <rtept lat="43.5" lon="42.5" />
        </rte>
        <trk>
          <name>Second Track</name>
          <trkseg>
            <trkpt lat="43.2" lon="42.2" />
            <trkpt lat="43.3" lon="42.3" />
          </trkseg>
        </trk>
      </gpx>`,
      "mixed-order.gpx"
    );

    expect(result.points.map((point) => [point.latitude, point.longitude])).toEqual([
      [43.1, 42.1],
      [43.2, 42.2],
      [43.3, 42.3],
      [43.4, 42.4],
      [43.5, 42.5]
    ]);
    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 1, 1, 2, 3]);
    expect(result.points.slice(3).map((point) => point.segmentIndex)).toEqual([2, 3]);
    expect(result.provenance).toMatchObject({
      format: "gpx",
      pointCount: 5,
      segmentCount: 4
    });
  });

  it("extracts nested imported summary attributes from GPX extensions", () => {
    const result = parseGpx(
      `<gpx xmlns:tp="https://example.test/frame-your-trail">
        <extensions>
          <tp:summary>
            <tp:metrics totalDistanceMeters="1234.5">
              <tp:elevation elevationGainMeters="67" elevationLossMeters="45" />
            </tp:metrics>
          </tp:summary>
        </extensions>
        <trk><trkseg>
          <trkpt lat="43.1" lon="42.1" />
          <trkpt lat="43.2" lon="42.2" />
        </trkseg></trk>
      </gpx>`,
      "nested-summary.gpx"
    );

    expect(result.importedSummary).toMatchObject({
      totalDistanceMeters: 1234.5,
      elevationGainMeters: 67,
      elevationLossMeters: 45
    });
  });

  it("parses track name, points, elevation, and time", () => {
    const result = parseGpx(fixture("valid-track.gpx"), "valid-track.gpx");

    expect(result.name).toBe("Test Ridge Route");
    expect(result.fileName).toBe("valid-track.gpx");
    expect(result.points).toHaveLength(5);
    expect(result.points[0]).toMatchObject({
      latitude: 43.1,
      longitude: 42.1,
      elevation: 620,
      segmentIndex: 0
    });
    expect(result.points[0].timestamp?.toISOString()).toBe("2024-05-25T08:00:00.000Z");
    expect(result.hasElevation).toBe(true);
    expect(result.hasTime).toBe(true);
  });

  it("uses the file name when GPX track name is a generic current-track label", () => {
    const result = parseGpx(
      `<gpx><trk>
        <name>Текущий трек: 18 MAY 2025 18:54</name>
        <trkseg>
          <trkpt lat="43.1" lon="42.1" />
          <trkpt lat="43.2" lon="42.2" />
        </trkseg>
      </trk></gpx>`,
      "Укса 2025.gpx"
    );

    expect(result.name).toBe("Укса 2025");
  });

  it("uses the file name for generic current-track labels in supported languages", () => {
    const genericNames = [
      "Current Track",
      "Current Activity: 18 MAY 2025 18:54",
      "\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0442\u0440\u0435\u043a",
      "\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c 18.05.2025",
      "Actividad actual - 18/05/2025",
      "Track actual 18 MAY 2025",
      "Activit\u00e9 actuelle 18 mai 2025",
      "Trace actuelle: 18/05/2025",
      "Aktuelle Aktivit\u00e4t - 18.05.2025",
      "Aktueller Track 18.05.2025"
    ];

    for (const name of genericNames) {
      const result = parseGpx(
        `<gpx><trk>
          <name>${name}</name>
          <trkseg>
            <trkpt lat="43.1" lon="42.1" />
            <trkpt lat="43.2" lon="42.2" />
          </trkseg>
        </trk></gpx>`,
        "river-day.gpx"
      );

      expect(result.name).toBe("river-day");
    }
  });

  it("uses the file name for generic default track labels", () => {
    const genericNames = [
      "Track",
      "Track 1",
      "Activity #12",
      "Untitled",
      "Untitled Track",
      "New Track",
      "\u0422\u0440\u0435\u043a",
      "\u0422\u0440\u0435\u043a 1",
      "\u0411\u0435\u0437 \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044f",
      "\u041d\u043e\u0432\u044b\u0439 \u0442\u0440\u0435\u043a",
      "Sin t\u00edtulo",
      "Sans titre",
      "Unbenannt"
    ];

    for (const name of genericNames) {
      const result = parseGpx(
        `<gpx><trk>
          <name>${name}</name>
          <trkseg>
            <trkpt lat="43.1" lon="42.1" />
            <trkpt lat="43.2" lon="42.2" />
          </trkseg>
        </trk></gpx>`,
        "river-day.gpx"
      );

      expect(result.name).toBe("river-day");
    }
  });

  it("keeps user-entered track names that only start with a generic label", () => {
    const result = parseGpx(
      `<gpx><trk>
        <name>Current Track Adventure</name>
        <trkseg>
          <trkpt lat="43.1" lon="42.1" />
          <trkpt lat="43.2" lon="42.2" />
        </trkseg>
      </trk></gpx>`,
      "river-day.gpx"
    );

    expect(result.name).toBe("Current Track Adventure");
  });

  it("keeps quality fields, raw extension fragments, and imported summary provenance", () => {
    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" creator="FrameYourTrailTest"
        xmlns="http://www.topografix.com/GPX/1/1"
        xmlns:tp="https://example.test/frame-your-trail"
        xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
        <extensions>
          <tp:summary>
            <tp:distanceMeters>1234.5</tp:distanceMeters>
            <tp:totalDistance3dMeters>1240.25</tp:totalDistance3dMeters>
            <tp:totalDurationSeconds>700</tp:totalDurationSeconds>
            <tp:stoppedDurationSeconds>100</tp:stoppedDurationSeconds>
            <tp:maxSpeedKmh>12.5</tp:maxSpeedKmh>
            <tp:ascentMeters>67</tp:ascentMeters>
            <tp:descentMeters>45</tp:descentMeters>
            <tp:movingDurationSeconds>600</tp:movingDurationSeconds>
            <tp:minElevationMeters>620</tp:minElevationMeters>
            <tp:maxElevationMeters>645</tp:maxElevationMeters>
            <tp:elevationRangeMeters>25</tp:elevationRangeMeters>
          </tp:summary>
        </extensions>
        <trk>
          <name>Instrumented Track</name>
          <extensions><tp:trackMeta source="unit-test" /></extensions>
          <trkseg>
            <trkpt lat="43.1" lon="42.1">
              <ele>620</ele>
              <geoidheight>17.5</geoidheight>
              <time>2024-05-25T08:00:00Z</time>
              <fix>3d</fix>
              <sat>8</sat>
              <hdop>0.9</hdop>
              <vdop>1.2</vdop>
              <pdop>1.8</pdop>
              <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>123</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
            </trkpt>
            <trkpt lat="43.101" lon="42.101">
              <ele>625</ele>
              <time>2024-05-25T08:01:00Z</time>
            </trkpt>
          </trkseg>
        </trk>
      </gpx>`,
      "instrumented.gpx"
    );

    expect(result.importedSummary).toMatchObject({
      mode: "imported_summary",
      totalDistanceMeters: 1234.5,
      totalDistance3dMeters: 1240.25,
      elevationGainMeters: 67,
      elevationLossMeters: 45,
      totalDurationSeconds: 700,
      movingDurationSeconds: 600,
      stoppedDurationSeconds: 100,
      maxSpeedKmh: 12.5,
      minElevationMeters: 620,
      maxElevationMeters: 645,
      elevationRangeMeters: 25,
      sourceTag: "gpx_extensions"
    });
    expect(result.provenance).toMatchObject({
      format: "gpx",
      pointCount: 2,
      segmentCount: 1
    });
    expect(result.provenance?.rawExtensions.gpx[0] ?? "").toContain("tp:summary");
    expect(result.provenance?.rawExtensions.tracks[0] ?? "").toContain("tp:trackMeta");
    const firstPoint = result.points[0];
    expect(firstPoint).toMatchObject({
      fix: "3d",
      satellites: 8,
      hdop: 0.9,
      vdop: 1.2,
      pdop: 1.8,
      geoidHeight: 17.5
    });
    expect(firstPoint?.rawExtensions?.[0] ?? "").toContain("TrackPointExtension");
    expect(firstPoint?.timeText).toBe("2024-05-25T08:00:00Z");
  });

  it("does not infer activity from GPX link URLs", () => {
    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx creator="Trail source" version="1.1"
        xmlns="http://www.topografix.com/GPX/1/1">
        <metadata>
          <name>Sequoia national park</name>
          <link href="https://example.test/hiking-trails/sequoia-national-park-27123231">
            <text>Sequoia national park hiking route</text>
          </link>
        </metadata>
        <trk>
          <name>Sequoia national park trail</name>
          <trkseg>
            <trkpt lat="36.566844" lon="-118.774897">
              <ele>2043.033</ele>
              <time>2018-07-31T10:50:19Z</time>
            </trkpt>
            <trkpt lat="36.566757" lon="-118.774803">
              <ele>1971.023</ele>
              <time>2018-07-31T10:50:20Z</time>
            </trkpt>
          </trkseg>
        </trk>
      </gpx>`,
      "sequoia-national-park.gpx"
    );

    expect(result.provenance).not.toHaveProperty("sourceActivity");
    expect(result.activity).toBeNull();
  });

  it("maps Garmin TrackStatsExtension summary fields to imported summary metrics", () => {
    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" creator="Garmin Connect"
        xmlns="http://www.topografix.com/GPX/1/1"
        xmlns:gpxtrkx="http://www.garmin.com/xmlschemas/TrackStatsExtension/v1">
        <metadata>
          <extensions>
            <gpxtrkx:TrackStatsExtension>
              <gpxtrkx:Distance>1234.5</gpxtrkx:Distance>
              <gpxtrkx:TimerTime>700</gpxtrkx:TimerTime>
              <gpxtrkx:MovingTime>600</gpxtrkx:MovingTime>
              <gpxtrkx:StoppedTime>100</gpxtrkx:StoppedTime>
              <gpxtrkx:MovingSpeed>1.5</gpxtrkx:MovingSpeed>
              <gpxtrkx:MaxSpeed>10</gpxtrkx:MaxSpeed>
              <gpxtrkx:Ascent>67</gpxtrkx:Ascent>
              <gpxtrkx:Descent>45</gpxtrkx:Descent>
              <gpxtrkx:MinElevation>620</gpxtrkx:MinElevation>
              <gpxtrkx:MaxElevation>645</gpxtrkx:MaxElevation>
            </gpxtrkx:TrackStatsExtension>
          </extensions>
        </metadata>
        <trk>
          <name>Garmin Summary</name>
          <trkseg>
            <trkpt lat="43.1" lon="42.1"><ele>620</ele></trkpt>
            <trkpt lat="43.101" lon="42.101"><ele>645</ele></trkpt>
          </trkseg>
        </trk>
      </gpx>`,
      "garmin-summary.gpx"
    );

    expect(result.importedSummary).toMatchObject({
      mode: "imported_summary",
      totalDistanceMeters: 1234.5,
      totalDurationSeconds: 700,
      movingDurationSeconds: 600,
      stoppedDurationSeconds: 100,
      movingAverageSpeedKmh: 5.4,
      maxSpeedKmh: 36,
      elevationGainMeters: 67,
      elevationLossMeters: 45,
      minElevationMeters: 620,
      maxElevationMeters: 645,
      elevationRangeMeters: null,
      sourceTag: "gpx_extensions"
    });
  });

  it("maps Garmin TrackStatsExtension TotalElapsedTime to imported total duration", () => {
    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" creator="Garmin Connect"
        xmlns="http://www.topografix.com/GPX/1/1"
        xmlns:gpxtrkx="http://www.garmin.com/xmlschemas/TrackStatsExtension/v1">
        <metadata>
          <extensions>
            <gpxtrkx:TrackStatsExtension>
              <gpxtrkx:TotalElapsedTime>812</gpxtrkx:TotalElapsedTime>
            </gpxtrkx:TrackStatsExtension>
          </extensions>
        </metadata>
        <trk>
          <trkseg>
            <trkpt lat="43.1" lon="42.1" />
            <trkpt lat="43.101" lon="42.101" />
          </trkseg>
        </trk>
      </gpx>`,
      "garmin-total-elapsed.gpx"
    );

    expect(result.importedSummary).toMatchObject({
      mode: "imported_summary",
      totalDurationSeconds: 812,
      sourceTag: "gpx_extensions"
    });
  });

  it("marks explicit barometric elevation source from point extensions", () => {
    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:tp="https://example.test/frame-your-trail">
        <trk><trkseg>
          <trkpt lat="55.1" lon="37.1">
            <ele>180.5</ele>
            <time>2024-05-25T08:00:00Z</time>
            <extensions><tp:elevationSource>barometric</tp:elevationSource></extensions>
          </trkpt>
        </trkseg></trk>
      </gpx>`,
      "barometric-source.gpx"
    );

    expect(result.elevationSource).toBe("barometric");
    expect(result.points[0]).toMatchObject({
      elevation: 180.5,
      elevationSource: "barometric",
      elevationDatum: "unknown",
      elevationNormalization: null
    });
  });

  it("preserves explicit barometric elevation source when point elevation is missing", () => {
    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:tp="https://example.test/frame-your-trail">
        <trk><trkseg>
          <trkpt lat="55.1" lon="37.1">
            <time>2024-05-25T08:00:00Z</time>
            <extensions><tp:elevationSource>barometric</tp:elevationSource></extensions>
          </trkpt>
        </trkseg></trk>
      </gpx>`,
      "barometric-source-no-elevation.gpx"
    );

    expect(result.hasElevation).toBe(false);
    expect(result.elevationSource).toBe("barometric");
    expect(result.points[0]).toMatchObject({
      elevation: null,
      elevationSource: "barometric"
    });
  });

  it("normalizes explicit ellipsoid elevation using GPX geoid height", () => {
    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:tp="https://example.test/frame-your-trail">
        <trk><trkseg>
          <trkpt lat="55.1" lon="37.1">
            <ele>180.5</ele>
            <geoidheight>20.25</geoidheight>
            <time>2024-05-25T08:00:00Z</time>
            <extensions><tp:elevationDatum>ellipsoid</tp:elevationDatum></extensions>
          </trkpt>
        </trkseg></trk>
      </gpx>`,
      "ellipsoid-height.gpx"
    );

    expect(result.elevationSource).toBe("gpx");
    expect(result.points[0]).toMatchObject({
      elevation: 160.25,
      geoidHeight: 20.25,
      elevationDatum: "ellipsoid",
      elevationNormalization: {
        applied: true,
        from: "ellipsoid",
        to: "msl",
        geoidHeightMeters: 20.25
      }
    });
  });

  it("keeps points when elevation is missing", () => {
    const result = parseGpx(fixture("no-elevation.gpx"), "no-elevation.gpx");

    expect(result.points).toHaveLength(2);
    expect(result.hasElevation).toBe(false);
    expect(result.hasTime).toBe(true);
    expect(result.points[0].elevation).toBeNull();
  });

  it("treats sparse non-zero values in a zero-filled elevation series as missing elevation", () => {
    const points = Array.from(
      { length: 40 },
      (_item, index) => `
        <trkpt lat="${43.1 + index * 0.001}" lon="42.1">
          <ele>${index === 30 ? 161 : 0}</ele>
          <time>2024-05-25T08:${String(index).padStart(2, "0")}:00Z</time>
        </trkpt>`
    ).join("");
    const result = parseGpx(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`, "casio.gpx");

    expect(result.hasElevation).toBe(false);
    expect(result.points.every((point) => point.elevation === null)).toBe(true);
  });

  it("preserves explicit barometric source when zero-filled elevation cleanup removes elevation", () => {
    const points = Array.from(
      { length: 40 },
      (_item, index) => `
        <trkpt lat="${43.1 + index * 0.001}" lon="42.1">
          <ele>${index === 30 ? 161 : 0}</ele>
          <time>2024-05-25T08:${String(index).padStart(2, "0")}:00Z</time>
          ${
            index === 10
              ? "<extensions><tp:elevationSource>barometric</tp:elevationSource></extensions>"
              : ""
          }
        </trkpt>`
    ).join("");
    const result = parseGpx(
      `<gpx xmlns:tp="https://example.test/frame-your-trail"><trk><trkseg>${points}</trkseg></trk></gpx>`,
      "casio-barometric.gpx"
    );

    expect(result.hasElevation).toBe(false);
    expect(result.elevationSource).toBe("barometric");
    expect(result.points.every((point) => point.elevation === null)).toBe(true);
    expect(result.points[10]).toMatchObject({
      elevation: null,
      elevationSource: "barometric"
    });
  });

  it("records zero-filled elevation placeholder normalization provenance", () => {
    const points = Array.from({ length: 40 }, (_item, index) => {
      const elevation = index === 39 ? 30 : 0;
      return `<trkpt lat="${55 + index * 0.0001}" lon="37"><ele>${elevation}</ele></trkpt>`;
    }).join("");

    const parsed = parseGpx(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`, "zeroes.gpx");

    expect(parsed.points.every((point) => point.elevation === null)).toBe(true);
    expect(parsed.provenance?.normalizations).toContainEqual({
      type: "zero_filled_elevation_placeholder",
      appliedPointCount: 40,
      reason: "dominant_zero_series_with_sparse_non_zero_outliers"
    });
  });

  it("keeps points when time is missing", () => {
    const result = parseGpx(fixture("no-time.gpx"), "no-time.gpx");

    expect(result.points).toHaveLength(2);
    expect(result.hasElevation).toBe(true);
    expect(result.hasTime).toBe(false);
    expect(result.points[0].timestamp).toBeNull();
  });

  it("records flat timestamp normalization provenance per segment", () => {
    const points = Array.from({ length: 3 }, (_item, index) => {
      return `<trkpt lat="${55 + index * 0.001}" lon="37"><time>2026-06-02T08:00:00Z</time></trkpt>`;
    }).join("");

    const parsed = parseGpx(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`, "flat.gpx");

    expect(parsed.points.every((point) => point.timestamp === null)).toBe(true);
    expect(parsed.provenance?.normalizations).toContainEqual({
      type: "flat_timestamp_placeholder",
      appliedPointCount: 3,
      segmentKeys: [0],
      reason: "flat_timestamp_segment"
    });
  });

  it("records synthetic timestamp normalization provenance per segment", () => {
    const points = Array.from({ length: 8 }, (_item, index) => {
      const longitude = index % 2 === 0 ? 37 : 38;
      const time = new Date(Date.UTC(2026, 5, 2, 8, 0, index)).toISOString();
      return `<trkpt lat="55" lon="${longitude}"><time>${time}</time></trkpt>`;
    }).join("");

    const parsed = parseGpx(`<gpx><trk><trkseg>${points}</trkseg></trk></gpx>`, "synthetic.gpx");

    expect(parsed.points.every((point) => point.timestamp === null)).toBe(true);
    expect(parsed.provenance?.normalizations).toContainEqual({
      type: "synthetic_timestamp_placeholder",
      appliedPointCount: 8,
      segmentKeys: [0],
      reason: "regular_cadence_with_repeated_impossible_geometry"
    });
  });

  it("keeps normalization provenance empty when no cleanup is applied", () => {
    const parsed = parseGpx(
      `<gpx><trk><trkseg>
        <trkpt lat="55" lon="37"><ele>120</ele><time>2026-06-02T08:00:00Z</time></trkpt>
        <trkpt lat="55.001" lon="37.001"><ele>121</ele><time>2026-06-02T08:01:00Z</time></trkpt>
      </trkseg></trk></gpx>`,
      "clean.gpx"
    );

    expect(parsed.provenance?.normalizations).toEqual([]);
  });

  it("treats high-precision regular short-cadence timestamps as missing when geometry broadly contradicts time", () => {
    const points = Array.from(
      { length: 9 },
      (_item, index) => `
          <trkpt lat="${(51.4 + index * 0.05).toFixed(6)}" lon="${(86.02 + index * 0.05).toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
    ).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "geometry-inconsistent-time.gpx"
    );

    expect(result.hasTime).toBe(false);
    expect(result.points.every((point) => point.timestamp === null)).toBe(true);
    expect(result.points.every((point) => point.timeZoneStatus === "none")).toBe(true);
  });

  it("treats regular synthetic timestamps as missing when sparse long route legs contradict time", () => {
    const points = Array.from({ length: 140 }, (_item, index) => {
      const sparseLegOffset = Math.floor(index / 20) * 0.05;

      return `
          <trkpt lat="${(51.4 + sparseLegOffset + index * 0.00001).toFixed(6)}" lon="86.020000">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`;
    }).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "sparse-long-leg-synthetic-time.gpx"
    );

    expect(result.hasTime).toBe(false);
    expect(result.points.every((point) => point.timestamp === null)).toBe(true);
    expect(result.points.every((point) => point.timeZoneStatus === "none")).toBe(true);
  });

  it("treats regular synthetic timestamps as missing when repeated route-progressing impossible legs have low distance share", () => {
    const points = Array.from({ length: 650 }, (_item, index) => {
      const routeProgressingJumpOffset = Math.floor(index / 90) * 0.006;

      return `
          <trkpt lat="${(43.1 + index * 0.00018 + routeProgressingJumpOffset).toFixed(6)}" lon="42.100000">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`;
    }).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "low-share-route-progressing-synthetic-time.gpx"
    );

    expect(result.hasTime).toBe(false);
    expect(result.points.every((point) => point.timestamp === null)).toBe(true);
    expect(result.points.every((point) => point.timeZoneStatus === "none")).toBe(true);
  });

  it("treats repeated alternating impossible out-and-back legs as missing time", () => {
    const coordinates = Array.from({ length: 9 }, (_item, index) =>
      index % 2 === 0 ? [43.1, 42.1] : [43.1, 42.3]
    );
    const points = coordinates
      .map(
        ([latitude, longitude], index) => `
          <trkpt lat="${latitude.toFixed(6)}" lon="${longitude.toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
      )
      .join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "alternating-out-and-back-synthetic-time.gpx"
    );

    expect(result.hasTime).toBe(false);
    expect(result.points.every((point) => point.timestamp === null)).toBe(true);
    expect(result.points.every((point) => point.timeZoneStatus === "none")).toBe(true);
  });

  it("keeps regular timestamps for car-like speeds below the synthetic-time threshold", () => {
    const points = Array.from(
      { length: 9 },
      (_item, index) => `
          <trkpt lat="${(43.1 + index * 0.0036).toFixed(6)}" lon="42.100000">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
    ).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "car-like-regular-time.gpx"
    );

    expect(result.hasTime).toBe(true);
    expect(result.points.every((point) => point.timestamp instanceof Date)).toBe(true);
    expect(result.points.every((point) => point.timeZoneStatus === "explicit")).toBe(true);
  });

  it("keeps high-precision timestamps when metadata is much earlier and speeds are plausible", () => {
    const points = Array.from(
      { length: 8 },
      (_item, index) => `
          <trkpt lat="${(43.1 + index * 0.00005).toFixed(6)}" lon="${(42.1 + index * 0.00005).toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
    ).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <metadata>
          <time>2011-09-07T07:27:40.826Z</time>
        </metadata>
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "plausible-high-precision-time.gpx"
    );

    expect(result.hasTime).toBe(true);
    expect(result.points[0].timestamp?.toISOString()).toBe("2026-05-16T11:12:30.163Z");
    expect(result.points.at(-1)?.timestamp?.toISOString()).toBe("2026-05-16T11:13:05.163Z");
  });

  it("normalizes synthetic timestamps per segment without clearing plausible neighboring segments", () => {
    const syntheticPoints = Array.from(
      { length: 13 },
      (_item, index) => `
          <trkpt lat="${(51.4 + index * 0.05).toFixed(6)}" lon="${(86.02 + index * 0.05).toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
    ).join("");
    const plausiblePoints = Array.from(
      { length: 8 },
      (_item, index) => `
          <trkpt lat="${(43.1 + index * 0.00005).toFixed(6)}" lon="${(42.1 + index * 0.00005).toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
    ).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk>
          <trkseg>${syntheticPoints}</trkseg>
          <trkseg>${plausiblePoints}</trkseg>
        </trk>
      </gpx>`,
      "mixed-segment-synthetic-time.gpx"
    );

    const firstSegment = result.points.filter((point) => point.segmentIndex === 0);
    const secondSegment = result.points.filter((point) => point.segmentIndex === 1);

    expect(firstSegment.every((point) => point.timestamp === null)).toBe(true);
    expect(firstSegment.every((point) => point.timeZoneStatus === "none")).toBe(true);
    expect(secondSegment[0].timestamp?.toISOString()).toBe("2026-05-16T11:12:30.163Z");
    expect(secondSegment.at(-1)?.timestamp?.toISOString()).toBe("2026-05-16T11:13:05.163Z");
    expect(secondSegment.every((point) => point.timeZoneStatus === "explicit")).toBe(true);
  });

  it("normalizes synthetic timestamps by physical segment across separate tracks", () => {
    const syntheticPoints = Array.from(
      { length: 13 },
      (_item, index) => `
          <trkpt lat="${(51.4 + index * 0.05).toFixed(6)}" lon="${(86.02 + index * 0.05).toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
    ).join("");
    const plausiblePoints = Array.from(
      { length: 8 },
      (_item, index) => `
          <trkpt lat="${(43.1 + index * 0.00005).toFixed(6)}" lon="${(42.1 + index * 0.00005).toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
    ).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk>
          <trkseg>${syntheticPoints}</trkseg>
        </trk>
        <trk>
          <trkseg>${plausiblePoints}</trkseg>
        </trk>
      </gpx>`,
      "repeated-track-segment-index-synthetic-time.gpx"
    );

    const firstTrackSegment = result.points.slice(0, 13);
    const secondTrackSegment = result.points.slice(13);

    expect(result.points.map((point) => point.segmentIndex)).toEqual([
      ...Array(13).fill(0),
      ...Array(8).fill(1)
    ]);
    expect(firstTrackSegment.every((point) => point.timestamp === null)).toBe(true);
    expect(firstTrackSegment.every((point) => point.timeZoneStatus === "none")).toBe(true);
    expect(secondTrackSegment[0].timestamp?.toISOString()).toBe("2026-05-16T11:12:30.163Z");
    expect(secondTrackSegment.at(-1)?.timestamp?.toISOString()).toBe("2026-05-16T11:13:05.163Z");
    expect(secondTrackSegment.every((point) => point.timeZoneStatus === "explicit")).toBe(true);
  });

  it("keeps high-precision timestamps globally when only one isolated teleport contradicts time", () => {
    const coordinates = [
      [43.1, 42.1],
      [43.10005, 42.10005],
      [43.1001, 42.1001],
      [43.10015, 42.10015],
      [44.0, 43.0],
      [43.1002, 42.1002],
      [43.10025, 42.10025],
      [43.1003, 42.1003],
      [43.10035, 42.10035]
    ];
    const points = coordinates
      .map(
        ([latitude, longitude], index) => `
          <trkpt lat="${latitude.toFixed(6)}" lon="${longitude.toFixed(6)}">
            <time>${highPrecisionTime(index)}</time>
          </trkpt>`
      )
      .join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <metadata>
          <time>2011-09-07T07:27:40.826Z</time>
        </metadata>
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "isolated-teleport-time.gpx"
    );

    expect(result.hasTime).toBe(true);
    expect(result.points.every((point) => point.timestamp instanceof Date)).toBe(true);
    expect(result.points.every((point) => point.timeZoneStatus === "explicit")).toBe(true);
  });

  it("keeps timestamps for a long regular-cadence track with six isolated out-and-back GPS spikes", () => {
    const spikeIndexes = new Set([60, 130, 200, 270, 340, 410]);
    const points = Array.from({ length: 520 }, (_item, index) => {
      const latitude = 43.1 + index * 0.00065;
      const longitude = 42.1 + (spikeIndexes.has(index) ? 0.02 : 0);
      const timestamp = new Date(Date.UTC(2026, 4, 16, 11, 12, 30) + index * 10000)
        .toISOString()
        .replace(".000Z", ".163733020Z");

      return `
          <trkpt lat="${latitude.toFixed(6)}" lon="${longitude.toFixed(6)}">
            <time>${timestamp}</time>
          </trkpt>`;
    }).join("");

    const result = parseGpx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <gpx version="1.1">
        <trk><trkseg>${points}</trkseg></trk>
      </gpx>`,
      "long-regular-track-isolated-spikes.gpx"
    );

    expect(result.hasTime).toBe(true);
    expect(result.points.every((point) => point.timestamp instanceof Date)).toBe(true);
    expect(result.points.every((point) => point.timeZoneStatus === "explicit")).toBe(true);
  });

  it("normalizes timezone-less GPX time as UTC and marks missing timezone provenance", () => {
    const result = parseGpx(
      `<gpx><trk><trkseg>
        <trkpt lat="43.1" lon="42.1"><time>2024-05-25T08:00:00</time></trkpt>
        <trkpt lat="43.2" lon="42.2"><time>2024-05-25T08:01:00Z</time></trkpt>
      </trkseg></trk></gpx>`,
      "timezone.gpx"
    );

    expect(result.points[0].timestamp?.toISOString()).toBe("2024-05-25T08:00:00.000Z");
    expect(result.points[0].timeZoneStatus).toBe("missing");
    expect(result.points[1].timeZoneStatus).toBe("explicit");
  });

  it("throws a typed error for invalid XML", () => {
    expect(() => parseGpx(fixture("broken.gpx"), "broken.gpx")).toThrow(GpxParseError);
  });

  it("throws a typed error when track points are absent", () => {
    expect(() => parseGpx("<gpx></gpx>", "empty.gpx")).toThrow("GPX does not contain points");
  });

  it("throws a typed error when a point is missing coordinates", () => {
    expect(() =>
      parseGpx('<gpx><trk><trkseg><trkpt lon="42.1" /></trkseg></trk></gpx>', "missing-lat.gpx")
    ).toThrow("Point 1 does not contain coordinates");
  });

  it("throws a typed error when coordinates are outside geographic bounds", () => {
    expect(() =>
      parseGpx(
        '<gpx><trk><trkseg><trkpt lat="91" lon="42.1" /></trkseg></trk></gpx>',
        "bad-lat.gpx"
      )
    ).toThrow("Point 1 contains coordinates outside geographic bounds");
    expect(() =>
      parseGpx(
        '<gpx><trk><trkseg><trkpt lat="43.1" lon="181" /></trkseg></trk></gpx>',
        "bad-lon.gpx"
      )
    ).toThrow("Point 1 contains coordinates outside geographic bounds");
  });

  it("normalizes malformed optional elevation and time values", () => {
    const result = parseGpx(
      '<gpx><trk><trkseg><trkpt lat="43.1" lon="42.1"><ele>high</ele><time>soon</time></trkpt></trkseg></trk></gpx>',
      "optional-values.gpx"
    );

    expect(result.points[0].elevation).toBeNull();
    expect(result.points[0].timestamp).toBeNull();
    expect(result.hasElevation).toBe(false);
    expect(result.hasTime).toBe(false);
  });
});
