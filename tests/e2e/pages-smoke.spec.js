import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { uploadValidGpx } from "./helpers/fixtures.js";
import { abortBigDataCloudReverseGeocoding, abortOpenFreeMapTiles } from "./helpers/network.js";

test.beforeEach(async ({ page }) => {
  await abortBigDataCloudReverseGeocoding(page);
  await abortOpenFreeMapTiles(page);
});

test("serves the production app from the configured base path", async ({ page }) => {
  await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? "/");

  await expect(page.locator("h1")).toHaveText("Frame Your Trail");
  await uploadValidGpx(page);
  await expect(page.locator(".infographic")).toBeVisible();
  await expect(page.locator("[data-static-route]")).toBeVisible();

  await page.locator("[data-export-menu] summary").click();
  await expect(page.locator("[data-export-menu] [data-export='png']")).toBeVisible();
  await expect(page.locator("[data-export-menu] [data-export='jpeg']")).toBeVisible();
  await expect(page.locator("[data-export-menu] [data-export='pdf']")).toBeVisible();

  for (const [kind, extension] of [
    ["png", "png"],
    ["jpeg", "jpg"],
    ["pdf", "pdf"]
  ]) {
    await expectDownload(page, kind, extension);
  }
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} kind
 */
async function clickExport(page, kind) {
  const exportMenu = page.locator("[data-export-menu]");

  if ((await exportMenu.getAttribute("open")) === null) {
    await exportMenu.locator("summary").click();
  }

  await exportMenu.locator(`[data-export='${kind}']`).click();
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} kind
 * @param {string} extension
 */
async function expectDownload(page, kind, extension) {
  const downloadPromise = page.waitForEvent("download");
  await clickExport(page, kind);
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(`valid-track.${extension}`);
  expect(await download.failure()).toBeNull();

  const path = await download.path();
  expect(path).not.toBeNull();

  const bytes = await readFile(/** @type {string} */ (path));
  expectExportPayload(kind, bytes);
}

/**
 * @param {string} kind
 * @param {Buffer} bytes
 */
function expectExportPayload(kind, bytes) {
  expect(bytes.length).toBeGreaterThan(1024);

  if (kind === "png") {
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  } else if (kind === "jpeg") {
    expect(Array.from(bytes.subarray(0, 3))).toEqual([255, 216, 255]);
  } else if (kind === "pdf") {
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
  }
}
