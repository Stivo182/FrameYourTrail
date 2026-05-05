import { describe, expect, it } from "vitest";

import { GpxParseError } from "../../src/core/gpx-parser.js";
import { parseTcx } from "../../src/core/tcx-parser.js";

const MINIMAL_TCX = `<TrainingCenterDatabase>
  <Activities>
    <Activity Sport="Biking">
      <Id>2024-05-25T08:00:00Z</Id>
      <Lap StartTime="2024-05-25T08:00:00Z">
        <TotalTimeSeconds>600</TotalTimeSeconds>
        <DistanceMeters>2400</DistanceMeters>
        <MaximumSpeed>7.5</MaximumSpeed>
        <Calories>120</Calories>
        <Track>
          <Trackpoint>
            <Time>2024-05-25T08:00:00Z</Time>
            <Position><LatitudeDegrees>43.1</LatitudeDegrees><LongitudeDegrees>42.1</LongitudeDegrees></Position>
            <AltitudeMeters>620</AltitudeMeters>
            <DistanceMeters>0</DistanceMeters>
          </Trackpoint>
          <Trackpoint>
            <Time>2024-05-25T08:10:00Z</Time>
            <Position><LatitudeDegrees>43.2</LatitudeDegrees><LongitudeDegrees>42.2</LongitudeDegrees></Position>
            <AltitudeMeters>640</AltitudeMeters>
            <DistanceMeters>2400</DistanceMeters>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

describe("TCX parser", () => {
  it("reads explicit activity from tcx Activity Sport", () => {
    const parsed = parseTcx(
      `<?xml version="1.0" encoding="UTF-8"?>
      <TrainingCenterDatabase>
        <Activities>
          <Activity Sport="Biking">
            <Lap StartTime="2024-05-25T08:00:00Z">
              <Track>
                <Trackpoint>
                  <Time>2024-05-25T08:00:00Z</Time>
                  <Position><LatitudeDegrees>43.1</LatitudeDegrees><LongitudeDegrees>42.1</LongitudeDegrees></Position>
                </Trackpoint>
              </Track>
            </Lap>
          </Activity>
        </Activities>
      </TrainingCenterDatabase>`,
      "ride.tcx"
    );

    expect(parsed.activity).toEqual({
      type: "bike",
      source: "tcx_activity_sport",
      raw: "Biking"
    });
  });

  it("parses trackpoints and lap summary", () => {
    const result = parseTcx(MINIMAL_TCX, "workout.tcx");

    expect(result.name).toBe("workout");
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({
      latitude: 43.1,
      longitude: 42.1,
      elevation: 620,
      elevationSource: "gpx",
      distanceMeters: 0,
      segmentIndex: 0,
      timeText: "2024-05-25T08:00:00Z",
      timeZoneStatus: "explicit"
    });
    expect(result.importedSummary).toMatchObject({
      totalDistanceMeters: 2400,
      totalDurationSeconds: 600,
      movingDurationSeconds: 600,
      maxSpeedKmh: 27,
      sourceTag: "tcx_lap"
    });
    expect(result.provenance).toMatchObject({
      format: "tcx",
      pointCount: 2,
      segmentCount: 1
    });
    expect(result.hasElevation).toBe(true);
    expect(result.hasTime).toBe(true);
    expect(result.elevationSource).toBe("gpx");
  });

  it("aggregates multiple laps as separate segments and a combined imported summary", () => {
    const source = `<TrainingCenterDatabase>
      <Activities>
        <Activity Sport="Biking">
          <Lap StartTime="2024-05-25T08:00:00Z">
            <TotalTimeSeconds>300</TotalTimeSeconds>
            <DistanceMeters>1000</DistanceMeters>
            <MaximumSpeed>5</MaximumSpeed>
            <Calories>50</Calories>
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:00:00Z</Time>
                <Position><LatitudeDegrees>43.1</LatitudeDegrees><LongitudeDegrees>42.1</LongitudeDegrees></Position>
              </Trackpoint>
              <Trackpoint>
                <Time>2024-05-25T08:05:00Z</Time>
                <Position><LatitudeDegrees>43.2</LatitudeDegrees><LongitudeDegrees>42.2</LongitudeDegrees></Position>
              </Trackpoint>
            </Track>
          </Lap>
          <Lap StartTime="2024-05-25T08:05:00Z">
            <TotalTimeSeconds>600</TotalTimeSeconds>
            <DistanceMeters>2000</DistanceMeters>
            <MaximumSpeed>8</MaximumSpeed>
            <Calories>90</Calories>
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:05:30Z</Time>
                <Position><LatitudeDegrees>43.3</LatitudeDegrees><LongitudeDegrees>42.3</LongitudeDegrees></Position>
              </Trackpoint>
              <Trackpoint>
                <Time>2024-05-25T08:15:00Z</Time>
                <Position><LatitudeDegrees>43.4</LatitudeDegrees><LongitudeDegrees>42.4</LongitudeDegrees></Position>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = parseTcx(source, "two-laps.tcx");

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 0, 1, 1]);
    expect(result.provenance).toMatchObject({
      format: "tcx",
      pointCount: 4,
      lapCount: 2,
      segmentCount: 2
    });
    expect(result.importedSummary).toMatchObject({
      totalDistanceMeters: 3000,
      totalDurationSeconds: 900,
      movingDurationSeconds: 900,
      calories: 140,
      maxSpeedKmh: 28.8,
      sourceTag: "tcx_lap"
    });
  });

  it("parses namespaced activity extension sensor fields with provenance", () => {
    const source = `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
      xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
      <Activities>
        <Activity Sport="Running">
          <Id>2024-05-25T08:00:00Z</Id>
          <Lap StartTime="2024-05-25T08:00:00Z">
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:00:00Z</Time>
                <Position>
                  <LatitudeDegrees>43.1</LatitudeDegrees>
                  <LongitudeDegrees>42.1</LongitudeDegrees>
                </Position>
                <Extensions>
                  <ns3:TPX>
                    <ns3:Speed>3.4</ns3:Speed>
                    <ns3:RunCadence>82</ns3:RunCadence>
                    <ns3:Watts>210</ns3:Watts>
                  </ns3:TPX>
                </Extensions>
              </Trackpoint>
              <Trackpoint>
                <Time>2024-05-25T08:00:01Z</Time>
                <Position>
                  <LatitudeDegrees>43.2</LatitudeDegrees>
                  <LongitudeDegrees>42.2</LongitudeDegrees>
                </Position>
                <Extensions>
                  <ns3:TPX>
                    <ns3:Speed>3.6</ns3:Speed>
                  </ns3:TPX>
                </Extensions>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = parseTcx(source, "activity-extension.tcx");

    expect(result.points[0].tcxActivityExtension).toEqual({
      speedMetersPerSecond: 3.4,
      speedKmh: 12.24,
      runCadence: 82,
      watts: 210
    });
    expect(result.points[1].tcxActivityExtension).toEqual({
      speedMetersPerSecond: 3.6,
      speedKmh: 12.96,
      runCadence: null,
      watts: null
    });
    expect(result.points[0].rawExtensions?.[0]).toContain("ActivityExtension/v2");
    expect(result.provenance.trackpointExtensions).toEqual({
      source: "tcx_activity_extension",
      pointCount: 2,
      speedCount: 2,
      runCadenceCount: 1,
      wattsCount: 1
    });
  });

  it("ignores unrelated extension namespaces while preserving raw extension XML", () => {
    const source = `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
      xmlns:vendor="https://example.com/vendor">
      <Activities>
        <Activity Sport="Running">
          <Id>2024-05-25T08:00:00Z</Id>
          <Lap StartTime="2024-05-25T08:00:00Z">
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:00:00Z</Time>
                <Position>
                  <LatitudeDegrees>43.1</LatitudeDegrees>
                  <LongitudeDegrees>42.1</LongitudeDegrees>
                </Position>
                <Extensions>
                  <vendor:TPX>
                    <vendor:Speed>3.4</vendor:Speed>
                  </vendor:TPX>
                </Extensions>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = parseTcx(source, "vendor-extension.tcx");

    expect(result.points[0].tcxActivityExtension).toBeNull();
    expect(result.points[0].rawExtensions?.[0]).toContain("https://example.com/vendor");
    expect(result.provenance.trackpointExtensions).toEqual({
      source: "tcx_activity_extension",
      pointCount: 0,
      speedCount: 0,
      runCadenceCount: 0,
      wattsCount: 0
    });
  });

  it("ignores mixed namespace fields inside Garmin activity extension TPX", () => {
    const source = `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
      xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
      xmlns:vendor="https://example.com/vendor">
      <Activities>
        <Activity Sport="Running">
          <Id>2024-05-25T08:00:00Z</Id>
          <Lap StartTime="2024-05-25T08:00:00Z">
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:00:00Z</Time>
                <Position>
                  <LatitudeDegrees>43.1</LatitudeDegrees>
                  <LongitudeDegrees>42.1</LongitudeDegrees>
                </Position>
                <Extensions>
                  <ns3:TPX>
                    <vendor:Speed>3.4</vendor:Speed>
                  </ns3:TPX>
                </Extensions>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = parseTcx(source, "mixed-extension.tcx");

    expect(result.points[0].tcxActivityExtension).toBeNull();
    expect(result.points[0].rawExtensions?.[0]).toContain("https://example.com/vendor");
    expect(result.provenance.trackpointExtensions).toEqual({
      source: "tcx_activity_extension",
      pointCount: 0,
      speedCount: 0,
      runCadenceCount: 0,
      wattsCount: 0
    });
  });

  it("ignores invalid numeric activity extension values", () => {
    const source = `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <Activities>
        <Activity Sport="Running">
          <Id>2024-05-25T08:00:00Z</Id>
          <Lap StartTime="2024-05-25T08:00:00Z">
            <Track>
              <Trackpoint>
                <Time>2024-05-25T08:00:00Z</Time>
                <Position>
                  <LatitudeDegrees>43.1</LatitudeDegrees>
                  <LongitudeDegrees>42.1</LongitudeDegrees>
                </Position>
                <Extensions>
                  <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
                    <Speed>fast</Speed>
                    <RunCadence>90</RunCadence>
                  </TPX>
                </Extensions>
              </Trackpoint>
            </Track>
          </Lap>
        </Activity>
      </Activities>
    </TrainingCenterDatabase>`;

    const result = parseTcx(source, "invalid-extension.tcx");

    expect(result.points[0].tcxActivityExtension).toEqual({
      speedMetersPerSecond: null,
      speedKmh: null,
      runCadence: 90,
      watts: null
    });
    expect(result.provenance.trackpointExtensions).toEqual({
      source: "tcx_activity_extension",
      pointCount: 1,
      speedCount: 0,
      runCadenceCount: 1,
      wattsCount: 0
    });
  });

  it("parses namespaced TCX elements by local name", () => {
    const source = `<tcx:TrainingCenterDatabase xmlns:tcx="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <tcx:Activities>
        <tcx:Activity Sport="Biking">
          <tcx:Id>2024-05-25T08:00:00Z</tcx:Id>
          <tcx:Lap>
            <tcx:TotalTimeSeconds>600</tcx:TotalTimeSeconds>
            <tcx:DistanceMeters>2400</tcx:DistanceMeters>
            <tcx:Track>
              <tcx:Trackpoint>
                <tcx:Time>2024-05-25T08:00:00Z</tcx:Time>
                <tcx:Position>
                  <tcx:LatitudeDegrees>43.1</tcx:LatitudeDegrees>
                  <tcx:LongitudeDegrees>42.1</tcx:LongitudeDegrees>
                </tcx:Position>
              </tcx:Trackpoint>
              <tcx:Trackpoint>
                <tcx:Time>2024-05-25T08:10:00Z</tcx:Time>
                <tcx:Position>
                  <tcx:LatitudeDegrees>43.2</tcx:LatitudeDegrees>
                  <tcx:LongitudeDegrees>42.2</tcx:LongitudeDegrees>
                </tcx:Position>
              </tcx:Trackpoint>
            </tcx:Track>
          </tcx:Lap>
        </tcx:Activity>
      </tcx:Activities>
    </tcx:TrainingCenterDatabase>`;

    const result = parseTcx(source, "prefixed.tcx");

    expect(result.name).toBe("prefixed");
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({ latitude: 43.1, longitude: 42.1 });
    expect(result.importedSummary).toMatchObject({
      totalDistanceMeters: 2400,
      totalDurationSeconds: 600
    });
  });

  it("rejects invalid XML", () => {
    expect(() => parseTcx("<TrainingCenterDatabase>", "broken.tcx")).toThrow(GpxParseError);
    expect(() => parseTcx("<TrainingCenterDatabase>", "broken.tcx")).toThrow(
      expect.objectContaining({ code: "invalid_xml" })
    );
  });

  it("rejects empty TCX files", () => {
    expect(() =>
      parseTcx("<TrainingCenterDatabase><Activities /></TrainingCenterDatabase>", "empty.tcx")
    ).toThrow(expect.objectContaining({ code: "empty_track" }));
  });

  it("rejects trackpoints without coordinates", () => {
    const source = MINIMAL_TCX.replace(
      "<Position><LatitudeDegrees>43.1</LatitudeDegrees><LongitudeDegrees>42.1</LongitudeDegrees></Position>",
      ""
    );

    expect(() => parseTcx(source, "missing.tcx")).toThrow(
      expect.objectContaining({ code: "missing_coordinates" })
    );
  });

  it("rejects out-of-bounds coordinates", () => {
    const source = MINIMAL_TCX.replace(
      "<LatitudeDegrees>43.1</LatitudeDegrees>",
      "<LatitudeDegrees>143.1</LatitudeDegrees>"
    );

    expect(() => parseTcx(source, "bounds.tcx")).toThrow(
      expect.objectContaining({ code: "coordinates_out_of_bounds" })
    );
  });
});
