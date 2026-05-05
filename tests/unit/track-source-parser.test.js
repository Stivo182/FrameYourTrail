import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTrackSourceFormat,
  isSupportedTrackSourceFile,
  parseTrackSource
} from "../../src/core/track-source-parser.js";
import { GpxParseError } from "../../src/core/gpx-parser.js";

function readFixtureArrayBuffer(name) {
  const bytes = readFileSync(resolve("tests/fixtures", name));
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}

afterEach(() => {
  vi.doUnmock("../../src/core/fit-parser.js");
});

describe("track source parser facade", () => {
  it("detects GPX, TCX, and FIT from extension and media types", () => {
    expect(getTrackSourceFormat("route.gpx", "")).toBe("gpx");
    expect(getTrackSourceFormat("route.GPX", "")).toBe("gpx");
    expect(getTrackSourceFormat("route.xml", "application/gpx+xml")).toBe("gpx");
    expect(getTrackSourceFormat("route.xml", "application/xml")).toBe("gpx");
    expect(getTrackSourceFormat("activity.fit", "application/octet-stream")).toBe("fit");
    expect(getTrackSourceFormat("workout.tcx", "application/vnd.garmin.tcx+xml")).toBe("tcx");
  });

  it("keeps the current file support policy in one shared helper", () => {
    expect(isSupportedTrackSourceFile(new File(["<gpx></gpx>"], "route.gpx", { type: "" }))).toBe(
      true
    );
    expect(
      isSupportedTrackSourceFile(new File(["<gpx></gpx>"], "route.xml", { type: "text/xml" }))
    ).toBe(true);
    expect(
      isSupportedTrackSourceFile(
        new File(["fit"], "activity.fit", { type: "application/octet-stream" })
      )
    ).toBe(true);
    expect(
      isSupportedTrackSourceFile(
        new File(["<TrainingCenterDatabase />"], "workout.tcx", { type: "application/xml" })
      )
    ).toBe(true);
    expect(isSupportedTrackSourceFile(null)).toBe(false);
  });

  it("parses GPX through the facade into a route source", async () => {
    const source = `<gpx>
      <trk>
        <name>Facade Track</name>
        <trkseg>
          <trkpt lat="43.1" lon="42.1">
            <ele>620</ele>
            <time>2024-05-25T08:00:00Z</time>
          </trkpt>
          <trkpt lat="43.2" lon="42.2">
            <ele>640</ele>
            <time>2024-05-25T08:10:00Z</time>
          </trkpt>
        </trkseg>
      </trk>
    </gpx>`;

    const result = await parseTrackSource(source, "facade.gpx");

    expect(result.source).toEqual({
      format: "gpx",
      parser: "gpx-parser",
      fileName: "facade.gpx",
      name: "Facade Track"
    });
    expect(result.provenance).toMatchObject({
      format: "gpx",
      pointCount: 2,
      segmentCount: 1
    });
    expect(result.points).toHaveLength(2);
  });

  it("parses GPX-like generic XML variants through the GPX facade path", async () => {
    const trackXml = `<activity>
      <trk>
        <name>Wrapped Track</name>
        <trkseg>
          <trkpt lat="43.1" lon="42.1" />
          <trkpt lat="43.2" lon="42.2" />
        </trkseg>
      </trk>
    </activity>`;
    const routeXml = `<route>
      <rte>
        <name>Wrapped Route</name>
        <rtept lat="43.3" lon="42.3" />
        <rtept lat="43.4" lon="42.4" />
      </rte>
    </route>`;

    const trackResult = await parseTrackSource(trackXml, "wrapped.xml", {
      mediaType: "application/xml"
    });
    const routeResult = await parseTrackSource(routeXml, "route.xml", {
      mediaType: "application/xml"
    });

    expect(trackResult.source).toMatchObject({ format: "gpx", parser: "gpx-parser" });
    expect(trackResult.points.map((point) => [point.latitude, point.longitude])).toEqual([
      [43.1, 42.1],
      [43.2, 42.2]
    ]);
    expect(routeResult.source).toMatchObject({ format: "gpx", parser: "gpx-parser" });
    expect(routeResult.points.map((point) => [point.latitude, point.longitude])).toEqual([
      [43.3, 42.3],
      [43.4, 42.4]
    ]);
  });

  it("rejects XML without GPX track or route points through the GPX facade path", async () => {
    await expect(
      parseTrackSource(`<gpx><wpt lat="43.1" lon="42.1" /></gpx>`, "waypoints.xml", {
        mediaType: "application/xml"
      })
    ).rejects.toMatchObject({
      name: "GpxParseError",
      code: "empty_track"
    });

    await expect(
      parseTrackSource(
        `<kml><Document><Placemark><Point><coordinates>42.1,43.1</coordinates></Point></Placemark></Document></kml>`,
        "route.xml",
        { mediaType: "application/xml" }
      )
    ).rejects.toMatchObject({
      name: "GpxParseError",
      code: "empty_track"
    });
  });

  it("parses TCX through the facade into a route source", async () => {
    const source = `<TrainingCenterDatabase>
      <Activities>
        <Activity>
          <Id>2024-05-25T08:00:00Z</Id>
          <Lap>
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:00:00Z</Time>
                <Position><LatitudeDegrees>43.1</LatitudeDegrees><LongitudeDegrees>42.1</LongitudeDegrees></Position>
              </Trackpoint>
              <Trackpoint>
                <Time>2024-05-25T08:10:00Z</Time>
                <Position><LatitudeDegrees>43.2</LatitudeDegrees><LongitudeDegrees>42.2</LongitudeDegrees></Position>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = await parseTrackSource(source, "facade.tcx");

    expect(result.source).toEqual({
      format: "tcx",
      parser: "tcx-parser",
      fileName: "facade.tcx",
      name: "facade"
    });
    expect(result.provenance).toMatchObject({
      format: "tcx",
      pointCount: 2,
      segmentCount: 1
    });
  });

  it("uses extension precedence before XML media type fallback", async () => {
    const tcxSource = `<TrainingCenterDatabase>
      <Activities>
        <Activity>
          <Lap>
            <Track>
              <Trackpoint>
                <Position><LatitudeDegrees>43.1</LatitudeDegrees><LongitudeDegrees>42.1</LongitudeDegrees></Position>
              </Trackpoint>
              <Trackpoint>
                <Position><LatitudeDegrees>43.2</LatitudeDegrees><LongitudeDegrees>42.2</LongitudeDegrees></Position>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    expect(getTrackSourceFormat("workout.tcx", "application/xml")).toBe("tcx");
    expect(getTrackSourceFormat("route.gpx", "application/vnd.garmin.tcx+xml")).toBe("gpx");

    await expect(
      parseTrackSource(tcxSource, "workout.xml", {
        mediaType: "application/vnd.garmin.tcx+xml"
      })
    ).resolves.toMatchObject({
      source: { format: "tcx", parser: "tcx-parser", fileName: "workout.xml" },
      provenance: { format: "tcx", pointCount: 2 }
    });
  });

  it("parses a real binary FIT fixture through the facade into a route source", async () => {
    const result = await parseTrackSource(
      readFixtureArrayBuffer("minimal-activity.fit"),
      "minimal-activity.fit",
      { mediaType: "application/octet-stream" }
    );

    expect(result.source).toEqual({
      format: "fit",
      parser: "fit-file-parser",
      fileName: "minimal-activity.fit",
      name: "minimal-activity"
    });
    expect(result.points).toHaveLength(3);
    expect(result.provenance).toMatchObject({
      format: "fit",
      pointCount: 3
    });
  });

  it("does not import the FIT parser for GPX or TCX parsing", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/fit-parser.js", () => {
      throw new Error("FIT parser should not be imported");
    });
    const { parseTrackSource: isolatedParseTrackSource } =
      await import("../../src/core/track-source-parser.js");

    await expect(
      isolatedParseTrackSource(
        `<gpx><trk><trkseg>
          <trkpt lat="43.1" lon="42.1" />
          <trkpt lat="43.2" lon="42.2" />
        </trkseg></trk></gpx>`,
        "route.gpx"
      )
    ).resolves.toMatchObject({ source: { format: "gpx", parser: "gpx-parser" } });

    await expect(
      isolatedParseTrackSource(
        `<TrainingCenterDatabase><Activities><Activity><Lap><Track>
          <Trackpoint><Position><LatitudeDegrees>43.1</LatitudeDegrees><LongitudeDegrees>42.1</LongitudeDegrees></Position></Trackpoint>
          <Trackpoint><Position><LatitudeDegrees>43.2</LatitudeDegrees><LongitudeDegrees>42.2</LongitudeDegrees></Position></Trackpoint>
        </Track></Lap></Activity></Activities></TrainingCenterDatabase>`,
        "route.tcx"
      )
    ).resolves.toMatchObject({ source: { format: "tcx", parser: "tcx-parser" } });
  });

  it("rejects unsupported formats with an explicit parser error", async () => {
    await expect(parseTrackSource("text", "notes.txt")).rejects.toBeInstanceOf(GpxParseError);
    await expect(parseTrackSource("text", "notes.txt")).rejects.toMatchObject({
      message: "Unsupported track format",
      code: "unsupported_format"
    });
  });

  it("rejects broken FIT through the facade parse-error path", async () => {
    await expect(parseTrackSource(new ArrayBuffer(0), "activity.fit")).rejects.toMatchObject({
      name: "GpxParseError",
      code: "parse_error"
    });
  });

  it("rejects bad source shapes for supported parser paths", async () => {
    await expect(parseTrackSource("not xml", "bad.gpx")).rejects.toMatchObject({
      name: "GpxParseError",
      code: "not_xml"
    });

    await expect(parseTrackSource(new ArrayBuffer(8), "array-buffer.gpx")).rejects.toMatchObject({
      name: "GpxParseError",
      code: "parse_error"
    });

    await expect(parseTrackSource(new ArrayBuffer(8), "array-buffer.tcx")).rejects.toMatchObject({
      name: "GpxParseError",
      code: "parse_error"
    });

    await expect(parseTrackSource("FIT text", "activity.fit")).rejects.toMatchObject({
      name: "GpxParseError",
      code: "parse_error"
    });
  });
});
