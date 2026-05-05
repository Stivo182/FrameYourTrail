import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GpxParseError } from "../../src/core/gpx-parser.js";
import { normalizeFitActivity, parseFit } from "../../src/core/fit-parser.js";

function readFixtureArrayBuffer(name) {
  const bytes = readFileSync(resolve("tests/fixtures", name));
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}

afterEach(() => {
  vi.doUnmock("fit-file-parser");
});

describe("FIT parser", () => {
  it("reads explicit activity from fit session sport", () => {
    const parsed = normalizeFitActivity(
      {
        records: [
          {
            timestamp: new Date("2024-05-25T08:00:00Z"),
            position_lat: 43.1,
            position_long: 42.1
          }
        ],
        sessions: [{ sport: "cycling" }]
      },
      "ride.fit"
    );

    expect(parsed.activity).toEqual({
      type: "bike",
      source: "fit_session_sport",
      raw: "cycling"
    });
  });

  it("reads explicit activity from fit session sub sport when sport is missing", () => {
    const parsed = normalizeFitActivity(
      {
        records: [
          {
            timestamp: new Date("2024-05-25T08:00:00Z"),
            position_lat: 43.1,
            position_long: 42.1
          }
        ],
        sessions: [{ sub_sport: "mountain_biking" }]
      },
      "trail.fit"
    );

    expect(parsed.activity).toEqual({
      type: "bike",
      source: "fit_session_sub_sport",
      raw: "mountain_biking"
    });
  });

  it("parses a real binary FIT activity through fit-file-parser", async () => {
    const result = await parseFit(
      readFixtureArrayBuffer("minimal-activity.fit"),
      "minimal-activity.fit"
    );

    expect(result.name).toBe("minimal-activity");
    expect(result.points).toHaveLength(3);
    expect(result.points[0]).toMatchObject({
      elevation: 620,
      elevationSource: "barometric",
      timestamp: new Date("2024-05-25T08:00:00.000Z"),
      timeText: "2024-05-25T08:00:00.000Z",
      timeZoneStatus: "explicit"
    });
    expect(result.points[0].latitude).toBeCloseTo(43.1, 5);
    expect(result.points[0].longitude).toBeCloseTo(42.1, 5);
    expect(result.points[2]).toMatchObject({
      elevation: 700,
      timestamp: new Date("2024-05-25T08:12:00.000Z")
    });
    expect(result.points[2].latitude).toBeCloseTo(43.103, 5);
    expect(result.points[2].longitude).toBeCloseTo(42.105, 5);
    expect(result.elevationSource).toBe("barometric");
    expect(result.hasTime).toBe(true);
    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 0, 0]);
    expect(result.importedSummary).toMatchObject({
      totalDistanceMeters: 600,
      totalDurationSeconds: 720,
      movingDurationSeconds: 700,
      movingAverageSpeedKmh: 3.6,
      maxSpeedKmh: 9,
      elevationGainMeters: 80,
      elevationLossMeters: 0,
      sourceTag: "fit_session"
    });
    expect(result.provenance).toMatchObject({
      segmentCount: 1,
      segmentSource: "fit_records",
      lapBoundaryCount: 0,
      timerBreakCount: 0
    });
    expect(result.provenance?.timerEvents).toMatchObject({ count: 2 });
    expect(result.provenance?.timerEvents?.events).toEqual(
      expect.arrayContaining([
        { timestamp: "2024-05-25T08:00:00.000Z", eventType: "start" },
        { timestamp: "2024-05-25T08:11:40.000Z", eventType: "stop_all" }
      ])
    );
  });

  it("normalizes decoded FIT records, session summary, and timer provenance", () => {
    const decoded = {
      records: [
        {
          timestamp: new Date("2024-05-25T08:00:00Z"),
          position_lat: 43.1,
          position_long: 42.1,
          enhanced_altitude: 620
        },
        {
          timestamp: new Date("2024-05-25T08:10:00Z"),
          position_lat: 43.2,
          position_long: 42.2,
          altitude: 640
        }
      ],
      sessions: [
        {
          total_distance: 2400,
          total_elapsed_time: 700,
          total_timer_time: 600,
          avg_speed: 4,
          max_speed: 8,
          total_ascent: 20,
          total_descent: 5
        }
      ],
      laps: [{ start_time: new Date("2024-05-25T08:00:00Z") }],
      events: [
        { timestamp: new Date("2024-05-25T08:05:00Z"), event: "timer", event_type: "stop_all" },
        { timestamp: new Date("2024-05-25T08:06:40Z"), event: "timer", event_type: "start" }
      ]
    };

    const result = normalizeFitActivity(decoded, "activity.fit");

    expect(result.name).toBe("activity");
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toMatchObject({
      latitude: 43.1,
      longitude: 42.1,
      elevation: 620,
      elevationSource: "barometric",
      timeZoneStatus: "explicit",
      segmentIndex: 0
    });
    expect(result.importedSummary).toMatchObject({
      totalDistanceMeters: 2400,
      totalDurationSeconds: 700,
      movingDurationSeconds: 600,
      movingAverageSpeedKmh: 14.4,
      maxSpeedKmh: 28.8,
      elevationGainMeters: 20,
      elevationLossMeters: 5,
      sourceTag: "fit_session"
    });
    expect(result.provenance?.timerEvents).toEqual({
      count: 2,
      events: [
        { timestamp: "2024-05-25T08:05:00.000Z", eventType: "stop_all" },
        { timestamp: "2024-05-25T08:06:40.000Z", eventType: "start" }
      ]
    });
  });

  it("rejects FIT records missing a longitude coordinate", () => {
    expect(() =>
      normalizeFitActivity(
        {
          records: [
            {
              timestamp: new Date("2024-05-25T08:00:00Z"),
              position_lat: 43.1
            }
          ]
        },
        "missing-longitude.fit"
      )
    ).toThrow(expect.objectContaining({ code: "missing_coordinates" }));
  });

  it("rejects semicircle coordinates that normalize outside latitude bounds", () => {
    expect(() =>
      normalizeFitActivity(
        {
          records: [
            {
              timestamp: new Date("2024-05-25T08:00:00Z"),
              position_lat: 1200000000,
              position_long: 42.1
            }
          ]
        },
        "out-of-bounds-semicircle.fit"
      )
    ).toThrow(expect.objectContaining({ code: "coordinates_out_of_bounds" }));
  });

  it("marks FIT activities without altitude records as no-elevation sources", () => {
    const result = normalizeFitActivity(
      {
        records: [
          {
            timestamp: new Date("2024-05-25T08:00:00Z"),
            position_lat: 43.1,
            position_long: 42.1
          }
        ]
      },
      "no-altitude.fit"
    );

    expect(result.hasElevation).toBe(false);
    expect(result.elevationSource).toBe("none");
    expect(result.points[0]).toMatchObject({
      elevation: null,
      elevationSource: "none"
    });
  });

  it("prefers enhanced FIT altitude over regular altitude", () => {
    const result = normalizeFitActivity(
      {
        records: [
          {
            timestamp: new Date("2024-05-25T08:00:00Z"),
            position_lat: 43.1,
            position_long: 42.1,
            altitude: 600,
            enhanced_altitude: 620
          }
        ]
      },
      "enhanced-altitude.fit"
    );

    expect(result.points[0]).toMatchObject({
      elevation: 620,
      elevationSource: "barometric"
    });
    expect(result.hasElevation).toBe(true);
    expect(result.elevationSource).toBe("barometric");
  });

  it("normalizes invalid FIT timestamps as no-time points", () => {
    const result = normalizeFitActivity(
      {
        records: [
          {
            timestamp: "soon",
            position_lat: 43.1,
            position_long: 42.1
          }
        ]
      },
      "invalid-time.fit"
    );

    expect(result.hasTime).toBe(false);
    expect(result.points[0]).toMatchObject({
      timestamp: null,
      timeText: null,
      timeZoneStatus: "none"
    });
  });

  it("assigns FIT lap boundaries as point segments", () => {
    const decoded = {
      records: [
        { timestamp: new Date("2024-05-25T08:00:00Z"), position_lat: 43.1, position_long: 42.1 },
        { timestamp: new Date("2024-05-25T08:05:00Z"), position_lat: 43.2, position_long: 42.2 },
        { timestamp: new Date("2024-05-25T08:10:00Z"), position_lat: 43.3, position_long: 42.3 }
      ],
      laps: [
        { start_time: new Date("2024-05-25T08:00:00Z") },
        { start_time: new Date("2024-05-25T08:05:00Z") }
      ]
    };

    const result = normalizeFitActivity(decoded, "laps.fit");

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 1, 1]);
    expect(result.provenance).toMatchObject({
      segmentCount: 2,
      segmentSource: "fit_laps",
      lapBoundaryCount: 1
    });
  });

  it("creates FIT timer stop/start continuity breaks", () => {
    const decoded = {
      records: [
        { timestamp: new Date("2024-05-25T08:00:00Z"), position_lat: 43.1, position_long: 42.1 },
        { timestamp: new Date("2024-05-25T08:05:00Z"), position_lat: 43.2, position_long: 42.2 },
        { timestamp: new Date("2024-05-25T08:06:00Z"), position_lat: 44.2, position_long: 43.2 },
        { timestamp: new Date("2024-05-25T08:10:00Z"), position_lat: 44.3, position_long: 43.3 }
      ],
      events: [
        { timestamp: new Date("2024-05-25T08:05:00Z"), event: "timer", event_type: "stop_all" },
        { timestamp: new Date("2024-05-25T08:06:00Z"), event: "timer", event_type: "start" }
      ]
    };

    const result = normalizeFitActivity(decoded, "timer.fit");

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 0, 1, 1]);
    expect(result.provenance).toMatchObject({
      segmentCount: 2,
      segmentSource: "fit_timer_events",
      timerBreakCount: 1
    });
  });

  it("ignores ineffective FIT breaks outside point timestamps", () => {
    const decoded = {
      records: [
        { timestamp: new Date("2024-05-25T08:00:00Z"), position_lat: 43.1, position_long: 42.1 },
        { timestamp: new Date("2024-05-25T08:10:00Z"), position_lat: 43.2, position_long: 42.2 }
      ],
      laps: [
        { start_time: new Date("2024-05-25T07:50:00Z") },
        { start_time: new Date("2024-05-25T07:55:00Z") },
        { start_time: new Date("2024-05-25T08:15:00Z") }
      ],
      events: [
        { timestamp: new Date("2024-05-25T07:40:00Z"), event: "timer", event_type: "stop_all" },
        { timestamp: new Date("2024-05-25T07:45:00Z"), event: "timer", event_type: "start" },
        { timestamp: new Date("2024-05-25T08:12:00Z"), event: "timer", event_type: "stop_all" },
        { timestamp: new Date("2024-05-25T08:15:00Z"), event: "timer", event_type: "start" }
      ]
    };

    const result = normalizeFitActivity(decoded, "outside-breaks.fit");

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 0]);
    expect(result.provenance).toMatchObject({
      segmentCount: 1,
      segmentSource: "fit_records",
      lapBoundaryCount: 0,
      timerBreakCount: 0
    });
  });

  it("assigns untimed records after a FIT timer break to the post-break segment", () => {
    const decoded = {
      records: [
        { timestamp: new Date("2024-05-25T08:00:00Z"), position_lat: 43.1, position_long: 42.1 },
        { timestamp: new Date("2024-05-25T08:05:00Z"), position_lat: 43.2, position_long: 42.2 },
        { position_lat: 44.2, position_long: 43.2 },
        { timestamp: new Date("2024-05-25T08:10:00Z"), position_lat: 44.3, position_long: 43.3 }
      ],
      events: [
        { timestamp: new Date("2024-05-25T08:05:00Z"), event: "timer", event_type: "stop_all" },
        { timestamp: new Date("2024-05-25T08:06:00Z"), event: "timer", event_type: "start" }
      ]
    };

    const result = normalizeFitActivity(decoded, "untimed-break.fit");

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 0, 1, 1]);
    expect(result.provenance).toMatchObject({
      segmentCount: 2,
      segmentSource: "fit_timer_events",
      timerBreakCount: 1
    });
  });

  it("creates FIT timer breaks from numeric event and event types", () => {
    const decoded = {
      records: [
        { timestamp: new Date("2024-05-25T08:00:00Z"), position_lat: 43.1, position_long: 42.1 },
        { timestamp: new Date("2024-05-25T08:05:00Z"), position_lat: 43.2, position_long: 42.2 },
        { timestamp: new Date("2024-05-25T08:06:00Z"), position_lat: 44.2, position_long: 43.2 }
      ],
      events: [
        { timestamp: new Date("2024-05-25T08:05:00Z"), event: 0, event_type: 4 },
        { timestamp: new Date("2024-05-25T08:06:00Z"), event: 0, event_type: 0 },
        { timestamp: new Date("2024-05-25T08:07:00Z"), event: 99, event_type: 4 }
      ]
    };

    const result = normalizeFitActivity(decoded, "numeric-events.fit");

    expect(result.points.map((point) => point.segmentIndex)).toEqual([0, 0, 1]);
    expect(result.provenance).toMatchObject({
      segmentCount: 2,
      segmentSource: "fit_timer_events",
      timerBreakCount: 1
    });
    expect(result.provenance?.timerEvents).toEqual({
      count: 2,
      events: [
        { timestamp: "2024-05-25T08:05:00.000Z", eventType: 4 },
        { timestamp: "2024-05-25T08:06:00.000Z", eventType: 0 }
      ]
    });
  });

  it("converts raw semicircle coordinates to degrees", () => {
    const result = normalizeFitActivity(
      {
        records: [
          {
            timestamp: "2024-05-25T08:00:00Z",
            position_lat: 514995952,
            position_long: 251012744
          }
        ]
      },
      "semicircles.fit"
    );

    expect(result.points[0].latitude).toBeCloseTo(43.16646, 5);
    expect(result.points[0].longitude).toBeCloseTo(21.03965, 5);
  });

  it("throws a parse error for broken FIT binaries", async () => {
    await expect(parseFit(new ArrayBuffer(0), "broken.fit")).rejects.toBeInstanceOf(GpxParseError);
    await expect(parseFit(new ArrayBuffer(0), "broken.fit")).rejects.toMatchObject({
      code: "parse_error"
    });
  });

  it("preserves normalization parser error codes from the parseFit path", async () => {
    vi.resetModules();
    vi.doMock("fit-file-parser", () => ({
      default: class EmptyFitParser {
        async parseAsync() {
          return { records: [] };
        }
      }
    }));
    const { parseFit: parseFitWithEmptyDecoder } = await import("../../src/core/fit-parser.js");

    await expect(parseFitWithEmptyDecoder(new ArrayBuffer(1), "empty.fit")).rejects.toMatchObject({
      name: "GpxParseError",
      code: "empty_track"
    });
  });
});
