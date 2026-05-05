import { describe, expect, it } from "vitest";
import { createI18n } from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";
import { TEMPLATE_DEFINITIONS } from "../../src/render/template-definitions.js";
import { renderInfographic } from "../../src/render/templates.js";

const model = {
  title: "Маршрут выходного дня",
  dateLabel: "25 мая 2024",
  fileName: "route.gpx",
  warnings: [],
  analysis: {
    totalDistanceMeters: 23470,
    movingDurationSeconds: 20538,
    totalDurationSeconds: 22865,
    stoppedDurationSeconds: 2327,
    averageSpeedKmh: 4.11,
    overallAverageSpeedKmh: 3.7,
    movingAverageSpeedKmh: 4.11,
    elevationGainMeters: 1540,
    elevationLossMeters: 1650,
    maxElevationMeters: 2031,
    minElevationMeters: 623,
    elevationRangeMeters: 1408,
    maxSpeedKmh: 15.8,
    speedSeries: [],
    slopeSeries: [],
    distanceSeries: [],
    segments: []
  },
  parsed: {
    hasElevation: true,
    hasTime: true,
    points: [
      {
        latitude: 43.1,
        longitude: 42.1,
        elevation: 620,
        timestamp: new Date(Date.UTC(2021, 6, 28, 8, 0, 0)),
        segmentIndex: 0
      },
      {
        latitude: 43.2,
        longitude: 42.2,
        elevation: 740,
        timestamp: new Date(Date.UTC(2021, 6, 29, 9, 0, 0)),
        segmentIndex: 0
      }
    ]
  }
};

function modelWithPointCount(count) {
  return {
    ...model,
    parsed: {
      ...model.parsed,
      points: Array.from({ length: count }, (_, index) => ({
        ...model.parsed.points[index % model.parsed.points.length],
        latitude: 43.1 + index / 1000,
        longitude: 42.1 + index / 1000,
        timestamp: new Date(Date.UTC(2021, 6, 28, 8, index, 0))
      }))
    }
  };
}

describe("infographic templates", () => {
  it("exports the expected template definitions", () => {
    expect(TEMPLATE_DEFINITIONS.map((definition) => definition.id)).toEqual(["route-report"]);
    expect(TEMPLATE_DEFINITIONS).toMatchObject([
      { width: 1240, height: 1754, pdfOrientation: "portrait" }
    ]);
  });

  it("renders the route report infographic structure in Russian", () => {
    const element = renderInfographic(model, createI18n("ru", LOCALES));

    expect(element.dataset.template).toBe("route-report");
    expect(element.hasAttribute("data-poster-background-art")).toBe(true);
    for (const label of [
      "Дистанция",
      "Время в движении",
      "Общее время",
      "Средняя скорость",
      "Скорость в движении",
      "Набор высоты",
      "Сброс высоты",
      "Макс. высота"
    ]) {
      expect(element.textContent).toContain(label);
    }
    expect(element.textContent).toContain("Мин. высота");
    expect(element.querySelectorAll(".metric-table")).toHaveLength(1);
    expect(element.querySelectorAll(".metric-table__row")).toHaveLength(3);
    expect(element.querySelectorAll(".metric-table__cell")).toHaveLength(12);
    expect(element.querySelectorAll(".metric-card")).toHaveLength(0);
    expect(element.querySelector(".stats-panel__title")).toBeNull();
    expect(element.textContent).not.toContain("Ключевые показатели");
    expect(element.querySelector("[data-map-slot]")).not.toBeNull();
    expect(element.querySelector("[data-chart='elevation']")).not.toBeNull();
    expect(element.querySelector("[data-chart='speed']")).toBeNull();
    expect(element.querySelector("[data-chart='slope']")).toBeNull();
    expect(element.querySelector(".poster-header")).not.toBeNull();
    expect(element.querySelector(".poster-body")).not.toBeNull();
    expect(element.querySelector(".poster-map")).not.toBeNull();
    expect(element.querySelector(".poster-stats")).not.toBeNull();
    expect(element.querySelector(".elevation-section")).not.toBeNull();
    expect(element.querySelector(".elevation-section__title")?.textContent).toBe("Профиль высоты");
    expect(element.querySelector(".elevation-landscape")).not.toBeNull();
    expect(element.querySelector(".elevation-landscape")?.textContent).not.toContain(
      "Профиль высоты"
    );
    expect(element.querySelector(".supporting-data")).toBeNull();
    expect(element.querySelector(".poster-footer")).toBeNull();
    expect(element.textContent).not.toContain("Маршрут готов");
    expect(element.querySelector(".infographic__kicker")).toBeNull();
    expect(element.querySelector(".poster-header__subtitle")).toBeNull();
    const header = element.querySelector(".poster-header");

    expect(header?.textContent).not.toContain("Маршрутный отчет");
    expect(element.querySelector(".poster-header")?.textContent).not.toContain("2 точки трека");
    expect(header?.textContent).not.toContain("Файл");
    expect(header?.textContent).not.toContain("route.gpx");
    expect(header?.textContent).not.toContain("25 мая 2024");
    expect(element.querySelector(".poster-header__period")?.textContent).toBe("28-29 июля 2021");
    expect(element.querySelector("[data-metric='moving-speed']")).not.toBeNull();
    expect(element.querySelector("[data-metric='stopped-time']")).not.toBeNull();
    expect(element.querySelector("[data-metric='min-elevation']")).not.toBeNull();
    expect(element.querySelector("[data-metric='max-speed']")).not.toBeNull();
    expect(element.querySelector("[data-metric='elevation-range']")).not.toBeNull();
    expect(
      element.querySelector("[data-metric='average-speed'] .metric-table__value")
    ).not.toBeNull();
    expect(
      element.querySelector("[data-metric='moving-speed'] .metric-table__value")
    ).not.toBeNull();
    expect(element.querySelector("[data-metric='max-speed'] .metric-table__value")).not.toBeNull();

    const bodyItems = Array.from(element.querySelector(".poster-body")?.children ?? []);
    expect(bodyItems.map((item) => item.className)).toEqual([
      "map-panel poster-map",
      "elevation-section",
      "stats-panel poster-stats"
    ]);
    expect(element.querySelector(".elevation-section__title")?.nextElementSibling).toBe(
      element.querySelector("[data-chart='elevation']")
    );
  });

  it("renders poster labels and number formats in German", () => {
    const element = renderInfographic(model, createI18n("de", LOCALES));

    expect(element.textContent).not.toContain("Kennzahlen");
    expect(element.textContent).toContain("Höhenprofil");
    expect(element.textContent).toContain("Distanz");
    expect(element.textContent).toContain("23,5 km");
    expect(element.textContent).toContain("1.540,0 m");
    expect(element.textContent).toContain("15,8 km/h");
    expect(element.textContent).toContain("1.408,0 m");
    expect(element.querySelector(".poster-map")?.getAttribute("aria-label")).toBe("Routenkarte");
  });

  it("renders Russian poster point summaries with locale plural forms", () => {
    const cases = [
      [1, "1 точка трека"],
      [2, "2 точки трека"],
      [5, "5 точек трека"],
      [21, "21 точка трека"]
    ];

    for (const [count, expected] of cases) {
      const element = renderInfographic(modelWithPointCount(count), createI18n("ru", LOCALES));

      expect(element.querySelector(".poster-map")?.textContent).toContain(expected);
    }
  });

  it("formats the track period in the poster language", () => {
    const element = renderInfographic(model, createI18n("en", LOCALES));

    expect(element.querySelector(".poster-header__period")?.textContent).toBe("July 28-29, 2021");
  });

  it("renders representative route coordinates under the header compass", () => {
    const element = renderInfographic(model, createI18n("en", LOCALES));
    const coordinates = element.querySelector(".poster-header__coordinates");
    const rows = Array.from(element.querySelectorAll(".poster-header__coordinate"));

    expect(coordinates).not.toBeNull();
    expect(coordinates?.getAttribute("aria-label")).toBe("Representative route coordinates");
    expect(rows).toHaveLength(2);
    expect(element.querySelector(".poster-header__coordinate-label")).toBeNull();
    expect(rows[0]?.textContent?.trim()).toBe("43.2000° N");
    expect(rows[1]?.textContent?.trim()).toBe("42.2000° E");
  });

  it("omits representative route coordinates when coordinates are absent", () => {
    const element = renderInfographic(
      {
        ...model,
        parsed: {
          ...model.parsed,
          points: [
            { ...model.parsed.points[0], latitude: Number.NaN, longitude: 42.1 },
            { ...model.parsed.points[1], latitude: 43.2, longitude: Number.NaN }
          ]
        }
      },
      createI18n("en", LOCALES)
    );

    expect(element.querySelector(".poster-header__coordinates")).toBeNull();
  });

  it("omits representative route coordinates when latitude or longitude is zero", () => {
    const element = renderInfographic(
      {
        ...model,
        parsed: {
          ...model.parsed,
          points: [
            { ...model.parsed.points[0], latitude: 0, longitude: 42.1 },
            { ...model.parsed.points[1], latitude: 43.2, longitude: 0 }
          ]
        }
      },
      createI18n("en", LOCALES)
    );

    expect(element.querySelector(".poster-header__coordinates")).toBeNull();
  });

  it("renders an escaped location subtitle under the track period", () => {
    const element = renderInfographic(
      { ...model, trackLocation: { label: "Dolomites & <Alta Via>" } },
      createI18n("en", LOCALES)
    );
    const title = element.querySelector(".poster-header h2");
    const period = element.querySelector(".poster-header__period");
    const location = element.querySelector(".poster-header__location");

    expect(period).not.toBeNull();
    expect(location).not.toBeNull();
    expect(title?.nextElementSibling).toBe(period);
    expect(period?.nextElementSibling).toBe(location);
    expect(location?.querySelector('[data-icon="location"]')).not.toBeNull();
    expect(location?.querySelector("[data-icon-shape]")?.getAttribute("data-icon-shape")).toBe(
      "lucide-map-pin"
    );
    expect(location?.textContent).toContain("Dolomites & <Alta Via>");
    expect(location?.innerHTML).toContain("Dolomites &amp; &lt;Alta Via&gt;");
  });

  it("omits the location subtitle when the location label is absent or empty", () => {
    const variants = [
      model,
      { ...model, trackLocation: null },
      { ...model, trackLocation: { label: "" } },
      { ...model, trackLocation: { label: "   " } }
    ];

    for (const variant of variants) {
      const element = renderInfographic(variant, createI18n("en", LOCALES));

      expect(element.querySelector(".poster-header__location")).toBeNull();
    }
  });

  it("omits the track period when timestamps are absent", () => {
    const element = renderInfographic(
      {
        ...model,
        parsed: {
          ...model.parsed,
          points: model.parsed.points.map((point) => ({ ...point, timestamp: null }))
        }
      },
      createI18n("en", LOCALES)
    );

    expect(element.querySelector(".poster-header__period")).toBeNull();
  });
});
