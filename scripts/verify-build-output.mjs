import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  SEO_CONFIG,
  getSiteBasePath,
  getSocialPreviewUrl,
  renderRobotsTxt
} from "./seo-config.mjs";

const distDir = join(process.cwd(), "dist");
const assetsDir = join(process.cwd(), "dist", "assets");
const canonicalUrl = SEO_CONFIG.canonicalUrl;
const socialPreviewUrl = getSocialPreviewUrl();
const publicAssetBaseUrl = normalizePublicAssetBaseUrl(
  process.env.VITE_BASE_PATH || getSiteBasePath()
);
const assets = await readdir(assetsDir);
const workerAssets = assets.filter((asset) =>
  /^track-analysis-worker-(?!client-)[A-Za-z0-9_-]+\.js$/.test(asset)
);
const workerClientAssets = assets.filter((asset) =>
  /^track-analysis-worker-client-[A-Za-z0-9_-]+\.js$/.test(asset)
);
const pipelineAssets = assets.filter((asset) =>
  /^track-analysis-pipeline-[A-Za-z0-9_-]+\.js$/.test(asset)
);
const coreAssets = assets.filter((asset) => /^track-analysis-core-[A-Za-z0-9_-]+\.js$/.test(asset));
const trackSourcePrimitiveAssets = assets.filter((asset) =>
  /^track-source-primitives-[A-Za-z0-9_-]+\.js$/.test(asset)
);
const xmlParserHelperAssets = assets.filter((asset) =>
  /^xml-parser-helpers-[A-Za-z0-9_-]+\.js$/.test(asset)
);
const timerEventTypeAssets = assets.filter((asset) =>
  /^timer-event-types-[A-Za-z0-9_-]+\.js$/.test(asset)
);
const gpxParserAssets = assets.filter((asset) => /^gpx-parser-[A-Za-z0-9_-]+\.js$/.test(asset));
const fitParserAssets = assets.filter((asset) => /^fit-parser-[A-Za-z0-9_-]+\.js$/.test(asset));

await assertNoEmptyJavaScriptAssets(assets);
assertSingleAsset(workerAssets, "track analysis worker");
assertSingleAsset(workerClientAssets, "track analysis worker client");
assertSingleAsset(pipelineAssets, "track analysis fallback pipeline");
assertSingleAsset(coreAssets, "track analysis core");
assertSingleAsset(trackSourcePrimitiveAssets, "track source primitives");
assertSingleAsset(xmlParserHelperAssets, "XML parser helpers");
assertSingleAsset(timerEventTypeAssets, "timer event types");
assertSingleAsset(gpxParserAssets, "GPX parser");
assertSingleAsset(fitParserAssets, "FIT parser");

const workerAsset = workerAssets[0];
const workerClientAsset = workerClientAssets[0];
const pipelineAsset = pipelineAssets[0];
const coreAsset = coreAssets[0];
const trackSourcePrimitiveAsset = trackSourcePrimitiveAssets[0];
const xmlParserHelperAsset = xmlParserHelperAssets[0];
const timerEventTypeAsset = timerEventTypeAssets[0];
const gpxParserAsset = gpxParserAssets[0];
const fitParserAsset = fitParserAssets[0];
const workerSource = await readFile(join(assetsDir, workerAsset), "utf8");
const workerClientSource = await readFile(join(assetsDir, workerClientAsset), "utf8");
const pipelineSource = await readFile(join(assetsDir, pipelineAsset), "utf8");
const indexHtml = await readFile(join(distDir, "index.html"), "utf8");
const robots = await readFile(join(distDir, "robots.txt"), "utf8");
const sitemap = await readFile(join(distDir, "sitemap.xml"), "utf8");
await readFile(join(distDir, "site.webmanifest"), "utf8");
await readFile(join(distDir, "icon.svg"), "utf8");
const socialPreview = await readFile(join(distDir, SEO_CONFIG.socialPreviewFile));
const indexDocument = new JSDOM(indexHtml).window.document;
const sitemapDocument = new JSDOM(sitemap, { contentType: "text/xml" }).window.document;

assertContentHashedAsset(coreAsset, "track analysis core");

if (workerClientSource.includes("data:text/javascript")) {
  fail(`${workerClientAsset} inlines the module Worker as a data URL`);
}

if (!workerClientSource.includes(workerAsset)) {
  fail(`${workerClientAsset} does not reference ${workerAsset}`);
}

if (hasStaticAssetImport(workerClientSource, pipelineAsset)) {
  fail(`${workerClientAsset} statically imports ${pipelineAsset}`);
}

if (hasStaticAssetImport(workerClientSource, gpxParserAsset)) {
  fail(`${workerClientAsset} statically imports ${gpxParserAsset}`);
}

if (hasStaticAssetImport(workerClientSource, coreAsset)) {
  fail(`${workerClientAsset} statically imports ${coreAsset}`);
}

if (!workerSource.includes(coreAsset)) {
  fail(`${workerAsset} does not reference ${coreAsset}`);
}

if (!pipelineSource.includes(coreAsset)) {
  fail(`${pipelineAsset} does not reference ${coreAsset}`);
}

if (!workerSource.includes(fitParserAsset)) {
  fail(`${workerAsset} does not reference ${fitParserAsset}`);
}

if (!pipelineSource.includes(fitParserAsset)) {
  fail(`${pipelineAsset} does not reference ${fitParserAsset}`);
}

assertEquals(
  link(indexDocument, "canonical"),
  canonicalUrl,
  "dist/index.html canonical link does not match the canonical public URL"
);
assertEquals(
  link(indexDocument, "manifest"),
  `${publicAssetBaseUrl}site.webmanifest`,
  `dist/index.html manifest link does not point to ${publicAssetBaseUrl}site.webmanifest`
);
assertEquals(
  indexDocument.querySelector('link[rel="icon"]')?.getAttribute("href") ?? "",
  `${publicAssetBaseUrl}icon.svg`,
  `dist/index.html icon link does not point to ${publicAssetBaseUrl}icon.svg`
);
assertLocalBuildAssetUrlsUseAssetBasePath(indexDocument, `${publicAssetBaseUrl}assets/`);
assertEquals(
  meta(indexDocument, "property", "og:url"),
  canonicalUrl,
  "dist/index.html og:url does not match the canonical public URL"
);
assertEquals(
  meta(indexDocument, "property", "og:image"),
  socialPreviewUrl,
  "dist/index.html og:image does not match the social preview URL"
);
assertEquals(
  meta(indexDocument, "name", "twitter:image"),
  socialPreviewUrl,
  "dist/index.html twitter:image does not match the social preview URL"
);
assertEquals(
  getStructuredDataUrl(indexDocument),
  canonicalUrl,
  "dist/index.html JSON-LD url does not match the canonical public URL"
);

assertEquals(robots, renderRobotsTxt(), "dist/robots.txt does not match generated SEO config");

assertEquals(
  sitemapDocument.querySelector("loc")?.textContent ?? "",
  canonicalUrl,
  "dist/sitemap.xml loc does not match the canonical public URL"
);
assertEquals(
  sitemapDocument.querySelector("lastmod")?.textContent ?? "",
  SEO_CONFIG.sitemapLastmod,
  "dist/sitemap.xml lastmod does not match the configured sitemap date"
);

if (!socialPreview.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
  fail("dist/social-preview.jpg is not a JPEG file");
}

console.log(`Verified production track analysis worker asset: ${workerAsset}`);
console.log(`Verified production track analysis fallback pipeline asset: ${pipelineAsset}`);
console.log(`Verified shared production track analysis core asset: ${coreAsset}`);
console.log(
  `Verified shared production track source primitives asset: ${trackSourcePrimitiveAsset}`
);
console.log(`Verified shared production XML parser helpers asset: ${xmlParserHelperAsset}`);
console.log(`Verified shared production timer event types asset: ${timerEventTypeAsset}`);
console.log(`Verified single production FIT parser asset: ${fitParserAsset}`);
console.log("Verified production SEO discovery assets and canonical URLs");

/**
 * @param {string[]} assets
 * @param {string} label
 */
function assertSingleAsset(assets, label) {
  if (assets.length !== 1) {
    fail(`Expected exactly one ${label} asset, found ${assets.length}: ${assets.join(", ")}`);
  }
}

/**
 * @param {string} asset
 * @param {string} label
 */
function assertContentHashedAsset(asset, label) {
  if (!/-[A-Za-z0-9_-]{8,}\.js$/.test(asset)) {
    fail(`${label} asset is not content-hashed: ${asset}`);
  }
}

/**
 * @param {string[]} assets
 */
async function assertNoEmptyJavaScriptAssets(assets) {
  const jsAssets = assets.filter((asset) => asset.endsWith(".js"));

  await Promise.all(
    jsAssets.map(async (asset) => {
      const source = await readFile(join(assetsDir, asset), "utf8");

      if (source.trim() === "") {
        fail(`Generated empty JavaScript asset: ${asset}`);
      }
    })
  );
}

/**
 * @param {string} basePath
 */
function normalizePublicAssetBaseUrl(basePath) {
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

/**
 * @param {Document} document
 * @param {string} assetBasePath
 */
function assertLocalBuildAssetUrlsUseAssetBasePath(document, assetBasePath) {
  const assetUrls = [
    ...urlsFromElements(document, "script[src]", "src"),
    ...urlsFromRelLinks(document, "modulepreload"),
    ...urlsFromRelLinks(document, "stylesheet")
  ];

  for (const url of assetUrls) {
    if (isExternalUrl(url) || url.startsWith("data:")) {
      continue;
    }

    if (!url.startsWith(assetBasePath)) {
      fail(`dist/index.html asset URL does not point to ${assetBasePath}: ${url}`);
    }
  }
}

/**
 * @param {Document} document
 * @param {string} rel
 */
function urlsFromRelLinks(document, rel) {
  return [...document.querySelectorAll("link[href]")]
    .filter((element) => hasRel(element, rel))
    .map((element) => element.getAttribute("href") ?? "")
    .filter(Boolean);
}

/**
 * @param {Document} document
 * @param {string} selector
 * @param {string} attribute
 */
function urlsFromElements(document, selector, attribute) {
  return [...document.querySelectorAll(selector)]
    .map((element) => element.getAttribute(attribute) ?? "")
    .filter(Boolean);
}

/**
 * @param {Element} element
 * @param {string} rel
 */
function hasRel(element, rel) {
  return (element.getAttribute("rel") ?? "")
    .split(/\s+/)
    .some((token) => token.toLowerCase() === rel);
}

/**
 * @param {string} url
 */
function isExternalUrl(url) {
  return url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * @param {Document} document
 * @param {string} rel
 */
function link(document, rel) {
  return document.querySelector(`link[rel="${rel}"]`)?.getAttribute("href") ?? "";
}

/**
 * @param {Document} document
 * @param {string} attribute
 * @param {string} value
 */
function meta(document, attribute, value) {
  return document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute("content") ?? "";
}

/**
 * @param {Document} document
 */
function getStructuredDataUrl(document) {
  const text = document.querySelector('script[type="application/ld+json"]')?.textContent ?? "{}";

  try {
    const structuredData = JSON.parse(text);
    return typeof structuredData.url === "string" ? structuredData.url : "";
  } catch {
    fail("dist/index.html JSON-LD is not valid JSON");
  }
}

/**
 * @param {string} source
 * @param {string} asset
 */
function hasStaticAssetImport(source, asset) {
  return source.includes(`from"./${asset}"`) || source.includes(`import"./${asset}"`);
}

/**
 * @param {string} actual
 * @param {string} expected
 * @param {string} message
 */
function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    fail(`${message}: expected ${expected}, found ${actual || "<missing>"}`);
  }
}

/**
 * @param {string} message
 */
function fail(message) {
  throw new Error(message);
}
