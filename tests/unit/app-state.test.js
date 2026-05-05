import { describe, expect, it } from "vitest";
import { createState } from "../../src/state/app-state.js";

describe("app state", () => {
  it("creates default route report state", () => {
    expect(createState()).toMatchObject({
      templateId: "route-report",
      theme: "terrain",
      parsed: null,
      analysis: null,
      analysisMode: "recomputed_filtered",
      mapStyleId: "openfreemap_poster",
      language: "en",
      title: "",
      trackLocation: null,
      fileName: "",
      fileSizeBytes: 0
    });
  });

  it("applies overrides without mutating defaults", () => {
    const state = createState({
      templateId: "legacy-layout",
      theme: "legacy-theme",
      title: "Evening Run"
    });

    expect(state.templateId).toBe("route-report");
    expect(state.theme).toBe("terrain");
    expect(state.title).toBe("Evening Run");
    expect(createState().templateId).toBe("route-report");
  });

  it("allows route metadata and presentation overrides", () => {
    expect(
      createState({
        language: "de",
        analysisMode: "recomputed_raw",
        mapStyleId: "cyclosm",
        fileSizeBytes: 1234,
        trackLocation: { label: "Georgia, United States" }
      })
    ).toMatchObject({
      language: "de",
      analysisMode: "recomputed_raw",
      mapStyleId: "cyclosm",
      fileSizeBytes: 1234,
      trackLocation: {
        label: "Georgia, United States"
      }
    });
  });
});
