import { describe, expect, it } from "vitest";
import { icon } from "../../src/render/icons.js";

const ICON_NAMES = /** @type {const} */ ([
  "distance",
  "movingTime",
  "stoppedTime",
  "totalTime",
  "averageSpeed",
  "movingSpeed",
  "maxSpeed",
  "gain",
  "loss",
  "minElevation",
  "maxElevation",
  "elevationRange"
]);

const EXPECTED_SHAPES = {
  distance: "lucide-route",
  movingTime: "lucide-footprints",
  stoppedTime: "lucide-octagon-pause",
  totalTime: "lucide-timer",
  averageSpeed: "lucide-gauge",
  movingSpeed: "lucide-wind",
  maxSpeed: "lucide-zap",
  gain: "lucide-trending-up",
  loss: "lucide-trending-down",
  minElevation: "lucide-arrow-down-to-line",
  maxElevation: "lucide-arrow-up-to-line",
  elevationRange: "lucide-unfold-vertical"
};

describe("icons", () => {
  it("renders every metric icon with a stable, clear SVG marker", () => {
    expect(Object.keys(EXPECTED_SHAPES)).toEqual([...ICON_NAMES]);

    const shapes = [];

    for (const name of ICON_NAMES) {
      const markup = icon(name);
      const shape = markup.match(/data-icon-shape="([^"]+)"/)?.[1];

      expect(markup).toContain("<svg");
      expect(markup).toContain(`data-icon="${name}"`);
      expect(markup).toContain('data-icon-library="lucide"');
      expect(markup).toContain('viewBox="0 0 32 32"');
      expect(markup).toContain('vector-effect="non-scaling-stroke"');
      expect(markup).toContain('fill="none"');
      expect(markup).toContain('stroke="currentColor"');
      expect(shape).toBe(EXPECTED_SHAPES[name]);
      expect(markup.match(/<(path|circle|polyline|line)\b/g)?.length ?? 0).toBeGreaterThan(0);
      shapes.push(shape);
    }

    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(ICON_NAMES.length);
  });

  it("returns an empty string for unknown icons", () => {
    expect(icon(/** @type {any} */ ("missing"))).toBe("");
  });

  it("renders the poster location icon with the MapPin lucide shape", () => {
    const markup = icon("location");

    expect(markup).toContain("<svg");
    expect(markup).toContain('data-icon="location"');
    expect(markup).toContain('data-icon-shape="lucide-map-pin"');
    expect(markup).toContain('data-icon-library="lucide"');
    expect(markup.match(/<(path|circle|polyline|line)\b/g)?.length ?? 0).toBeGreaterThan(0);
  });
});
