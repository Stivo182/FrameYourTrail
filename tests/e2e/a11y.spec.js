import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { uploadBrokenGpx, uploadValidGpx } from "./helpers/fixtures.js";
import { abortBigDataCloudReverseGeocoding, abortOpenFreeMapTiles } from "./helpers/network.js";

test.beforeEach(async ({ page }) => {
  await abortBigDataCloudReverseGeocoding(page);
});

test("has no detectable accessibility violations in the empty state", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-testid='empty-state']")).toBeVisible();

  await expectNoA11yViolations(page);
});

test("has no detectable accessibility violations after GPX upload", async ({ page }) => {
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadValidGpx(page);
  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator("[data-static-route]")).toBeVisible();

  await expectNoA11yViolations(page);
});

test("has no detectable accessibility violations in the invalid upload error state", async ({
  page
}) => {
  await page.goto("/");
  await uploadBrokenGpx(page);
  await expect(page.locator(".message--error")).toBeVisible();
  await expect(page.locator(".messages")).toHaveAttribute("role", "alert");

  await expectNoA11yViolations(page);
});

test("has no detectable accessibility violations with the export menu open", async ({ page }) => {
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadValidGpx(page);
  await expect(page.locator(".infographic")).toBeVisible();
  await page.locator("[data-export-menu] summary").click();
  await expect(page.locator("[data-export-menu]")).toHaveAttribute("open", "");

  await expectNoA11yViolations(page);
});

test("has no detectable accessibility violations with the language menu open", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-language-menu] summary").click();
  await expect(page.locator("[data-language-menu]")).toHaveAttribute("open", "");

  await expectNoA11yViolations(page);
});

test("has no detectable accessibility violations in the mobile loaded state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abortOpenFreeMapTiles(page);
  await page.goto("/");
  await uploadValidGpx(page);
  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator("[data-static-route]")).toBeVisible();

  await expectNoA11yViolations(page);
});

/**
 * @param {import("@playwright/test").Page} page
 */
async function expectNoA11yViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}
