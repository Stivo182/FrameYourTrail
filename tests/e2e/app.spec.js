import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BIGDATACLOUD_REVERSE_GEOCODE_PATTERN,
  abortBigDataCloudReverseGeocoding,
  abortOpenFreeMapTiles
} from "./helpers/network.js";

const STORAGE_KEY = "frame-your-trail-language";
const EXPECTED_EXPORT_PNG_SIZE = { width: 2480, height: 3508 };
const A4_PRINT_PAGE_CSS_PIXELS = { width: 794, height: 1123 };

test.beforeEach(async ({ page }) => {
  await abortBigDataCloudReverseGeocoding(page);
});

test("detects browser language and persists manual language selection", async ({ page }) => {
  await page.addInitScript(
    ({ storageKey }) => {
      if (!sessionStorage.getItem("language-test-seeded")) {
        localStorage.removeItem(storageKey);
        sessionStorage.setItem("language-test-seeded", "1");
      }
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        get: () => ["de-DE", "en-US"]
      });
      Object.defineProperty(navigator, "language", {
        configurable: true,
        get: () => "de-DE"
      });
    },
    { storageKey: STORAGE_KEY }
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectToolbarLanguage(page, "de");
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("de");
  await expect(page.locator(".toolbar__tagline")).toHaveText("Verwandle jede Route in ein Poster");
  await expect(page.locator(".upload-box")).toContainText("Datei wählen");

  await selectToolbarLanguage(page, "es", /Español/);
  await expect(page.locator(".toolbar__tagline")).toHaveText(
    "Convierte cualquier ruta en un póster"
  );
  await expect(page.locator(".upload-box")).toContainText("Elegir archivo");
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("es");

  await page.reload();
  await expectToolbarLanguage(page, "es");
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("es");
  await expect(page.locator(".toolbar__tagline")).toHaveText(
    "Convierte cualquier ruta en un póster"
  );
});

test("starts and handles controls when localStorage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("localStorage blocked", "SecurityError");
      }
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("h1")).toHaveText("Frame Your Trail");
  await expect(page.locator("[data-language-menu] summary")).toBeVisible();
  await page.locator("[data-language-menu] summary").click();
  await page.locator("[data-language-option][value='de']").check();
  await expect(page.locator(".toolbar__tagline")).toHaveText("Verwandle jede Route in ein Poster");
});

test("links to the source repository from the application footer", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");
  const [packageMetadata, siteConfig] = await Promise.all(
    ["package.json", "site.config.json"].map(async (file) =>
      JSON.parse(await readFile(resolve(file), "utf8"))
    )
  );

  const sourceLink = page.locator(".app-footer a");
  const sourceIcon = sourceLink.locator('[data-icon="github"]');
  const appVersion = page.locator(".app-footer__version");

  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveText("GitHub");
  await expect(sourceIcon).toHaveAttribute("aria-hidden", "true");
  await expect(sourceIcon).toHaveAttribute("focusable", "false");
  await expect(appVersion).toHaveText(`v${packageMetadata.version}`);
  await expect(sourceLink).toHaveAttribute("href", siteConfig.repositoryUrl);
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
});

test("labels the toolbar language trigger with its purpose and active language", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");

  await expect(page.locator("[data-language-menu] summary")).toHaveAccessibleName(
    /Language.*EN.*English/
  );
});

test("keeps the toolbar language trigger compact on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useSavedLanguage(page, "en");
  await page.goto("/");

  const summaryBox = await page.locator("[data-language-menu] summary").boundingBox();

  if (!summaryBox) {
    throw new Error("Language trigger is not measurable");
  }

  expect(Math.round(summaryBox.width)).toBeLessThanOrEqual(80);
});

test("keeps the toolbar title and tagline on single lines when narrow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useSavedLanguage(page, "en");
  await page.goto("/");

  await expectTextToUseOneLine(page, ".toolbar h1");
  await expectTextToUseOneLine(page, ".toolbar__tagline");
  await expectTextNotToBeClipped(page, ".toolbar h1");
  await expectTextNotToBeClipped(page, ".toolbar__tagline");
});

test("keeps the empty toolbar on one row while controls fit", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 844 });
  await useSavedLanguage(page, "en");
  await page.goto("/");

  await expectLocatorsToShareRow(page, ".toolbar__identity", ".toolbar__actions");
});

test("keeps loaded toolbar text on single lines when the mode selector is visible", async ({
  page
}) => {
  await page.setViewportSize({ width: 620, height: 844 });
  await useSavedLanguage(page, "ru");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);
  await expect(page.locator(".infographic")).toBeVisible();

  await expectTextToUseOneLine(page, ".toolbar h1");
  await expectTextToUseOneLine(page, ".toolbar__tagline");
  await expectTextNotToBeClipped(page, ".toolbar h1");
  await expectTextNotToBeClipped(page, ".toolbar__tagline");
  await expectTextToUseOneLine(page, ".metric-source-menu__prefix");
  await expectTextToUseOneLine(page, ".metric-source-menu__value");
});

test("closes the language menu when activating the active language option", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");

  await activateCurrentToolbarLanguage(page, /English/);
});

test("uploads GPX and shows infographic preview", async ({ page }) => {
  await useSavedLanguage(page, "ru");
  await abortOpenFreeMapTiles(page);
  let locationRequests = 0;
  await page.unroute(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN);
  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, async (route) => {
    locationRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        principalSubdivision: "Kabardino-Balkaria",
        countryName: "Russia"
      })
    });
  });
  await page.goto("/");
  await uploadSpeedGradientFixture(page);

  await expect(page.locator(".poster-stats")).not.toContainText("Ключевые показатели");
  await expect(page.locator(".metric-table")).toBeVisible();
  await expect(page.locator(".metric-table__row")).toHaveCount(3);
  await expect(page.locator(".metric-table__cell")).toHaveCount(12);
  await expect(page.locator(".metric-card")).toHaveCount(0);
  await expect(page.locator(".poster-stats").getByText("Дистанция", { exact: true })).toBeVisible();
  await expect(page.locator(".poster-header__date")).toHaveCount(0);
  await expect(page.locator(".poster-header")).not.toContainText("25.05.2024");
  await expect(page.locator(".poster-header")).not.toContainText("Файл");
  await expect(page.locator(".poster-header")).not.toContainText("valid-track.gpx");
  await expect(page.locator(".poster-header")).toBeVisible();
  await expect(page.locator(".poster-header__period")).toHaveText("25 мая 2024");
  await expect(page.locator(".poster-header__coordinate")).toHaveCount(2);
  await expect(page.locator(".poster-header__coordinates")).toContainText(/43[,.]1030° N/);
  await expect(page.locator(".poster-header__coordinates")).toContainText(/42[,.]1050° E/);
  await expect(page.locator(".poster-header__location")).toContainText(
    "Kabardino-Balkaria, Russia"
  );
  await expect(page.locator(".poster-header__location [data-icon='location']")).toHaveCount(1);
  expect(locationRequests).toBe(1);
  await expect(page.locator(".poster-map")).toBeVisible();
  await expect(page.locator("[data-static-route-segment]")).toHaveCount(4);
  await expect(page.locator(".elevation-landscape")).toBeVisible();
  await expect(page.locator(".infographic")).toHaveAttribute("data-template", "route-report");
  await expect(page.locator("[data-chart='speed']")).toHaveCount(0);
  await expect(page.locator("[data-chart='slope']")).toHaveCount(0);
  await expect(page.locator(".poster-footer")).toHaveCount(0);
  await expect(page.locator(".app-shell")).toHaveClass(/app-shell--has-poster/);
  await expect(page.locator(".export-row")).toHaveCount(0);
  await expect(page.locator(".export-actions")).toHaveCount(0);
  await expect(page.locator("[data-export-menu]")).toBeVisible();
  await expect(page.locator(".toolbar")).toHaveCSS("position", "sticky");
  await expect(page.locator(".toolbar")).toHaveCSS("top", "12px");
  await expect(page.locator(".poster-scroll")).toHaveCSS("overflow-x", "auto");
  await expect(page.locator(".poster-scroll")).toHaveCSS("overflow-y", "auto");
  await expect(page.locator(".poster-scroll")).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".poster-scroll")).toHaveCSS("padding-top", "0px");
  await expect(page.locator(".upload-box")).toContainText("Выбрать файл");
  await expect(page.locator(".toolbar__tagline")).toHaveText("Превратите любой маршрут в постер");
  await expect(page.locator(".toolbar__tagline")).not.toContainText("постер готов");
  await expect(page.locator(".toolbar__tagline")).not.toContainText("valid-track.gpx");
  await expect(page.locator(".toolbar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".upload-box")).toHaveCSS("background-color", "rgb(15, 118, 110)");
  await expect(page.locator(".upload-box")).toHaveCSS("min-height", "38px");
  await expect(page.locator("[data-export-menu] summary")).toContainText("Экспорт");
  await page.locator("[data-export-menu] summary").click();
  await expect(page.locator("[data-export-menu] [data-export='png']")).toBeVisible();
  await expect(page.locator("[data-export-menu] [data-export='jpeg']")).toBeVisible();
  await expect(page.locator("[data-export-menu] [data-export='pdf']")).toBeVisible();
  await expect(page.locator("[data-export-menu] [data-export='clipboard']")).toBeVisible();
  await page.locator("[data-export-menu] summary").click();

  const toolbarBox = await page.locator(".toolbar").boundingBox();
  const posterBox = await page.locator(".infographic").boundingBox();
  const uploadBox = await page.locator(".upload-box").boundingBox();
  const exportBox = await page.locator("[data-export-menu]").boundingBox();

  if (!toolbarBox || !posterBox || !uploadBox || !exportBox) {
    throw new Error("Toolbar, poster, upload, or export actions are not visible");
  }

  expect(Math.round(toolbarBox.width)).toBe(Math.round(posterBox.width));
  expect(Math.round(uploadBox.height)).toBeLessThanOrEqual(40);
  expect(Math.round(exportBox.x - (uploadBox.x + uploadBox.width))).toBeGreaterThanOrEqual(16);

  await expectToolbarLanguage(page, "ru");
  await expect(page.locator("[data-template-select]")).toHaveCount(0);
  await expect(page.locator("[data-theme-select]")).toHaveCount(0);
  await expect(page.locator("[data-analysis-audit]")).toHaveCount(0);

  const scrollY = await page.evaluate(() => {
    window.scrollTo(0, 1000);
    return window.scrollY;
  });
  await page.waitForTimeout(100);

  const scrolledToolbarBox = await page.locator(".toolbar").boundingBox();

  if (!scrolledToolbarBox) {
    throw new Error("Toolbar is not visible after page scroll");
  }

  expect(scrollY).toBeGreaterThan(0);
  expect(scrolledToolbarBox.y).toBeGreaterThanOrEqual(11);
  expect(scrolledToolbarBox.y).toBeLessThanOrEqual(13);
});

test("hides clipboard export when clipboard image support is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ClipboardItem", { value: undefined });
  });
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator("[data-export-menu]")).toBeVisible();
  await expect(page.locator("[data-export='clipboard']")).toHaveCount(0);
});

test("hides clipboard export when image/png clipboard items are unsupported", async ({ page }) => {
  await page.addInitScript(() => {
    function ClipboardItem() {
      return undefined;
    }
    ClipboardItem.supports = (type) => type !== "image/png";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write() {
          return Promise.resolve();
        }
      }
    });
    Object.defineProperty(window, "ClipboardItem", { configurable: true, value: ClipboardItem });
  });
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator("[data-export='clipboard']")).toHaveCount(0);
});

test("prevents browser navigation when dropping a file after poster load", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  const dropWasPrevented = await page.locator(".poster-scroll").evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File(["<gpx />"], "replacement.gpx", { type: "application/gpx+xml" })
    );
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer
    });

    return !element.dispatchEvent(event);
  });

  expect(dropWasPrevented).toBe(true);
  await expect(page.locator(".app-shell")).toHaveClass(/app-shell--has-poster/);
  await expect(page.locator(".poster-header")).not.toContainText("replacement.gpx");
});

test("prevents browser navigation when dropping a file outside the empty-state drop zone", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");

  const dropWasPrevented = await page.locator(".toolbar").evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["<gpx />"], "outside.gpx", { type: "application/gpx+xml" }));
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer
    });

    return !element.dispatchEvent(event);
  });

  expect(dropWasPrevented).toBe(true);
  await expect(page.locator("[data-testid='empty-state']")).toBeVisible();
  await expect(page.locator(".app-shell")).not.toContainText("outside.gpx");
});

test("renders a poster when dropping a valid GPX onto the empty state", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");

  const source = await readFile(resolve("tests/fixtures/valid-track.gpx"), "utf8");
  await dropTextFileOnEmptyState(page, {
    fileName: "valid-track.gpx",
    mimeType: "application/gpx+xml",
    contents: source
  });

  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator(".poster-header")).toContainText("Test Ridge Route");
});

test("switches map style without changing the loaded poster", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.route("https://**.tile-cyclosm.openstreetmap.fr/**", (route) => route.abort());
  await page.goto("/");
  await uploadFixture(page);

  await expect(page.locator("[data-map-style-menu]")).toBeVisible();
  await page.locator("[data-map-style-menu] summary").click();
  await page.getByRole("radio", { name: /CyclOSM/ }).evaluate((option) => {
    if (!(option instanceof HTMLInputElement)) {
      throw new Error("Map style option input was not found");
    }

    option.checked = true;
    option.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.locator("[data-map-style-menu] summary")).toContainText("CyclOSM");
  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator(".metric-table__cell")).toHaveCount(12);
  await expect(page.locator("[data-map-style-option][value='cyclosm']")).toBeChecked();

  await page.reload();
  await uploadFixture(page);

  await expect(page.locator("[data-map-style-menu] summary")).toContainText("CyclOSM");
});

test("persists the selected metric source across reloads", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await modeMenu.locator("summary").click();
  await chooseRadioOption(page, /From track points/);
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_raw"
  );

  await page.reload();
  await uploadFixture(page);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_raw"
  );
  await expect(page.locator("[data-analysis-mode-option][value='recomputed_raw']")).toBeChecked();
});

test("closes other command bar selectors when opening the export menu", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");
  await uploadFixture(page);

  const languageMenu = page.locator("[data-language-menu]");
  const mapStyleMenu = page.locator("[data-map-style-menu]");
  const exportMenu = page.locator("[data-export-menu]");

  await mapStyleMenu.locator("summary").click();
  await expect(mapStyleMenu).toHaveAttribute("open", "");

  await exportMenu.locator("summary").click();
  await expect(exportMenu).toHaveAttribute("open", "");
  await expect(mapStyleMenu).not.toHaveAttribute("open", "");

  await languageMenu.locator("summary").click();
  await expect(languageMenu).toHaveAttribute("open", "");
  await expect(exportMenu).not.toHaveAttribute("open", "");
});

test("prints the rendered poster from a separate toolbar action", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    const probeWindow = /** @type {Window & { __printCalls?: number }} */ (window);
    probeWindow.__printCalls = 0;
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        probeWindow.__printCalls = (probeWindow.__printCalls ?? 0) + 1;
      }
    });
  });

  let mapRequestCount = 0;
  /** @type {() => void} */
  let releaseMap = () => {};
  const mapRelease = new Promise((resolve) => {
    releaseMap = () => resolve(undefined);
  });

  await page.route("**/src/render/map.js**", async (route) => {
    mapRequestCount += 1;
    await mapRelease;
    await route.continue();
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => mapRequestCount).toBe(1);
  await expect(page.locator("[data-static-route]")).toHaveCount(0);

  const exportMenu = page.locator("[data-export-menu]");
  const printButton = page.getByRole("button", { name: "Print" });

  await expect(printButton).toBeVisible();
  await exportMenu.locator("summary").click();
  await expect(exportMenu).toHaveAttribute("open", "");

  await printButton.click();
  await printButton.click();

  await expect(exportMenu).not.toHaveAttribute("open", "");
  await page.waitForTimeout(250);
  expect(await getPrintCallCount(page)).toBe(0);

  releaseMap();

  await expect(page.locator("[data-static-route]")).toBeVisible();
  await expect.poll(() => getPrintCallCount(page)).toBe(1);

  await printButton.click();
  await expect.poll(() => getPrintCallCount(page)).toBe(2);

  await page.setViewportSize(A4_PRINT_PAGE_CSS_PIXELS);
  await page.emulateMedia({ media: "print" });

  await expect(page.locator(".toolbar")).toHaveCSS("display", "none");
  await expect(page.locator(".app-footer")).toHaveCSS("display", "none");
  await expect(page.locator(".app-shell")).toHaveCSS("padding-top", "0px");
  await expect(page.locator(".poster-scroll")).toHaveCSS("overflow-x", "visible");
  await expect(page.locator(".poster-scroll")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".poster-preview-frame")).toHaveCSS("overflow-x", "hidden");
  await expect(page.locator(".poster-preview-scale")).not.toHaveCSS("transform", "none");
  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator(".infographic")).toHaveCSS("display", "grid");

  const printPosterBox = await page.locator(".infographic").boundingBox();

  if (!printPosterBox) {
    throw new Error("Printed poster is not measurable");
  }

  expect(printPosterBox.width).toBeLessThanOrEqual(A4_PRINT_PAGE_CSS_PIXELS.width + 1);
  expect(printPosterBox.height).toBeLessThanOrEqual(A4_PRINT_PAGE_CSS_PIXELS.height + 1);

  await page.emulateMedia({ media: "screen" });
});

test("accepts GPX, TCX, and FIT files in the upload control", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-file-input]")).toHaveAttribute(
    "accept",
    ".gpx,.tcx,.fit,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml,application/octet-stream"
  );
});

test("uploads TCX and shows infographic preview", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadTcxFixture(page);

  await expect(page.locator(".poster-stats")).not.toContainText("Key metrics");
  await expect(page.locator(".metric-table")).toBeVisible();
  await expect(page.locator(".poster-header")).toContainText("workout");
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
  await expect(page.locator(".poster-map")).toBeVisible();
});

test("switches TCX metrics between recomputed points and file totals", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadTcxFixture(page);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
  await expectMetricValue(page, "distance", "13.8 km");
  await expectMetricValue(page, "moving-time", "0:10:00");
  await expectMetricValue(page, "moving-speed", "82.6 km/h");
  await expectMetricValue(page, "elevation-gain", "20.0 m");

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await modeMenu.locator("summary").click();
  await expect(modeMenu).toContainText("File totals");

  await chooseRadioOption(page, /File totals/);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "imported_summary"
  );
  await expectMetricValue(page, "distance", "2.4 km");
  await expectMetricValue(page, "moving-time", "0:10:00");
  await expectMetricValue(page, "average-speed", "14.4 km/h");
  await expectMetricValue(page, "moving-speed", "14.4 km/h");
  await expectMetricValue(page, "max-speed", "27.0 km/h");
});

test("uploads FIT and shows infographic preview", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFitFixture(page);

  await expect(page.locator(".poster-stats")).not.toContainText("Key metrics");
  await expect(page.locator(".metric-table")).toBeVisible();
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
  await expect(page.locator(".poster-map")).toBeVisible();
});

test("switches FIT metrics to imported session totals", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFitFixture(page);

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await modeMenu.locator("summary").click();
  await expect(modeMenu).toContainText("File totals");

  await chooseRadioOption(page, /File totals/);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "imported_summary"
  );
  await expectMetricValue(page, "distance", "0.6 km");
  await expectMetricValue(page, "total-time", "0:12:00");
  await expectMetricValue(page, "moving-time", "0:11:40");
  await expectMetricValue(page, "moving-speed", "3.6 km/h");
  await expectMetricValue(page, "max-speed", "9.0 km/h");
});

test("rejects unsupported text uploads", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");

  await page.locator("[data-file-input]").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello", "utf8")
  });

  await expect(page.locator(".message--error")).toContainText(
    "Choose a GPX, TCX, FIT, or XML file with a track."
  );
  await expect(page.locator(".infographic")).toHaveCount(0);
});

[
  {
    name: "malformed GPX XML",
    fileName: "malformed.gpx",
    mimeType: "application/gpx+xml",
    contents: '<gpx><trk><trkseg><trkpt lat="43.1" lon="42.1"></trkseg></trk></gpx>',
    message: "The XML file could not be parsed."
  },
  {
    name: "empty GPX XML",
    fileName: "empty.gpx",
    mimeType: "application/gpx+xml",
    contents: "<gpx><trk><trkseg /></trk></gpx>",
    message: "The route file does not contain route points."
  },
  {
    name: "missing coordinate GPX",
    fileName: "missing-coordinate.gpx",
    mimeType: "application/gpx+xml",
    contents:
      '<gpx><trk><trkseg><trkpt lat="43.1"><time>2024-05-25T08:00:00Z</time></trkpt></trkseg></trk></gpx>',
    message: "A route point does not contain coordinates."
  },
  {
    name: "out-of-bounds GPX",
    fileName: "out-of-bounds.gpx",
    mimeType: "application/gpx+xml",
    contents:
      '<gpx><trk><trkseg><trkpt lat="143.1" lon="42.1"><time>2024-05-25T08:00:00Z</time></trkpt></trkseg></trk></gpx>',
    message: "A route point contains coordinates outside geographic bounds."
  },
  {
    name: "invalid TCX",
    fileName: "invalid.tcx",
    mimeType: "application/vnd.garmin.tcx+xml",
    contents: "<TrainingCenterDatabase>",
    message: "The XML file could not be parsed."
  }
].forEach(({ name, fileName, mimeType, contents, message }) => {
  test(`rejects ${name} uploads`, async ({ page }) => {
    await useSavedLanguage(page, "en");
    await page.goto("/");

    await uploadTextFile(page, fileName, mimeType, contents);

    await expect(page.locator(".message--error")).toContainText(message);
    await expect(page.locator(".infographic")).toHaveCount(0);
  });
});

test("clears the previous poster after a malformed GPX upload", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);
  await expect(page.locator(".infographic")).toBeVisible();

  await uploadTextFile(page, "malformed.gpx", "application/gpx+xml", "<gpx><trk>");

  await expect(page.locator(".message--error")).toContainText("The XML file could not be parsed.");
  await expect(page.locator(".infographic")).toHaveCount(0);
});

test("rejects a bad FIT binary with a generic parse error", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");

  await page.locator("[data-file-input]").setInputFiles({
    name: "bad.fit",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0, 1, 2, 3, 4, 5])
  });

  await expect(page.locator(".message--error")).toContainText("Could not read the file.");
  await expect(page.locator(".infographic")).toHaveCount(0);
});

test("shows an elevation warning while rendering a track without elevation", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");

  await uploadFixtureFile(page, "no-elevation.gpx", "application/gpx+xml");

  await expect(page.locator(".message--warning")).toContainText(
    "The route file has no elevation data. Elevation metrics and charts will be hidden."
  );
  await expect(page.locator(".infographic")).toBeVisible();
  await expectMetricValue(page, "elevation-gain", /^(?!.*m).+$/);
  await expectMetricValue(page, "elevation-loss", /^(?!.*m).+$/);
  await expect(page.locator("[data-chart='elevation']")).toContainText(
    "Elevation data unavailable"
  );
});

test("shows a time warning while rendering a track without timestamps", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");

  await uploadFixtureFile(page, "no-time.gpx", "application/gpx+xml");

  await expect(page.locator(".message--warning")).toContainText(
    "The route file has no time data. Speed and moving time will be hidden."
  );
  await expect(page.locator(".infographic")).toBeVisible();
  await expectMetricValue(page, "moving-time", /^(?!.*:).+$/);
  await expectMetricValue(page, "average-speed", /^(?!.*km\/h).+$/);
  await expectMetricValue(page, "moving-speed", /^(?!.*km\/h).+$/);
  await expect(page.locator("[data-chart='speed']")).toHaveCount(0);
});

test("uploads GPX-like XML route points and falls back to the file name", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");

  await uploadTextFile(
    page,
    "xml-route.xml",
    "application/xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <RouteEnvelope>
      <rte>
        <rtept lat="43.100000" lon="42.100000">
          <ele>620</ele><time>2024-05-25T08:00:00Z</time>
        </rtept>
        <rtept lat="43.101000" lon="42.102000">
          <ele>640</ele><time>2024-05-25T08:05:00Z</time>
        </rtept>
      </rte>
    </RouteEnvelope>`
  );

  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator(".poster-header")).toContainText("xml-route");
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
});

test("rejects waypoint-only XML as an empty track", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await page.goto("/");

  await uploadTextFile(
    page,
    "waypoints.xml",
    "application/xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <RouteEnvelope>
      <wpt lat="43.1" lon="42.1"><name>Only waypoint</name></wpt>
    </RouteEnvelope>`
  );

  await expect(page.locator(".message--error")).toContainText(
    "The route file does not contain route points."
  );
  await expect(page.locator(".infographic")).toHaveCount(0);
});

test("shows a large-file warning while still rendering the dropped track", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");

  const source = await readFile(resolve("tests/fixtures/valid-track.gpx"), "utf8");
  await dropTextFileOnEmptyState(page, {
    fileName: "large-valid-track.gpx",
    mimeType: "application/gpx+xml",
    contents: source,
    size: 51 * 1024 * 1024
  });

  await expect(page.locator(".message--warning")).toContainText(
    "The file is larger than 50 MB. Processing and export may take longer."
  );
  await expect(page.locator(".infographic")).toBeVisible();
});

test("keeps loaded toolbar out of sticky mode on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useSavedLanguage(page, "ru");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  await expect(page.locator(".app-shell")).toHaveClass(/app-shell--has-poster/);
  await expect(page.locator(".toolbar")).toHaveCSS("position", "static");
  await expect(page.locator(".poster-scroll")).toHaveCSS("overflow-x", "auto");

  const toolbarBox = await page.locator(".toolbar").boundingBox();

  if (!toolbarBox) {
    throw new Error("Toolbar is not visible before mobile page scroll");
  }

  const scrollY = await page.evaluate(() => {
    window.scrollTo(0, 400);
    return window.scrollY;
  });
  await page.waitForTimeout(100);

  const scrolledToolbarBox = await page.locator(".toolbar").boundingBox();

  if (!scrolledToolbarBox) {
    throw new Error("Toolbar is not measurable after mobile page scroll");
  }

  expect(Math.round(scrolledToolbarBox.y)).toBe(Math.round(toolbarBox.y - scrollY));
});

test("keeps wrapped toolbar language menu panel inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 844 });
  await useSavedLanguage(page, "ru");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);
  await expect(page.locator(".infographic")).toBeVisible();
  await page.addStyleTag({
    content: ".export-menu { flex-basis: 100%; }"
  });

  const exportBox = await page.locator("[data-export-menu]").boundingBox();
  const summary = page.locator("[data-language-menu] summary");

  await summary.click();
  await expect(page.locator("[data-language-menu]")).toHaveAttribute("open", "");

  const summaryBox = await summary.boundingBox();
  const panelBox = await page.locator(".language-menu__panel").boundingBox();

  if (!exportBox || !summaryBox || !panelBox) {
    throw new Error("Language menu layout is not measurable");
  }

  expect(summaryBox.y).toBeGreaterThan(exportBox.y + exportBox.height);
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(620);
});

test("fits the poster preview to a narrow viewport while keeping export dimensions", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useSavedLanguage(page, "ru");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  const previewBox = await page.locator(".poster-scroll").boundingBox();
  const posterBox = await page.locator(".infographic").boundingBox();
  const posterCssWidth = await page
    .locator(".infographic")
    .evaluate((node) => window.getComputedStyle(node).width);
  const hasHorizontalPreviewOverflow = await page
    .locator(".poster-scroll")
    .evaluate((node) => node.scrollWidth > node.clientWidth + 1);

  if (!previewBox || !posterBox) {
    throw new Error("Preview or poster is not visible");
  }

  expect(Math.round(Number.parseFloat(posterCssWidth))).toBe(1240);
  expect(posterBox.width).toBeLessThanOrEqual(previewBox.width + 1);
  expect(hasHorizontalPreviewOverflow).toBe(false);
});

test("delegates GPX analysis work to a module worker", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const probeWindow =
      /** @type {Window & { __trackWorkerMessages?: string[], __trackWorkerUrls?: string[], __trackWorkerConstructions?: { url: string, type?: string }[] }} */ (
        window
      );
    probeWindow.__trackWorkerMessages = [];
    probeWindow.__trackWorkerUrls = [];
    probeWindow.__trackWorkerConstructions = [];
    window.Worker = class InstrumentedWorker extends NativeWorker {
      constructor(url, options) {
        const workerUrl = String(url);
        probeWindow.__trackWorkerUrls?.push(workerUrl);
        probeWindow.__trackWorkerConstructions?.push({
          url: workerUrl,
          type: options?.type
        });
        super(url, options);
      }

      postMessage(message, transfer) {
        probeWindow.__trackWorkerMessages?.push(message?.type);
        return transfer === undefined
          ? super.postMessage(message)
          : super.postMessage(message, transfer);
      }
    };
  });

  await page.goto("/");
  const workerStateBeforeUpload = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __trackWorkerMessages?: string[], __trackWorkerUrls?: string[], __trackWorkerConstructions?: { url: string, type?: string }[] }} */ (
        window
      );
    return {
      urls: probeWindow.__trackWorkerUrls ?? [],
      constructions: probeWindow.__trackWorkerConstructions ?? [],
      messages: probeWindow.__trackWorkerMessages ?? []
    };
  });
  expect(workerStateBeforeUpload).toEqual({
    urls: [],
    constructions: [],
    messages: []
  });

  await uploadFixture(page);
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );

  const workerStateAfterUpload = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __trackWorkerMessages?: string[], __trackWorkerUrls?: string[], __trackWorkerConstructions?: { url: string, type?: string }[] }} */ (
        window
      );
    return {
      urls: probeWindow.__trackWorkerUrls ?? [],
      constructions: probeWindow.__trackWorkerConstructions ?? [],
      messages: probeWindow.__trackWorkerMessages ?? []
    };
  });

  expect(workerStateAfterUpload.urls.some((url) => url.includes("track-analysis-worker"))).toBe(
    true
  );
  expect(
    workerStateAfterUpload.constructions.some(
      (construction) =>
        construction.url.includes("track-analysis-worker") && construction.type === "module"
    )
  ).toBe(true);
  expect(workerStateAfterUpload.messages).toContain("analyze-track-source");

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await modeMenu.locator("summary").click();
  await chooseRadioOption(page, /From track points/);
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_raw"
  );

  const messagesAfterModeSwitch = await page.evaluate(() => {
    const probeWindow = /** @type {Window & { __trackWorkerMessages?: string[] }} */ (window);
    return probeWindow.__trackWorkerMessages ?? [];
  });

  expect(messagesAfterModeSwitch).toContain("analyze-parsed-track");
});

test("falls back to main-thread analysis when Worker construction fails", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    window.Worker = /** @type {typeof Worker} */ (
      /** @type {unknown} */ (
        class ThrowingWorker {
          constructor() {
            throw new Error("Worker unavailable in this browser");
          }
        }
      )
    );
  });
  await page.goto("/");

  await uploadFixture(page);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
  await expectMetricValue(page, "distance", "1.1 km");
  await expectMetricValue(page, "moving-time", "0:28:00");
  await expectMetricValue(page, "moving-speed", "2.4 km/h");
  await expectMetricValue(page, "elevation-gain", "124.5 m");
});

test("switches site and poster language after GPX upload", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  await expect(page.locator(".poster-stats")).not.toContainText("Key metrics");
  await expect(page.locator(".metric-table")).toBeVisible();
  await selectToolbarLanguage(page, "fr", /Français/);

  await expect(page.locator(".toolbar__tagline")).toHaveText(
    "Transformez n'importe quel itinéraire en poster"
  );
  await expect(page.locator(".poster-stats")).not.toContainText("Indicateurs clés");
  await expect(page.getByText("Profil d'altitude")).toBeVisible();
  await expect(page.locator(".poster-stats").getByText("Distance", { exact: true })).toBeVisible();
  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await expect(modeMenu).toContainText("Indicateurs");
  await expect(modeMenu).toContainText("Recommandé");
  await expect(page.locator("[data-analysis-audit]")).toHaveCount(0);
  await expect(page.locator(".static-map-fallback")).toContainText(
    "Le fond de carte est indisponible"
  );
});

test("refreshes track location when the poster language changes after GPX upload", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.unroute(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN);

  const requestedLanguages = [];
  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, async (route) => {
    const localityLanguage =
      new URL(route.request().url()).searchParams.get("localityLanguage") ?? "";
    requestedLanguages.push(localityLanguage);
    const location =
      localityLanguage === "fr"
        ? { principalSubdivision: "French Region", countryName: "France" }
        : { principalSubdivision: "English Region", countryName: "England" };

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(location)
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect(page.locator(".poster-header__location")).toContainText("English Region, England");

  await changeToolbarLanguageWithoutActionWait(page, "fr");
  await expectToolbarLanguage(page, "fr");

  await expect(page.locator(".poster-header__location")).toContainText("French Region, France");
  expect(requestedLanguages).toEqual(["en", "fr"]);
});

test("drops a pending track location lookup when the poster language changes", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.unroute(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN);

  let locationRequests = 0;
  let releaseOldLocationResponse = () => {};
  let finishOldLocationResponse = () => {};
  const oldLocationResponseRelease = new Promise((resolve) => {
    releaseOldLocationResponse = () => resolve(undefined);
  });
  const oldLocationResponseFinished = new Promise((resolve) => {
    finishOldLocationResponse = () => resolve(undefined);
  });

  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, async (route) => {
    locationRequests += 1;
    if (locationRequests === 1) {
      await oldLocationResponseRelease;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          principalSubdivision: "Old Locale Region",
          countryName: "Old Locale Country"
        })
      });
      finishOldLocationResponse();
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        principalSubdivision: "Current Locale Region",
        countryName: "Current Locale Country"
      })
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => locationRequests).toBe(1);
  await changeToolbarLanguageWithoutActionWait(page, "fr");
  await expectToolbarLanguage(page, "fr");
  await expect.poll(() => locationRequests).toBe(2);
  await expect(page.locator(".poster-header__location")).toContainText(
    "Current Locale Region, Current Locale Country"
  );

  releaseOldLocationResponse();
  await oldLocationResponseFinished;
  await page.waitForTimeout(250);

  await expect(page.locator(".poster-header__location")).toContainText(
    "Current Locale Region, Current Locale Country"
  );
  await expect(page.locator(".poster-header__location")).not.toContainText("Old Locale Region");
});

test("restores analysis mode menu focus when track location resolves", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.unroute(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN);

  let locationRequests = 0;
  let releaseLocationResponse = () => {};
  const locationResponseRelease = new Promise((resolve) => {
    releaseLocationResponse = () => resolve(undefined);
  });

  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, async (route) => {
    locationRequests += 1;
    await locationResponseRelease;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        principalSubdivision: "Focus Region",
        countryName: "Focus Country"
      })
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => locationRequests).toBe(1);

  const modeSummary = page.locator("[data-analysis-mode-menu] summary");
  await modeSummary.focus();
  await expect(modeSummary).toBeFocused();

  releaseLocationResponse();
  await expect(page.locator(".poster-header__location")).toContainText(
    "Focus Region, Focus Country"
  );
  await expect(page.locator("[data-analysis-mode-menu] summary")).toBeFocused();
});

test("keeps fallback shell usable while the selected language dictionary loads", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  let ruLocaleRequests = 0;
  let releaseRuLocale = () => {};
  const ruLocaleRelease = new Promise((resolve) => {
    releaseRuLocale = () => resolve(undefined);
  });

  await page.route("**/src/i18n/locales/ru.js**", async (route) => {
    ruLocaleRequests += 1;
    await ruLocaleRelease;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.locator("[data-testid='empty-state']")).toContainText("Upload a route file");

  await selectToolbarLanguage(page, "ru", /Русский/);
  await expect.poll(() => ruLocaleRequests).toBe(1);
  await page.waitForTimeout(250);
  await expect(page.locator("[data-testid='empty-state']")).toContainText("Upload a route file");
  await expect(page.locator("[data-file-input]")).toBeEnabled();
  await expectToolbarLanguage(page, "ru");

  releaseRuLocale();
  await expect(page.locator("[data-testid='empty-state']")).toContainText(
    "Загрузите файл маршрута, чтобы собрать инфографику"
  );
});

test("switches analysis mode after GPX upload", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  let terrainRequests = 0;
  await page.route("https://api.open-meteo.com/v1/elevation**", async (route) => {
    terrainRequests += 1;
    await route.fulfill({ json: { elevation: [620, 650, 710, 705, 740] } });
  });
  await page.goto("/");
  await uploadFixture(page);

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await expect(modeMenu).toBeVisible();
  await expect(modeMenu).toContainText("Metrics");
  await expect(modeMenu).toContainText("Recommended");
  await expect(modeMenu.locator("summary")).toHaveAccessibleName(/Metrics.*Recommended/);
  await expect(modeMenu).not.toContainText("Terrain elevation");
  await expect(modeMenu).not.toContainText("Base" + "Camp");
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
  expect(terrainRequests).toBe(0);

  await modeMenu.locator("summary").click();
  await expect(modeMenu).toContainText("From track points");
  await expect(modeMenu).toContainText("Recalculates metrics from file points");
  await chooseRadioOption(page, /From track points/);
  await expect(modeMenu.locator("summary")).toHaveAccessibleName(/Metrics.*From track points/);
  await expect(modeMenu.locator("summary")).toBeFocused();

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_raw"
  );
});

test("loads terrain elevation only after selecting terrain mode for a track with file elevation", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await enableOpenMeteoTerrainProvider(page);
  await abortOpenFreeMapTiles(page);
  let terrainRequests = 0;
  await page.route("https://api.open-meteo.com/v1/elevation**", async (route) => {
    terrainRequests += 1;
    await route.fulfill({ json: { elevation: [620, 650, 710, 705, 740] } });
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const probeWindow = /** @type {Window & { __terrainWorkerMessages?: string[] }} */ (window);
    probeWindow.__terrainWorkerMessages = [];

    window.Worker = class TerrainProbeWorker extends NativeWorker {
      postMessage(message, transfer) {
        probeWindow.__terrainWorkerMessages?.push(message?.type);
        return transfer === undefined
          ? super.postMessage(message)
          : super.postMessage(message, transfer);
      }
    };
  });
  await page.goto("/");
  await uploadFixture(page);

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await expect(modeMenu).toContainText("Recommended");
  await modeMenu.locator("summary").click();
  await expect(modeMenu).toContainText("Fetch terrain elevation");
  expect(terrainRequests).toBe(0);

  await chooseRadioOption(page, /Fetch terrain elevation/);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_terrain"
  );
  expect(terrainRequests).toBe(1);

  const workerMessages = await page.evaluate(() => {
    const probeWindow = /** @type {Window & { __terrainWorkerMessages?: string[] }} */ (window);
    return probeWindow.__terrainWorkerMessages ?? [];
  });
  expect(workerMessages).toContain("enrich-parsed-track-terrain");
  expect(workerMessages).toContain("analyze-parsed-track");
});

test("keeps a pending track location current after terrain replacement", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await enableOpenMeteoTerrainProvider(page);
  await abortOpenFreeMapTiles(page);
  await page.route("https://api.open-meteo.com/v1/elevation**", async (route) => {
    await route.fulfill({ json: { elevation: [620, 650, 710, 705, 740] } });
  });
  await page.unroute(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN);

  let locationRequests = 0;
  let releaseLocationResponse = () => {};
  const locationResponseRelease = new Promise((resolve) => {
    releaseLocationResponse = () => resolve(undefined);
  });

  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, async (route) => {
    locationRequests += 1;
    await locationResponseRelease;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        principalSubdivision: "Terrain Region",
        countryName: "Terrain Country"
      })
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => locationRequests).toBe(1);

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await expect(modeMenu).toContainText("Recommended");
  await modeMenu.locator("summary").click();
  await chooseRadioOption(page, /Fetch terrain elevation/);
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_terrain"
  );

  releaseLocationResponse();
  await expect(page.locator(".poster-header__location")).toContainText(
    "Terrain Region, Terrain Country"
  );
});

test("keeps current metrics and shows a warning when terrain elevation replacement fails", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await enableOpenMeteoTerrainProvider(page);
  await abortOpenFreeMapTiles(page);
  let terrainRequests = 0;
  await page.route("https://api.open-meteo.com/v1/elevation**", async (route) => {
    terrainRequests += 1;
    await route.fulfill({ json: { elevation: [620, null, 710, 705, 740] } });
  });
  await page.goto("/");
  await uploadFixture(page);

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await expect(modeMenu).toContainText("Recommended");

  await modeMenu.locator("summary").click();
  await chooseRadioOption(page, /Fetch terrain elevation/);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
  await expect(page.locator("[data-analysis-mode-menu]")).toContainText("Recommended");
  await expect(page.locator(".message--warning")).toContainText("Terrain elevation is unavailable");
  expect(terrainRequests).toBe(1);

  await page.locator("[data-analysis-mode-menu] summary").click();
  await chooseRadioOption(page, /Fetch terrain elevation/);

  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
  await expect(page.locator(".message--warning")).toHaveCount(1);
  expect(terrainRequests).toBe(1);
});

test("loads terrain matrix track with restored elevation warning and known metrics", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await enableOpenMeteoTerrainProvider(page);
  await abortOpenFreeMapTiles(page);
  let terrainRequests = 0;
  await page.route("https://api.open-meteo.com/v1/elevation**", async (route) => {
    terrainRequests += 1;
    await route.fulfill({ json: { elevation: [100, 112, 124, 104, 92] } });
  });
  await page.goto("/");

  await uploadFixtureFile(page, "matrix-phone-terrain-gapped.gpx", "application/gpx+xml");

  await expect(page.locator(".message--warning")).toContainText(
    "Elevation was restored from terrain data and may differ from device altitude."
  );
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_terrain"
  );
  await expect(page.locator("[data-analysis-mode-menu]")).toContainText("Terrain elevation");
  await expectMetricValue(page, "distance", "0.2 km");
  await expectMetricValue(page, "total-time", "0:04:30");
  await expectMetricValue(page, "moving-time", "0:01:30");
  await expectMetricValue(page, "moving-speed", "9.4 km/h");
  await expectMetricValue(page, "elevation-gain", "22.4 m");
  await expectMetricValue(page, "elevation-loss", "30.4 m");
  expect(terrainRequests).toBe(1);
});

test("ignores stale terrain replacement after a newer GPX upload", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await enableOpenMeteoTerrainProvider(page);
  await abortOpenFreeMapTiles(page);
  let terrainRequests = 0;
  /** @type {() => void} */
  let releaseTerrain = () => {};
  /** @type {Promise<void>} */
  const terrainRelease = new Promise((resolve) => {
    releaseTerrain = resolve;
  });
  await page.route("https://api.open-meteo.com/v1/elevation**", async (route) => {
    terrainRequests += 1;
    await terrainRelease;
    await route.fulfill({ json: { elevation: [620, 650, 710, 705, 740] } });
  });
  await page.goto("/");
  await uploadFixture(page);

  const modeMenu = page.locator("[data-analysis-mode-menu]");
  await expect(modeMenu).toContainText("Recommended");
  await modeMenu.locator("summary").click();
  await chooseRadioOption(page, /Fetch terrain elevation/);
  await expect.poll(() => terrainRequests).toBe(1);

  await uploadCleanedRouteFixture(page);
  await expect(page.locator(".poster-header")).toContainText("Cleaned Route");
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );

  const staleTerrainResponse = page.waitForResponse("https://api.open-meteo.com/v1/elevation**");
  releaseTerrain();
  await staleTerrainResponse;

  await expect(page.locator(".poster-header")).toContainText("Cleaned Route");
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
});

test("keeps a pending source upload current when the old track analysis mode changes", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const probeWindow =
      /** @type {Window & { __sourceAnalysisPostCount?: number, __releaseDelayedSourceAnalysis?: () => boolean, __hasDelayedSourceAnalysis?: () => boolean }} */ (
        window
      );
    let delayedSourceAnalysis = /** @type {null | (() => void)} */ (null);
    probeWindow.__sourceAnalysisPostCount = 0;
    probeWindow.__hasDelayedSourceAnalysis = () => Boolean(delayedSourceAnalysis);
    probeWindow.__releaseDelayedSourceAnalysis = () => {
      const release = delayedSourceAnalysis;
      delayedSourceAnalysis = null;

      if (!release) {
        return false;
      }

      release();
      return true;
    };

    window.Worker = class DelayedSourceAnalysisWorker extends NativeWorker {
      postMessage(message, transfer) {
        if (message?.type === "analyze-track-source") {
          probeWindow.__sourceAnalysisPostCount = (probeWindow.__sourceAnalysisPostCount ?? 0) + 1;

          if (probeWindow.__sourceAnalysisPostCount === 2) {
            delayedSourceAnalysis = () => {
              if (transfer === undefined) {
                NativeWorker.prototype.postMessage.call(this, message);
              } else {
                NativeWorker.prototype.postMessage.call(this, message, transfer);
              }
            };
            return;
          }
        }

        return transfer === undefined
          ? super.postMessage(message)
          : super.postMessage(message, transfer);
      }
    };
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect(page.locator(".poster-header")).toContainText("Test Ridge Route");
  await expect(page.locator("[data-analysis-mode-menu]")).toContainText("Recommended");

  await uploadSecondRouteFixture(page);
  await page.waitForFunction(() => {
    const probeWindow = /** @type {Window & { __hasDelayedSourceAnalysis?: () => boolean }} */ (
      window
    );

    return probeWindow.__hasDelayedSourceAnalysis?.() === true;
  });
  await expect(page.locator(".poster-header")).toContainText("Test Ridge Route");

  await page.locator("[data-analysis-mode-menu] summary").click();
  await chooseRadioOption(page, /From track points/);
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_raw"
  );

  const released = await page.evaluate(() => {
    const probeWindow = /** @type {Window & { __releaseDelayedSourceAnalysis?: () => boolean }} */ (
      window
    );

    return probeWindow.__releaseDelayedSourceAnalysis?.() ?? false;
  });

  expect(released).toBe(true);
  await expect(page.locator(".poster-header")).toContainText("Second Route");
  await expect(page.locator("[data-analysis-mode-menu]")).toContainText("Recommended");
  await expect(page.locator(".infographic")).toHaveAttribute(
    "data-analysis-mode",
    "recomputed_filtered"
  );
});

test("renders speed-colored route from the cleaned analysis points", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadCleanedRouteFixture(page);

  await expect(page.locator(".poster-header")).toContainText("Cleaned Route");
  await expect(page.locator("[data-analysis-audit]")).toHaveCount(0);
  await expect(page.locator("[data-static-route-segment]")).toHaveCount(4);
});

test("exports infographic downloads and clipboard image", async ({ baseURL, context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useSavedLanguage(page, "ru");
  const origin = new URL(baseURL ?? "http://127.0.0.1:5173").origin;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin
  });
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await installClipboardProbe(page);
  await uploadFixture(page);
  await expect(page.locator("[data-static-route]")).toBeVisible();
  await expect(page.locator("[data-chart-engine='echarts']")).toBeVisible();

  for (const [kind, extension] of [
    ["png", "png"],
    ["jpeg", "jpg"],
    ["pdf", "pdf"]
  ]) {
    const downloadPromise = page.waitForEvent("download");
    await clickExport(page, kind);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`valid-track.${extension}`);
    expect(await download.failure()).toBeNull();

    const path = await download.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(/** @type {string} */ (path));
    expectExportPayload(kind, bytes);

    if (kind === "png") {
      expect(readPngDimensions(bytes)).toEqual(EXPECTED_EXPORT_PNG_SIZE);
    }
  }

  await clickExport(page, "clipboard");
  await waitForClipboardWrite(page);
  await expectClipboardImageWrite(page);
  await expect(page.locator(".message--error")).toHaveCount(0);
});

test("clears a previous export error after a later successful export", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    const probeWindow =
      /** @type {Window & { __exportAttempts?: number; __successfulExportAttempts?: number }} */ (
        window
      );
    probeWindow.__exportAttempts = 0;
    probeWindow.__successfulExportAttempts = 0;
  });

  await page.route("**/src/services/image-export-service.js**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export async function exportPng() {
          window.__exportAttempts = (window.__exportAttempts || 0) + 1;
          if (window.__exportAttempts === 1) {
            throw new Error("first export failed");
          }

          window.__successfulExportAttempts = (window.__successfulExportAttempts || 0) + 1;
        }

        export async function exportJpeg() {}
        export async function copyPngToClipboard() {}
      `
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect(page.locator(".infographic")).toBeVisible();

  await clickExport(page, "png");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probeWindow =
          /** @type {Window & { __exportAttempts?: number; __successfulExportAttempts?: number }} */ (
            window
          );

        return probeWindow.__exportAttempts;
      })
    )
    .toBe(1);
  await expect(page.locator(".message--error")).toContainText("export");

  await clickExport(page, "png");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probeWindow =
          /** @type {Window & { __exportAttempts?: number; __successfulExportAttempts?: number }} */ (
            window
          );

        return {
          attempts: probeWindow.__exportAttempts,
          successes: probeWindow.__successfulExportAttempts
        };
      })
    )
    .toEqual({ attempts: 2, successes: 1 });
  await expect(page.locator(".message--error")).toHaveCount(0);
});

test("keeps export active when track location resolves during pending render work", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.unroute(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN);
  await page.addInitScript(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; posterConnected: boolean }[] }} */ (
        window
      );
    probeWindow.__exportCalls = [];
  });

  let releaseLocationResponse = () => {};
  const locationResponseRelease = new Promise((resolve) => {
    releaseLocationResponse = () => resolve(undefined);
  });

  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, async (route) => {
    await locationResponseRelease;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        principalSubdivision: "Export Region",
        countryName: "Export Country"
      })
    });
  });

  let chartRequestCount = 0;
  let releaseCharts = () => {};
  const chartsRelease = new Promise((resolve) => {
    releaseCharts = () => resolve(undefined);
  });

  await page.route("**/src/render/elevation-chart.js**", async (route) => {
    chartRequestCount += 1;
    await chartsRelease;
    await route.continue();
  });

  let imageExportModuleRequests = 0;
  await page.route("**/src/services/image-export-service.js**", async (route) => {
    imageExportModuleRequests += 1;
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export async function exportPng(node, fileName) {
          window.__exportCalls = window.__exportCalls || [];
          window.__exportCalls.push({
            kind: "png",
            fileName,
            posterConnected: node.isConnected
          });
        }

        export async function exportJpeg() {}

        export async function copyPngToClipboard() {}
      `
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => chartRequestCount).toBe(1);
  await clickExport(page, "png");
  await page.waitForTimeout(250);
  releaseLocationResponse();
  await page.waitForTimeout(250);
  releaseCharts();

  await page.waitForFunction(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; posterConnected: boolean }[] }} */ (
        window
      );

    return (probeWindow.__exportCalls?.length ?? 0) > 0;
  });

  const calls = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });

  expect(imageExportModuleRequests).toBe(1);
  expect(calls).toEqual([
    {
      kind: "png",
      fileName: "valid-track",
      posterConnected: true
    }
  ]);
  await expect(page.locator(".poster-header__location")).toContainText(
    "Export Region, Export Country"
  );
});

test("keeps print active when track location resolves during pending render work", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.unroute(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN);
  await page.addInitScript(() => {
    const probeWindow = /** @type {Window & { __printCalls?: number }} */ (window);
    probeWindow.__printCalls = 0;
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        probeWindow.__printCalls = (probeWindow.__printCalls ?? 0) + 1;
      }
    });
  });

  let releaseLocationResponse = () => {};
  const locationResponseRelease = new Promise((resolve) => {
    releaseLocationResponse = () => resolve(undefined);
  });

  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, async (route) => {
    await locationResponseRelease;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        principalSubdivision: "Print Region",
        countryName: "Print Country"
      })
    });
  });

  let chartRequestCount = 0;
  let releaseCharts = () => {};
  const chartsRelease = new Promise((resolve) => {
    releaseCharts = () => resolve(undefined);
  });

  await page.route("**/src/render/elevation-chart.js**", async (route) => {
    chartRequestCount += 1;
    await chartsRelease;
    await route.continue();
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => chartRequestCount).toBe(1);

  await page.getByRole("button", { name: "Print" }).click();
  await page.waitForTimeout(250);
  releaseLocationResponse();
  await page.waitForTimeout(250);
  releaseCharts();

  await expect.poll(() => getPrintCallCount(page)).toBe(1);
  await expect(page.locator(".poster-header__location")).toContainText(
    "Print Region, Print Country"
  );
});

test("keeps upload shell usable while lazy poster renderer is loading before export", async ({
  page
}) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; posterConnected: boolean }[] }} */ (
        window
      );
    probeWindow.__exportCalls = [];
  });

  let rendererRequestCount = 0;
  /** @type {() => void} */
  let releaseRenderer = () => {};
  const rendererRelease = new Promise((resolve) => {
    releaseRenderer = () => resolve(undefined);
  });

  await page.route("**/src/render/templates.js**", async (route) => {
    rendererRequestCount += 1;
    await rendererRelease;
    await route.continue();
  });

  let imageExportModuleRequests = 0;
  await page.route("**/src/services/image-export-service.js**", async (route) => {
    imageExportModuleRequests += 1;
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export async function exportPng(node, fileName) {
          window.__exportCalls = window.__exportCalls || [];
          window.__exportCalls.push({
            kind: "png",
            fileName,
            posterConnected: node.isConnected
          });
        }

        export async function exportJpeg() {}

        export async function copyPngToClipboard() {}
      `
    });
  });

  const navigation = page.goto("/", { waitUntil: "domcontentloaded" }).catch((error) => error);

  await expect(page.locator("[data-testid='empty-state']")).toBeVisible();
  await expect(page.locator("[data-file-input]")).toBeEnabled();
  expect(rendererRequestCount).toBe(0);

  await uploadFixture(page);
  await expect.poll(() => rendererRequestCount).toBe(1);
  await expect(page.locator("[data-export-menu]")).toBeVisible();
  await expect(page.locator(".infographic")).toHaveCount(0);

  await clickExport(page, "png");
  await page.waitForTimeout(250);
  expect(imageExportModuleRequests).toBe(0);

  releaseRenderer();
  await navigation;

  await expect(page.locator(".infographic")).toBeVisible();
  await page.waitForFunction(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; posterConnected: boolean }[] }} */ (
        window
      );

    return (probeWindow.__exportCalls?.length ?? 0) > 0;
  });

  const callsAfterRendererLoad = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });

  expect(imageExportModuleRequests).toBe(1);
  expect(callsAfterRendererLoad).toEqual([
    {
      kind: "png",
      fileName: "valid-track",
      posterConnected: true
    }
  ]);
  await expect(page.locator(".message--error")).toHaveCount(0);
});

test("exports only after the current lazy chart render finishes", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; chartMarkerExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );
    probeWindow.__exportCalls = [];
  });

  let chartRequestCount = 0;
  /** @type {() => void} */
  let releaseCharts = () => {};
  const chartsRelease = new Promise((resolve) => {
    releaseCharts = () => resolve(undefined);
  });

  await page.route("**/src/render/elevation-chart.js**", async (route) => {
    chartRequestCount += 1;
    await chartsRelease;
    await route.continue();
  });

  let imageExportModuleRequests = 0;
  await page.route("**/src/services/image-export-service.js**", async (route) => {
    imageExportModuleRequests += 1;
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        function recordExport(kind, node, fileName) {
          window.__exportCalls = window.__exportCalls || [];
          window.__exportCalls.push({
            kind,
            fileName,
            chartMarkerExists: Boolean(node.querySelector("[data-chart-engine='echarts']")),
            posterConnected: node.isConnected
          });
        }

        export async function exportPng(node, fileName) {
          recordExport("png", node, fileName);
        }

        export async function exportJpeg(node, fileName) {
          recordExport("jpeg", node, fileName);
        }

        export async function copyPngToClipboard(node) {
          recordExport("clipboard", node);
        }
      `
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => chartRequestCount).toBe(1);
  await expect(page.locator("[data-chart-engine='echarts']")).toHaveCount(0);

  await clickExport(page, "png");
  await page.waitForTimeout(250);

  const callsBeforeChartRender = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; chartMarkerExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });
  expect(imageExportModuleRequests).toBe(0);
  expect(callsBeforeChartRender).toHaveLength(0);

  releaseCharts();

  await expect(page.locator("[data-chart-engine='echarts']")).toBeVisible();
  await page.waitForFunction(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; chartMarkerExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return (probeWindow.__exportCalls?.length ?? 0) > 0;
  });

  const callsAfterChartRender = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; chartMarkerExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });

  expect(imageExportModuleRequests).toBe(1);
  expect(callsAfterChartRender).toEqual([
    {
      kind: "png",
      fileName: "valid-track",
      chartMarkerExists: true,
      posterConnected: true
    }
  ]);
  await expect(page.locator(".message--error")).toHaveCount(0);
});

test("exports only after the current route map render promise settles", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await page.addInitScript(() => {
    const probeWindow = /** @type {Window & {
     *   __exportCalls?: { kind: string; fileName?: string; mapReady: boolean; posterConnected: boolean }[],
     *   __releaseMapRender?: () => void
     * }} */ (window);
    probeWindow.__exportCalls = [];
  });

  await page.route("**/src/render/elevation-chart.js**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export function renderElevationChart(host) {
          host.innerHTML = "<div data-chart-engine='stub'></div>";
        }
      `
    });
  });

  await page.route("**/src/render/map.js**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export function createRouteMapRenderer() {
          return {
            render(host) {
              mapRenderRequests += 1;
              host.innerHTML = "<svg data-static-route viewBox='0 0 10 10'></svg>";
              return new Promise((resolve) => {
                window.__releaseMapRender = () => {
                  host.dataset.mapReady = "true";
                  resolve({ status: "ready" });
                };
              });
            },
            dispose() {}
          };
        }

        let mapRenderRequests = 0;
        Object.defineProperty(window, "__mapRenderRequests", {
          get() {
            return mapRenderRequests;
          }
        });
      `
    });
  });

  let imageExportModuleRequests = 0;
  await page.route("**/src/services/image-export-service.js**", async (route) => {
    imageExportModuleRequests += 1;
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        export async function exportPng(node, fileName) {
          const mapHost = node.querySelector("[data-map-slot]");
          window.__exportCalls = window.__exportCalls || [];
          window.__exportCalls.push({
            kind: "png",
            fileName,
            mapReady: mapHost?.dataset.mapReady === "true",
            posterConnected: node.isConnected
          });
        }

        export async function exportJpeg() {}

        export async function copyPngToClipboard() {}
      `
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect(page.locator("[data-static-route]")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const probeWindow = /** @type {Window & { __mapRenderRequests?: number }} */ (window);
        return probeWindow.__mapRenderRequests ?? 0;
      })
    )
    .toBe(1);

  await clickExport(page, "png");
  await page.waitForTimeout(250);

  const callsBeforeMapReady = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; mapReady: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });
  expect(imageExportModuleRequests).toBe(0);
  expect(callsBeforeMapReady).toHaveLength(0);

  await page.evaluate(() => {
    const probeWindow = /** @type {Window & { __releaseMapRender?: () => void }} */ (window);
    probeWindow.__releaseMapRender?.();
  });

  await page.waitForFunction(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; mapReady: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return (probeWindow.__exportCalls?.length ?? 0) > 0;
  });

  const callsAfterMapReady = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; mapReady: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });

  expect(imageExportModuleRequests).toBe(1);
  expect(callsAfterMapReady).toEqual([
    {
      kind: "png",
      fileName: "valid-track",
      mapReady: true,
      posterConnected: true
    }
  ]);
  await expect(page.locator(".message--error")).toHaveCount(0);
});

test("exports only after the current lazy map render fallback is ready", async ({ page }) => {
  await useSavedLanguage(page, "en");
  await abortOpenFreeMapTiles(page);
  await page.addInitScript(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; staticRouteExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );
    probeWindow.__exportCalls = [];
  });

  let mapRequestCount = 0;
  /** @type {() => void} */
  let releaseMap = () => {};
  const mapRelease = new Promise((resolve) => {
    releaseMap = () => resolve(undefined);
  });

  await page.route("**/src/render/map.js**", async (route) => {
    mapRequestCount += 1;
    await mapRelease;
    await route.continue();
  });

  let imageExportModuleRequests = 0;
  await page.route("**/src/services/image-export-service.js**", async (route) => {
    imageExportModuleRequests += 1;
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        function recordExport(kind, node, fileName) {
          window.__exportCalls = window.__exportCalls || [];
          window.__exportCalls.push({
            kind,
            fileName,
            staticRouteExists: Boolean(node.querySelector("[data-static-route]")),
            posterConnected: node.isConnected
          });
        }

        export async function exportPng(node, fileName) {
          recordExport("png", node, fileName);
        }

        export async function exportJpeg(node, fileName) {
          recordExport("jpeg", node, fileName);
        }

        export async function copyPngToClipboard(node) {
          recordExport("clipboard", node);
        }
      `
    });
  });

  await page.goto("/");
  await uploadFixture(page);
  await expect.poll(() => mapRequestCount).toBe(1);
  await expect(page.locator("[data-static-route]")).toHaveCount(0);

  await clickExport(page, "png");
  await page.waitForTimeout(250);

  const callsBeforeMapRender = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; staticRouteExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });
  expect(imageExportModuleRequests).toBe(0);
  expect(callsBeforeMapRender).toHaveLength(0);

  releaseMap();

  await expect(page.locator("[data-static-route]")).toBeVisible();
  await page.waitForFunction(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; staticRouteExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return (probeWindow.__exportCalls?.length ?? 0) > 0;
  });

  const callsAfterMapRender = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __exportCalls?: { kind: string; fileName?: string; staticRouteExists: boolean; posterConnected: boolean }[] }} */ (
        window
      );

    return probeWindow.__exportCalls ?? [];
  });

  expect(imageExportModuleRequests).toBe(1);
  expect(callsAfterMapRender).toEqual([
    {
      kind: "png",
      fileName: "valid-track",
      staticRouteExists: true,
      posterConnected: true
    }
  ]);
  await expect(page.locator(".message--error")).toHaveCount(0);
});

test("shows point tooltips on elevation chart hover", async ({ page }) => {
  await useSavedLanguage(page, "ru");
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadFixture(page);

  await expect(page.locator("[data-chart-engine='echarts']")).toBeVisible();
  const chart = page.locator(".echarts-chart--elevation");
  const chartBox = await chart.boundingBox();

  if (!chartBox) {
    throw new Error("Elevation chart is not visible");
  }

  await chart.hover({
    position: {
      x: Math.round(chartBox.width * 0.5),
      y: Math.round(chartBox.height * 0.5)
    }
  });
  await expect(page.locator(".echarts-route-tooltip")).toContainText("Высота");
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} language
 */
async function expectToolbarLanguage(page, language) {
  const languageMenu = page.locator("[data-language-menu]");
  const summary = languageMenu.locator("summary");

  await expect(languageMenu).toBeVisible();
  await expect(summary).toHaveText(language.toUpperCase());
  await expect(page.locator(`[data-language-option][value="${language}"]`)).toBeChecked();
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
async function expectTextToUseOneLine(page, selector) {
  const textLayout = await page.locator(selector).evaluate((node) => {
    const styles = window.getComputedStyle(node);
    const fontSize = Number.parseFloat(styles.fontSize);
    const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.4;

    return {
      height: node.getBoundingClientRect().height,
      lineHeight
    };
  });

  expect(textLayout.height).toBeLessThanOrEqual(textLayout.lineHeight * 1.15);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 */
async function expectTextNotToBeClipped(page, selector) {
  const textBox = await page.locator(selector).evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth
  }));

  expect(textBox.scrollWidth).toBeLessThanOrEqual(textBox.clientWidth + 1);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} firstSelector
 * @param {string} secondSelector
 */
async function expectLocatorsToShareRow(page, firstSelector, secondSelector) {
  const firstBox = await page.locator(firstSelector).boundingBox();
  const secondBox = await page.locator(secondSelector).boundingBox();

  if (!firstBox || !secondBox) {
    throw new Error(`${firstSelector} or ${secondSelector} is not measurable`);
  }

  expect(firstBox.y).toBeLessThan(secondBox.y + secondBox.height);
  expect(secondBox.y).toBeLessThan(firstBox.y + firstBox.height);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} language
 * @param {RegExp} labelPattern
 */
async function selectToolbarLanguage(page, language, labelPattern) {
  const languageMenu = page.locator("[data-language-menu]");
  const summary = languageMenu.locator("summary");

  await expect(languageMenu).toBeVisible();
  await summary.click();
  await expect(languageMenu).toHaveAttribute("open", "");
  await expect(page.getByRole("radio", { name: /Русский/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /English/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Espa.ol/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Fran.ais/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Deutsch/ })).toBeVisible();

  await page.getByRole("radio", { name: labelPattern }).evaluate((option) => {
    if (!(option instanceof HTMLInputElement)) {
      throw new Error("Language option input was not found");
    }

    option.checked = true;
    option.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(languageMenu).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  await expectToolbarLanguage(page, language);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {RegExp} labelPattern
 */
async function chooseRadioOption(page, labelPattern) {
  const option = page.getByRole("radio", { name: labelPattern });
  await expect(option).toBeVisible();
  await option.evaluate((node) => {
    if (!(node instanceof HTMLInputElement)) {
      throw new Error("Radio option input was not found");
    }

    node.checked = true;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} language
 */
async function changeToolbarLanguageWithoutActionWait(page, language) {
  await page.locator("[data-language-menu] summary").click();
  await page.locator(`[data-language-option][value="${language}"]`).evaluate((option) => {
    if (!(option instanceof HTMLInputElement)) {
      throw new Error("Language option input was not found");
    }

    option.checked = true;
    option.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {RegExp} labelPattern
 */
async function activateCurrentToolbarLanguage(page, labelPattern) {
  const languageMenu = page.locator("[data-language-menu]");
  const summary = languageMenu.locator("summary");
  const activeOption = page.getByRole("radio", { name: labelPattern });

  await expect(languageMenu).toBeVisible();
  await summary.click();
  await expect(languageMenu).toHaveAttribute("open", "");
  await expect(activeOption).toBeChecked();

  await activeOption.click();
  await expect(languageMenu).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} language
 */
async function useSavedLanguage(page, language) {
  await page.addInitScript(
    ({ storageKey, value }) => {
      localStorage.setItem(storageKey, value);
    },
    { storageKey: STORAGE_KEY, value: language }
  );
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function getPrintCallCount(page) {
  return page.evaluate(() => {
    const probeWindow = /** @type {Window & { __printCalls?: number }} */ (window);

    return probeWindow.__printCalls ?? 0;
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function enableOpenMeteoTerrainProvider(page) {
  await page.addInitScript(() => {
    const runtime =
      /** @type {Window & { __FRAME_YOUR_TRAIL_TERRAIN_ELEVATION_PROVIDER__?: string }} */ (window);
    runtime.__FRAME_YOUR_TRAIL_TERRAIN_ELEVATION_PROVIDER__ = "open-meteo";
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function uploadFixture(page) {
  await page.locator("[data-file-input]").setInputFiles(resolve("tests/fixtures/valid-track.gpx"));
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} fileName
 * @param {string} mimeType
 */
async function uploadFixtureFile(page, fileName, mimeType) {
  await page.locator("[data-file-input]").setInputFiles({
    name: fileName,
    mimeType,
    buffer: await readFile(resolve("tests/fixtures", fileName))
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} fileName
 * @param {string} mimeType
 * @param {string} contents
 */
async function uploadTextFile(page, fileName, mimeType, contents) {
  await page.locator("[data-file-input]").setInputFiles({
    name: fileName,
    mimeType,
    buffer: Buffer.from(contents, "utf8")
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} metricId
 * @param {string | RegExp} expected
 */
async function expectMetricValue(page, metricId, expected) {
  await expect(page.locator(`[data-metric='${metricId}'] .metric-table__value`)).toHaveText(
    expected
  );
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ fileName: string, mimeType: string, contents: string, size?: number }} file
 */
async function dropTextFileOnEmptyState(page, file) {
  await page.locator("[data-drop-zone]").evaluate((element, fileData) => {
    const dataTransfer = new DataTransfer();
    const droppedFile = new File([fileData.contents], fileData.fileName, {
      type: fileData.mimeType
    });

    if (typeof fileData.size === "number") {
      Object.defineProperty(droppedFile, "size", {
        configurable: true,
        get: () => fileData.size
      });
    }

    dataTransfer.items.add(droppedFile);
    const event = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer
    });

    element.dispatchEvent(event);
  }, file);
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function uploadSpeedGradientFixture(page) {
  const source = await readFile(resolve("tests/fixtures/valid-track.gpx"), "utf8");
  const gpx = source
    .replace("2024-05-25T08:05:00Z", "2024-05-25T08:10:00Z")
    .replace("2024-05-25T08:12:00Z", "2024-05-25T08:11:00Z")
    .replace("2024-05-25T08:20:00Z", "2024-05-25T08:21:00Z")
    .replace("2024-05-25T08:28:00Z", "2024-05-25T08:22:00Z");

  await page.locator("[data-file-input]").setInputFiles({
    name: "valid-track.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx, "utf8")
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function uploadTcxFixture(page) {
  const tcx = `<TrainingCenterDatabase>
    <Activities>
      <Activity Sport="Biking">
        <Id>2024-05-25T08:00:00Z</Id>
        <Lap StartTime="2024-05-25T08:00:00Z">
          <TotalTimeSeconds>600</TotalTimeSeconds>
          <DistanceMeters>2400</DistanceMeters>
          <MaximumSpeed>7.5</MaximumSpeed>
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

  await page.locator("[data-file-input]").setInputFiles({
    name: "workout.tcx",
    mimeType: "application/vnd.garmin.tcx+xml",
    buffer: Buffer.from(tcx, "utf8")
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function uploadFitFixture(page) {
  await page
    .locator("[data-file-input]")
    .setInputFiles(resolve("tests/fixtures/minimal-activity.fit"));
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function uploadCleanedRouteFixture(page) {
  const source = await readFile(resolve("tests/fixtures/valid-track.gpx"), "utf8");
  const duplicatePoint =
    '      <trkpt lat="43.100000" lon="42.100000"><ele>620</ele><time>2024-05-25T08:00:00Z</time></trkpt>';
  const gpx = source
    .replaceAll("Test Ridge Route", "Cleaned Route")
    .replace("2024-05-25T08:05:00Z", "2024-05-25T08:10:00Z")
    .replace("2024-05-25T08:12:00Z", "2024-05-25T08:11:00Z")
    .replace("2024-05-25T08:20:00Z", "2024-05-25T08:21:00Z")
    .replace("2024-05-25T08:28:00Z", "2024-05-25T08:22:00Z")
    .replace(duplicatePoint, `${duplicatePoint}\n${duplicatePoint}`);

  await page.locator("[data-file-input]").setInputFiles({
    name: "cleaned-route.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx, "utf8")
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function uploadSecondRouteFixture(page) {
  const source = await readFile(resolve("tests/fixtures/valid-track.gpx"), "utf8");
  const gpx = source.replaceAll("Test Ridge Route", "Second Route");

  await page.locator("[data-file-input]").setInputFiles({
    name: "second-route.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx, "utf8")
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} kind
 */
async function clickExport(page, kind) {
  await page.locator("[data-export-menu] summary").click();
  await page.locator(`[data-export='${kind}']`).click();
}

/**
 * @param {string} kind
 * @param {Buffer} bytes
 */
function expectExportPayload(kind, bytes) {
  expect(bytes.length, `${kind} export should contain image/PDF data`).toBeGreaterThan(1024);

  if (kind === "png") {
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  } else if (kind === "jpeg") {
    expect(Array.from(bytes.subarray(0, 3))).toEqual([255, 216, 255]);
  } else if (kind === "pdf") {
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
  }
}

/**
 * @param {Buffer} bytes
 */
function readPngDimensions(bytes) {
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function installClipboardProbe(page) {
  await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __clipboardWrites: { type: string; size: number }[] }} */ (
        /** @type {unknown} */ (window)
      );
    probeWindow.__clipboardWrites = [];
    const nativeClipboard = navigator.clipboard;
    const clipboardProbe = {
      write: async (items) => {
        const writes = [];

        for (const item of items) {
          for (const type of item.types) {
            const blob = await item.getType(type);
            const dimensions = type === "image/png" ? await readPngBlobDimensions(blob) : {};
            writes.push({ type, size: blob.size, ...dimensions });
          }
        }

        probeWindow.__clipboardWrites = writes;
      }
    };

    if (nativeClipboard) {
      Object.defineProperty(nativeClipboard, "write", {
        configurable: true,
        value: clipboardProbe.write
      });
    }

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboardProbe
    });

    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get: () => clipboardProbe
    });

    /**
     * @param {Blob} blob
     */
    async function readPngBlobDimensions(blob) {
      const buffer = await blob.arrayBuffer();
      const view = new DataView(buffer);

      return {
        width: view.getUint32(16),
        height: view.getUint32(20)
      };
    }
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function expectClipboardImageWrite(page) {
  const clipboardWrites = await page.evaluate(() => {
    const probeWindow =
      /** @type {Window & { __clipboardWrites?: { type: string; size: number }[] }} */ (window);

    return probeWindow.__clipboardWrites ?? [];
  });

  expect(clipboardWrites).toHaveLength(1);
  expect(clipboardWrites[0]).toMatchObject({ type: "image/png" });
  expect(clipboardWrites[0].size).toBeGreaterThan(1024);
  expect(clipboardWrites[0]).toMatchObject(EXPECTED_EXPORT_PNG_SIZE);
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function waitForClipboardWrite(page) {
  await page.waitForFunction(() => {
    const probeWindow =
      /** @type {Window & { __clipboardWrites?: { type: string; size: number }[] }} */ (window);

    return (probeWindow.__clipboardWrites?.length ?? 0) > 0;
  });
}
