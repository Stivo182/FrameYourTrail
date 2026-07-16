import { describe, expect, it, vi } from "vitest";

import { createTrackLocationController } from "../../src/controllers/track-location-controller.js";
import { createState } from "../../src/state/app-state.js";

/** @type {import("../../src/core/route-types.js").RoutePoint} */
const routePoint = {
  latitude: 55.75,
  longitude: 37.62,
  elevation: 120,
  timestamp: new Date("2026-05-15T08:00:00Z"),
  segmentIndex: 0,
  distanceMeters: 0,
  elevationSource: "gpx"
};

/** @type {import("../../src/core/route-types.js").RouteSource} */
const parsedTrack = {
  fileName: "route.gpx",
  name: "Morning route",
  points: [routePoint, { ...routePoint, distanceMeters: 1000 }],
  hasElevation: true,
  hasTime: true,
  elevationSource: "gpx"
};

/** @type {import("../../src/core/route-types.js").TrackAnalysis} */
const analysis = {
  mode: "recomputed_filtered",
  distanceSeries: [
    { distanceFromStartMeters: 0, elevation: 120 },
    { distanceFromStartMeters: 1000, elevation: 130 }
  ]
};

const trackLocation = {
  region: "Moscow",
  country: "Russia",
  label: "Moscow, Russia"
};

function createDeferred() {
  /** @type {(value: typeof trackLocation | null) => void} */
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function createHarness(overrides = {}) {
  let currentState = createState({
    language: "en",
    parsed: parsedTrack,
    analysis,
    ...overrides.state
  });
  let currentSourceToken = overrides.sourceToken ?? 1;
  let posterOutputActive = overrides.posterOutputActive ?? false;
  const renderApp = vi.fn();
  const setState = vi.fn((nextState) => {
    currentState = createState(nextState);
  });
  const reverseGeocodeTrackLocation =
    overrides.reverseGeocodeTrackLocation ?? vi.fn(async () => trackLocation);
  const controller = createTrackLocationController({
    getState: () => currentState,
    setState,
    renderApp,
    reverseGeocodeTrackLocation,
    isCurrentSourceRequest: (token) => token === currentSourceToken,
    getCurrentSourceRequestToken: () => currentSourceToken,
    isPosterOutputActive: () => posterOutputActive
  });

  return {
    controller,
    renderApp,
    setState,
    reverseGeocodeTrackLocation,
    setSourceToken: (token) => {
      currentSourceToken = token;
    },
    setPosterOutputActive: (active) => {
      posterOutputActive = active;
    },
    setCurrentState: (nextState) => {
      currentState = createState(nextState);
    },
    getState: () => currentState
  };
}

describe("track location controller", () => {
  it("updates state and renders after current reverse geocode requests", async () => {
    const harness = createHarness();

    await harness.controller.request(parsedTrack, "en");

    expect(harness.reverseGeocodeTrackLocation).toHaveBeenCalledWith(parsedTrack, {
      language: "en"
    });
    expect(harness.setState).toHaveBeenCalledWith({
      ...harness.getState(),
      trackLocation
    });
    expect(harness.renderApp).toHaveBeenCalledOnce();
  });

  it("ignores empty reverse geocode results", async () => {
    const harness = createHarness({
      reverseGeocodeTrackLocation: vi.fn(async () => null)
    });

    await harness.controller.request(parsedTrack, "en");

    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.renderApp).not.toHaveBeenCalled();
  });

  it("ignores stale track-location requests after invalidation", async () => {
    const deferred = createDeferred();
    const harness = createHarness({
      reverseGeocodeTrackLocation: vi.fn(() => deferred.promise)
    });
    const request = harness.controller.request(parsedTrack, "en");

    harness.controller.invalidate();
    deferred.resolve(trackLocation);
    await request;

    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.renderApp).not.toHaveBeenCalled();
  });

  it("ignores stale source requests and language changes", async () => {
    const deferred = createDeferred();
    const harness = createHarness({
      reverseGeocodeTrackLocation: vi.fn(() => deferred.promise)
    });
    const request = harness.controller.request(parsedTrack, "en", 1);

    harness.setSourceToken(2);
    harness.setCurrentState({ ...harness.getState(), language: "ru" });
    deferred.resolve(trackLocation);
    await request;

    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.renderApp).not.toHaveBeenCalled();
  });

  it("defers render while poster output is active and flushes it afterwards", async () => {
    const harness = createHarness({ posterOutputActive: true });

    await harness.controller.request(parsedTrack, "en");

    expect(harness.setState).toHaveBeenCalledOnce();
    expect(harness.renderApp).not.toHaveBeenCalled();

    harness.setPosterOutputActive(false);
    harness.controller.renderPendingAfterPosterOutput();
    harness.controller.renderPendingAfterPosterOutput();

    expect(harness.renderApp).toHaveBeenCalledOnce();
  });

  it("clears pending render when invalidated before poster output finishes", async () => {
    const harness = createHarness({ posterOutputActive: true });

    await harness.controller.request(parsedTrack, "en");
    harness.controller.invalidate();
    harness.setPosterOutputActive(false);
    harness.controller.renderPendingAfterPosterOutput();

    expect(harness.renderApp).not.toHaveBeenCalled();
  });

  it("skips pending render when poster state is incomplete", async () => {
    const harness = createHarness({ posterOutputActive: true });

    await harness.controller.request(parsedTrack, "en");
    harness.setCurrentState({ ...harness.getState(), analysis: null });
    harness.setPosterOutputActive(false);
    harness.controller.renderPendingAfterPosterOutput();

    expect(harness.renderApp).not.toHaveBeenCalled();
  });
});
