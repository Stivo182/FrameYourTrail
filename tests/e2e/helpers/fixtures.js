import { resolve } from "node:path";

export const VALID_TRACK_FIXTURE_PATH = resolve("tests/fixtures/valid-track.gpx");
export const BROKEN_GPX_FIXTURE_PATH = resolve("tests/fixtures/broken.gpx");

/**
 * @param {import("@playwright/test").Page} page
 */
export async function uploadValidGpx(page) {
  await page.locator("[data-file-input]").setInputFiles(VALID_TRACK_FIXTURE_PATH);
}

/**
 * @param {import("@playwright/test").Page} page
 */
export async function uploadBrokenGpx(page) {
  await page.locator("[data-file-input]").setInputFiles(BROKEN_GPX_FIXTURE_PATH);
}
