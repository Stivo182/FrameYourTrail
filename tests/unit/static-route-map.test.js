import { describe, expect, it } from "vitest";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { renderStaticRouteFallback } from "../../src/render/map.js";
import {
  createSpeedSeriesForDistances,
  getRouteSegmentDistances,
  points,
  segmentedPoints
} from "./helpers/map-route-fixtures.js";

describe("static route map fallback", () => {
  it("renders a localized static SVG route fallback", () => {
    const host = document.createElement("div");
    renderStaticRouteFallback(host, points, createI18n("fr", LOCALES));

    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.querySelector("svg")?.getAttribute("aria-label")).toBe(
      "Itinéraire sans fond de carte"
    );
    expect(host.querySelector("[data-static-route]")).not.toBeNull();
    expect(host.querySelectorAll("[data-static-route-segment]")).toHaveLength(0);
    expect(host.querySelector("[data-static-route-halo]")).not.toBeNull();
    expect(host.querySelector("[data-static-start]")).not.toBeNull();
    expect(host.querySelector("[data-static-finish]")).not.toBeNull();
    expect(host.textContent).toContain("Le fond de carte est indisponible");
  });

  it("renders localized start and finish labels in the static SVG route fallback", () => {
    const host = document.createElement("div");
    renderStaticRouteFallback(host, points, createI18n("en"));

    const startMarker = /** @type {SVGCircleElement | null} */ (
      host.querySelector("[data-static-start]")
    );
    const finishMarker = /** @type {SVGCircleElement | null} */ (
      host.querySelector("[data-static-finish]")
    );
    const startLabel = /** @type {SVGTextElement | null} */ (
      host.querySelector("[data-static-start-label]")
    );
    const finishLabel = /** @type {SVGTextElement | null} */ (
      host.querySelector("[data-static-finish-label]")
    );

    expect(startLabel?.textContent).toBe("Start");
    expect(finishLabel?.textContent).toBe("Finish");
    expect(startLabel?.getAttribute("text-anchor")).toBe("start");
    expect(Number(startLabel?.getAttribute("x"))).toBeGreaterThan(
      Number(startMarker?.getAttribute("cx"))
    );
    expect(finishLabel?.getAttribute("text-anchor")).toBe("end");
    expect(Number(finishLabel?.getAttribute("x"))).toBeLessThan(
      Number(finishMarker?.getAttribute("cx"))
    );
    expect(Number(finishLabel?.getAttribute("y"))).toBeGreaterThan(
      Number(finishMarker?.getAttribute("cy"))
    );
  });

  it("renders colored static SVG route segments when speed data is usable", () => {
    const host = document.createElement("div");
    const mapSpeedSeries = createSpeedSeriesForDistances(
      getRouteSegmentDistances(segmentedPoints),
      [5, 10, 15]
    );

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), mapSpeedSeries);

    const segments = Array.from(
      host.querySelectorAll("[data-static-route-segment]"),
      (segment) => /** @type {SVGPathElement} */ (segment)
    );

    expect(segments.length).toBe(3);
    expect(segments[0].getAttribute("data-static-route")).toBe("");
    expect(segments.map((segment) => segment.getAttribute("stroke"))).toEqual([
      "#b94a3a",
      "#d99a3a",
      "#6f8f4d"
    ]);
    expect(segments.map((segment) => segment.style.stroke)).toEqual([
      "#b94a3a",
      "#d99a3a",
      "#6f8f4d"
    ]);
    expect(host.querySelector("[data-static-route-halo]")).not.toBeNull();
    expect(host.querySelector("[data-static-start]")).not.toBeNull();
    expect(host.querySelector("[data-static-finish]")).not.toBeNull();
  });

  it("renders colored static SVG segments through zero-distance speed samples", () => {
    const host = document.createElement("div");
    const routeDistances = getRouteSegmentDistances(segmentedPoints);
    const jitterSpeedSeries = [
      {
        index: 1,
        startDistanceFromStartMeters: 0,
        distanceFromStartMeters: routeDistances[0],
        distanceMeters: routeDistances[0],
        durationSeconds: 120,
        rawSpeedKmh: 0,
        speedKmh: 0
      },
      {
        index: 2,
        startDistanceFromStartMeters: routeDistances[0],
        distanceFromStartMeters: routeDistances[0],
        distanceMeters: 0,
        durationSeconds: 30,
        rawSpeedKmh: 5,
        speedKmh: 5
      },
      {
        index: 3,
        startDistanceFromStartMeters: routeDistances[0],
        distanceFromStartMeters: routeDistances[0] + routeDistances[2],
        distanceMeters: routeDistances[2],
        durationSeconds: 30,
        rawSpeedKmh: 10,
        speedKmh: 10
      }
    ];

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), jitterSpeedSeries);

    const segments = Array.from(
      host.querySelectorAll("[data-static-route-segment]"),
      (segment) => /** @type {SVGPathElement} */ (segment)
    );

    expect(segments.length).toBe(3);
    expect(segments.map((segment) => segment.getAttribute("stroke"))).toEqual([
      "#b94a3a",
      "#d99a3a",
      "#6f8f4d"
    ]);
    expect(host.querySelectorAll("[data-static-route]")).toHaveLength(3);
  });

  it("keeps colored static SVG route segments continuous when a speed sample is missing", () => {
    const host = document.createElement("div");
    const routeDistances = getRouteSegmentDistances(segmentedPoints);
    const gappedSpeedSeries = [
      {
        index: 1,
        startDistanceFromStartMeters: 0,
        distanceFromStartMeters: routeDistances[0],
        distanceMeters: routeDistances[0],
        durationSeconds: 120,
        rawSpeedKmh: 5,
        speedKmh: 5
      },
      {
        index: 3,
        startDistanceFromStartMeters: routeDistances[0],
        distanceFromStartMeters: routeDistances[0] + routeDistances[2],
        distanceMeters: routeDistances[2],
        durationSeconds: 30,
        rawSpeedKmh: 15,
        speedKmh: 15
      }
    ];

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), gappedSpeedSeries);

    const segments = Array.from(
      host.querySelectorAll("[data-static-route-segment]"),
      (segment) => /** @type {SVGPathElement} */ (segment)
    );

    expect(segments.length).toBe(3);
    expect(segments.map((segment) => segment.getAttribute("stroke"))).toEqual([
      "#b94a3a",
      "#b94a3a",
      "#6f8f4d"
    ]);
  });

  it("keeps a single static route when speed samples do not create a useful range", () => {
    const host = document.createElement("div");
    const flatSpeedSeries = createSpeedSeriesForDistances(
      getRouteSegmentDistances(segmentedPoints),
      [8, 8, 8]
    );

    renderStaticRouteFallback(host, segmentedPoints, createI18n("en"), flatSpeedSeries);

    expect(host.querySelectorAll("[data-static-route-segment]")).toHaveLength(0);
    expect(host.querySelectorAll("[data-static-route]")).toHaveLength(1);
  });
});
