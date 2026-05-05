export const BIGDATACLOUD_REVERSE_GEOCODE_PATTERN =
  "https://api.bigdatacloud.net/data/reverse-geocode-client**";
export const OPENFREEMAP_TILE_PATTERN = "https://tiles.openfreemap.org/**";

/**
 * @param {import("@playwright/test").Page} page
 */
export async function abortBigDataCloudReverseGeocoding(page) {
  await page.route(BIGDATACLOUD_REVERSE_GEOCODE_PATTERN, (route) => route.abort());
}

/**
 * @param {import("@playwright/test").Page} page
 */
export async function abortOpenFreeMapTiles(page) {
  await page.route(OPENFREEMAP_TILE_PATTERN, (route) => route.abort());
}
