import { expect, test } from "@playwright/test";
import { uploadBrokenGpx, uploadValidGpx } from "./helpers/fixtures.js";
import { abortBigDataCloudReverseGeocoding, abortOpenFreeMapTiles } from "./helpers/network.js";

test.beforeEach(async ({ page }) => {
  await abortBigDataCloudReverseGeocoding(page);
  await abortOpenFreeMapTiles(page);
});

test("matches screenshot for route-report", async ({ page }) => {
  await useSavedLanguage(page, "ru");
  await page.goto("/");
  await uploadValidGpx(page);
  await expectRouteReportReady(page);
  await expect(page.locator(".infographic")).toHaveScreenshot("route-report.png", {
    animations: "disabled"
  });
});

test("matches screenshot for mobile route-report", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useSavedLanguage(page, "ru");
  await page.goto("/");
  await uploadValidGpx(page);
  await expectRouteReportReady(page);
  await expect(page.locator(".infographic")).toHaveScreenshot("route-report-mobile.png", {
    animations: "disabled"
  });
});

test("matches screenshot for invalid upload error state", async ({ page }) => {
  await useSavedLanguage(page, "ru");
  await page.goto("/");
  await uploadBrokenGpx(page);
  await expect(page.locator(".message--error")).toBeVisible();
  await expect(page.locator(".messages")).toHaveAttribute("role", "alert");
  await expect(page.locator(".app-shell")).toHaveScreenshot("upload-error.png", {
    animations: "disabled"
  });
});

test("matches screenshot with export menu open", async ({ page }) => {
  await useSavedLanguage(page, "ru");
  await page.goto("/");
  await uploadValidGpx(page);
  await expectRouteReportReady(page);
  await page.locator("[data-export-menu] summary").click();
  await expect(page.locator("[data-export-menu]")).toHaveAttribute("open", "");
  await expect(page).toHaveScreenshot("export-menu-open.png", {
    animations: "disabled",
    clip: await getToolbarActionsMenuClip(page)
  });
});

test("matches screenshot with language menu open", async ({ page }) => {
  await useSavedLanguage(page, "ru");
  await page.goto("/");
  await expect(page.locator("[data-testid='empty-state']")).toBeVisible();
  await page.locator("[data-language-menu] summary").click();
  await expect(page.locator("[data-language-menu]")).toHaveAttribute("open", "");
  await expect(page.locator(".app-shell")).toHaveScreenshot("language-menu-open.png", {
    animations: "disabled"
  });
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} language
 */
async function useSavedLanguage(page, language) {
  await page.addInitScript(
    ({ value }) => {
      localStorage.setItem("frame-your-trail-language", value);
    },
    { value: language }
  );
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function expectRouteReportReady(page) {
  await expect(page.locator("[data-template-select]")).toHaveCount(0);
  await expect(page.locator("[data-theme-select]")).toHaveCount(0);
  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator("[data-static-route]")).toBeVisible();
  await expect(page.locator(".poster-header")).toBeVisible();
  await expect(page.locator(".poster-stats")).toBeVisible();
  await expect(page.locator(".elevation-landscape")).toBeVisible();
  await expect(page.locator("[data-chart-engine='echarts']")).toBeVisible();
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function getToolbarActionsMenuClip(page) {
  const toolbarActionsBox = await page.locator(".toolbar__actions").boundingBox();
  const exportPanelBox = await page.locator(".export-menu__panel").boundingBox();

  if (!toolbarActionsBox || !exportPanelBox) {
    throw new Error("Toolbar actions or export menu panel is not measurable");
  }

  const padding = 12;
  const x = Math.max(0, Math.min(toolbarActionsBox.x, exportPanelBox.x) - padding);
  const y = Math.max(0, Math.min(toolbarActionsBox.y, exportPanelBox.y) - padding);
  const right = Math.max(
    toolbarActionsBox.x + toolbarActionsBox.width,
    exportPanelBox.x + exportPanelBox.width
  );
  const bottom = Math.max(
    toolbarActionsBox.y + toolbarActionsBox.height,
    exportPanelBox.y + exportPanelBox.height
  );

  return {
    x,
    y,
    width: right - x + padding,
    height: bottom - y + padding
  };
}
