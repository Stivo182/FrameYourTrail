import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_OPTIONS,
  STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  createCachedI18n,
  createI18n,
  getLocaleKeys,
  loadI18n,
  normalizeLanguage,
  readSavedLanguage,
  resolveInitialLanguage,
  saveLanguage
} from "../../src/i18n/index.js";
import * as i18nIndex from "../../src/i18n/index.js";
import { LOCALES } from "../../src/i18n/locales.js";

function storageMock(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      store.set(key, value);
    })
  };
}

describe("i18n", () => {
  it("keeps the full locale aggregate out of the public i18n barrel", () => {
    expect(Object.hasOwn(i18nIndex, "LOCALES")).toBe(false);
  });

  it("exposes readable language option labels synchronously", () => {
    expect(LANGUAGE_OPTIONS).toEqual([
      { code: "ru", label: "Русский" },
      { code: "en", label: "English" },
      { code: "es", label: "Español" },
      { code: "fr", label: "Français" },
      { code: "de", label: "Deutsch" }
    ]);
  });

  it("normalizes regional language tags", () => {
    expect(normalizeLanguage("de-DE")).toBe("de");
    expect(normalizeLanguage("ES-mx")).toBe("es");
    expect(normalizeLanguage("pt-BR")).toBeNull();
  });

  it("prefers saved supported language over browser languages", () => {
    const storage = storageMock({ [STORAGE_KEY]: "fr" });
    const navigatorLike = { languages: ["de-DE", "en-US"], language: "en-US" };

    expect(resolveInitialLanguage(navigatorLike, storage)).toBe("fr");
  });

  it("detects first supported browser language and falls back to English", () => {
    expect(
      resolveInitialLanguage({ languages: ["pt-BR", "es-ES"], language: "pt-BR" }, storageMock())
    ).toBe("es");
    expect(resolveInitialLanguage({ languages: ["pt-BR"], language: "pt-BR" }, storageMock())).toBe(
      DEFAULT_LANGUAGE
    );
  });

  it("saves and reads only supported languages", () => {
    const storage = storageMock();
    saveLanguage("de", storage);

    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "de");
    expect(readSavedLanguage(storage)).toBe("de");
    expect(readSavedLanguage(storageMock({ [STORAGE_KEY]: "pt" }))).toBeNull();
  });

  it("falls back to English when a translation key is missing", () => {
    const i18n = createI18n("ru", {
      en: LOCALES.en,
      ru: { ...LOCALES.ru, site: { ...LOCALES.ru.site, uploadFile: undefined } }
    });

    expect(i18n.t("site.uploadFile")).toBe("Choose file");
  });

  it("does not report a non-default language when its dictionary is unavailable synchronously", () => {
    const i18n = createI18n("ru");

    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
    expect(i18n.t("site.uploadFile")).toBe("Choose file");
  });

  it("keeps uncached selected language while pluralizing fallback English text in English", () => {
    const i18n = createCachedI18n("fr");

    expect(i18n.language).toBe("fr");
    expect(i18n.t("site.uploadFile")).toBe("Choose file");
    expect(i18n.tPlural("poster.pointSummary", 0, { count: 0 })).toBe("0 track points");
  });

  it("loads non-default locale dictionaries asynchronously", async () => {
    const i18n = await loadI18n("ru");

    expect(i18n.language).toBe("ru");
    expect(i18n.t("site.uploadFile")).toBe(LOCALES.ru.site.uploadFile);
  });

  it("falls back to English for unsupported lazy locale requests", async () => {
    const i18n = await loadI18n("pt-BR");

    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
    expect(i18n.t("site.uploadFile")).toBe("Choose file");
  });

  it("pluralizes and interpolates translation values", () => {
    const en = createI18n("en", LOCALES);
    const ru = createI18n("ru", LOCALES);

    expect(en.tPlural("poster.pointSummary", 1, { count: 1 })).toBe("1 track point");
    expect(en.tPlural("poster.pointSummary", 7, { count: 7 })).toBe("7 track points");
    expect(ru.tPlural("poster.pointSummary", 1, { count: 1 })).toBe("1 точка трека");
    expect(ru.tPlural("poster.pointSummary", 2, { count: 2 })).toBe("2 точки трека");
    expect(ru.tPlural("poster.pointSummary", 5, { count: 5 })).toBe("5 точек трека");
    expect(ru.tPlural("poster.pointSummary", 21, { count: 21 })).toBe("21 точка трека");
  });

  it("uses the French one plural form for zero without hard-coding one", () => {
    const fr = createI18n("fr", LOCALES);

    expect(fr.tPlural("poster.pointSummary", 0, { count: 0 })).toBe("0 point de trace");
  });

  it("keeps the plural count authoritative during interpolation", () => {
    const ru = createI18n("ru", LOCALES);

    expect(ru.tPlural("poster.pointSummary", 1, { count: 7 })).toBe("1 точка трека");
  });

  it("keeps locale dictionary shapes aligned", () => {
    const englishKeys = getLocaleKeys(LOCALES.en);

    for (const language of SUPPORTED_LANGUAGES) {
      expect(getLocaleKeys(LOCALES[language])).toEqual(englishKeys);
    }
  });

  it("uses concise poster taglines without terminal punctuation", () => {
    expect(LOCALES.ru.site.tagline).toBe("Превратите любой маршрут в постер");
    expect(LOCALES.en.site.tagline).toBe("Turn any route into a poster");
    expect(LOCALES.es.site.tagline).toBe("Convierte cualquier ruta en un póster");
    expect(LOCALES.fr.site.tagline).toBe("Transformez n'importe quel itinéraire en poster");
    expect(LOCALES.de.site.tagline).toBe("Verwandle jede Route in ein Poster");

    for (const language of SUPPORTED_LANGUAGES) {
      expect(LOCALES[language].site.tagline).not.toMatch(/[.!?]$/);
    }
  });

  it("does not keep a hidden poster metrics heading translation", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(LOCALES[language].poster.statsTitle).toBeUndefined();
    }
  });

  it("uses clipboard as the export destination label outside Russian", () => {
    expect(LOCALES.ru.site.clipboard).toBe("В буфер");
    expect(LOCALES.en.site.clipboard).toBe("Clipboard");
    expect(LOCALES.es.site.clipboard).toBe("Portapapeles");
    expect(LOCALES.fr.site.clipboard).toBe("Presse-papiers");
    expect(LOCALES.de.site.clipboard).toBe("Zwischenablage");
  });

  it("uses localized toolbar print labels", () => {
    expect(LOCALES.ru.site.printPoster).toBe("Печать");
    expect(LOCALES.en.site.printPoster).toBe("Print");
    expect(LOCALES.es.site.printPoster).toBe("Imprimir");
    expect(LOCALES.fr.site.printPoster).toBe("Imprimer");
    expect(LOCALES.de.site.printPoster).toBe("Drucken");
  });

  it("uses format-neutral text for shared track diagnostics and analysis modes", () => {
    const sharedTrackKeys = [
      "messages.emptyTrack",
      "messages.insufficientPoints",
      "messages.missingElevation",
      "messages.missingTime",
      "messages.terrainElevationUnavailable",
      "analysis.modes.recomputed_filtered",
      "analysis.modes.recomputed_raw"
    ];

    for (const language of SUPPORTED_LANGUAGES) {
      const i18n = createI18n(language, LOCALES);

      for (const key of sharedTrackKeys) {
        expect(i18n.t(key)).not.toMatch(/\bGPX\b/);
      }
    }
  });

  it("uses user-facing metric source copy", () => {
    expect(LOCALES.en.analysis.sourceLabel).toBe("Metrics");
    expect(LOCALES.en.analysis.sourceSelectLabel).toBe("Metric source");
    expect(LOCALES.en.analysis.modes.recomputed_filtered).toBe("Recommended");
    expect(LOCALES.en.analysis.modes.imported_summary).toBe("File totals");
    expect(LOCALES.en.analysis.modes.recomputed_raw).toBe("From track points");
    expect(LOCALES.en.analysis.modes.recomputed_terrain).toBe("Terrain elevation");
    expect(LOCALES.en.analysis.modes.recomputed_terrain_request).toBe("Fetch terrain elevation");
    expect(LOCALES.en.analysis.modeDescriptions.recomputed_filtered).toBe(
      "Cleans obvious GPS errors and uses track points."
    );
    expect(LOCALES.en.analysis.modeDescriptions.recomputed_filtered).not.toMatch(
      /best for posters/i
    );
    expect(LOCALES.en.analysis.modeDescriptions.imported_summary).toMatch(
      /totals recorded by.*device.*app.*may differ from track points/i
    );
    expect(LOCALES.en.analysis.modeDescriptions.recomputed_raw).toMatch(
      /^Recalculates metrics from file points after standard cleanup\./
    );
    expect(LOCALES.en.analysis.modeDescriptions.recomputed_terrain).toMatch(
      /recalculates.*terrain elevation/i
    );
    expect(LOCALES.en.analysis.modeDescriptions.recomputed_terrain_request).toMatch(
      /fetches terrain elevation.*external lookup.*internet/i
    );

    expect(LOCALES.ru.analysis.sourceLabel).toBe("Показатели");
    expect(LOCALES.ru.analysis.sourceSelectLabel).toBe("Источник показателей");
    expect(LOCALES.ru.analysis.modes.recomputed_filtered).toBe("Рекомендуемые");
    expect(LOCALES.ru.analysis.modes.imported_summary).toBe("Итоги из файла");
    expect(LOCALES.ru.analysis.modes.recomputed_raw).toBe("По точкам трека");
    expect(LOCALES.ru.analysis.modes.recomputed_terrain).toBe("По высотам рельефа");
    expect(LOCALES.ru.analysis.modes.recomputed_terrain_request).toBe("Загрузить высоты рельефа");
    expect(LOCALES.ru.analysis.modeDescriptions.recomputed_filtered).toBe(
      "Убирает явные ошибки GPS и считает по точкам трека."
    );
    expect(LOCALES.ru.analysis.modeDescriptions.recomputed_filtered).not.toContain("лучший выбор");
    expect(LOCALES.ru.analysis.modeDescriptions.recomputed_raw).toContain("стандартной очистки");
  });
  it("uses user-facing map style copy", () => {
    expect(LOCALES.en.mapStyle.selectLabel).toBe("Map style");
    expect(LOCALES.en.mapStyle.styles.openfreemap_poster.label).toBe("OpenFreeMap");
    expect(LOCALES.en.mapStyle.styles.osm_standard.label).toBe("OSM Standard");
    expect(LOCALES.en.mapStyle.styles.cyclosm.description).toMatch(/bike/i);
  });
});
