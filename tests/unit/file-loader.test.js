import { describe, expect, it } from "vitest";
import { isSupportedTrackFile, readTrackSourceFile } from "../../src/services/file-loader.js";

describe("file loader", () => {
  it("accepts GPX files by extension", () => {
    const file = new File(["<gpx></gpx>"], "route.GPX", { type: "" });

    expect(isSupportedTrackFile(file)).toBe(true);
  });

  it("accepts XML-like track files by mime type", () => {
    const file = new File(["<gpx></gpx>"], "route.xml", { type: "application/gpx+xml" });

    expect(isSupportedTrackFile(file)).toBe(true);
  });

  it("rejects unsupported or missing files through shared source detection", () => {
    const textFile = new File(["hello"], "notes.txt", { type: "text/plain" });

    expect(isSupportedTrackFile(textFile)).toBe(false);
    expect(isSupportedTrackFile(null)).toBe(false);
  });

  it("accepts TCX and FIT files", () => {
    expect(
      isSupportedTrackFile(
        new File(["<TrainingCenterDatabase />"], "workout.tcx", { type: "application/xml" })
      )
    ).toBe(true);
    expect(
      isSupportedTrackFile(new File(["FIT"], "activity.fit", { type: "application/octet-stream" }))
    ).toBe(true);
  });

  it("loads FIT as ArrayBuffer and TCX as text", async () => {
    const fitFile = new File(["FIT"], "activity.fit", { type: "application/octet-stream" });
    const tcxFile = new File(["<TrainingCenterDatabase />"], "workout.tcx", {
      type: "application/vnd.garmin.tcx+xml"
    });

    expect(await readTrackSourceFile(fitFile)).toBeInstanceOf(ArrayBuffer);
    expect(await readTrackSourceFile(tcxFile)).toBe("<TrainingCenterDatabase />");
  });
});
