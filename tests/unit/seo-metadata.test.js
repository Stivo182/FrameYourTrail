// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  SEO_CONFIG,
  createSeoConfig,
  getSocialPreviewUrl,
  renderRobotsTxt,
  renderSitemapXml
} from "../../scripts/seo-config.mjs";

const DESCRIPTION =
  "Turn GPX, TCX, FIT, or XML route files into printable trail posters directly in your browser with local parsing, route metrics, maps, and export.";
const TITLE = "Frame Your Trail | Printable GPX, TCX and FIT Trail Posters";
const CANONICAL_PLACEHOLDER = "%FRAME_YOUR_TRAIL_CANONICAL_URL%";
const SOCIAL_PREVIEW_PLACEHOLDER = "%FRAME_YOUR_TRAIL_SOCIAL_PREVIEW_URL%";

const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
const document = new JSDOM(html).window.document;

describe("SEO metadata", () => {
  it("describes the app with crawlable head metadata", () => {
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe(TITLE);
    expect(meta("name", "description")).toBe(DESCRIPTION);
    expect(meta("name", "robots")).toBe("index, follow");
    expect(meta("name", "application-name")).toBe("Frame Your Trail");
    expect(meta("name", "theme-color")).toBe("#0f766e");
    expect(link("canonical")).toBe(CANONICAL_PLACEHOLDER);
    expect(link("manifest")).toBe("%BASE_URL%site.webmanifest");
    expect(document.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe(
      "%BASE_URL%icon.svg"
    );
  });

  it("provides social cards and structured data with the canonical URL", () => {
    expect(meta("property", "og:type")).toBe("website");
    expect(meta("property", "og:site_name")).toBe("Frame Your Trail");
    expect(meta("property", "og:title")).toBe(TITLE);
    expect(meta("property", "og:description")).toBe(DESCRIPTION);
    expect(meta("property", "og:url")).toBe(CANONICAL_PLACEHOLDER);
    expect(meta("property", "og:image")).toBe(SOCIAL_PREVIEW_PLACEHOLDER);
    expect(meta("property", "og:image:width")).toBe("1200");
    expect(meta("property", "og:image:height")).toBe("630");
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("name", "twitter:title")).toBe(TITLE);
    expect(meta("name", "twitter:description")).toBe(DESCRIPTION);
    expect(meta("name", "twitter:image")).toBe(SOCIAL_PREVIEW_PLACEHOLDER);

    const structuredData = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? "{}"
    );

    expect(structuredData).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Frame Your Trail",
      url: CANONICAL_PLACEHOLDER,
      description: DESCRIPTION,
      applicationCategory: "DesignApplication",
      operatingSystem: "Any modern browser"
    });
    expect(structuredData.inLanguage).toEqual(["ru", "en", "es", "fr", "de"]);
    expect(structuredData.featureList).toContain("Local GPX, TCX, FIT, and XML route parsing");
    expect(structuredData.offers).toMatchObject({
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD"
    });
  });

  it("includes a noscript summary for crawlers and non-JavaScript visitors", () => {
    const text = document.querySelector("noscript")?.textContent ?? "";

    expect(text).toContain("Frame Your Trail turns GPX, TCX, FIT, and XML route files");
    expect(text).toContain("processed locally in your browser");
    expect(text).toContain("PNG, JPEG, PDF, or clipboard image");
  });
});

describe("SEO discovery assets", () => {
  it("loads canonical URL from config and allows CLI environment overrides", () => {
    const configSource = readFileSync(join(process.cwd(), "scripts/seo-config.mjs"), "utf8");
    const fileConfig = JSON.parse(readFileSync(join(process.cwd(), "site.config.json"), "utf8"));
    const productSpec = readFileSync(join(process.cwd(), "docs/product-spec.md"), "utf8");
    const productSpecDate = productSpec.match(/^Date:\s*(\d{4}-\d{2}-\d{2})$/m)?.[1];
    const defaultConfig = createSeoConfig({ env: {}, configPath: "site.config.json" });
    const cliConfig = createSeoConfig({
      env: {
        FRAME_YOUR_TRAIL_CANONICAL_URL: "https://example.test/custom/",
        FRAME_YOUR_TRAIL_SITEMAP_LASTMOD: "2026-06-01"
      }
    });

    expect(configSource).not.toContain(fileConfig.canonicalUrl);
    expect(defaultConfig.canonicalUrl).toBe(fileConfig.canonicalUrl);
    expect(defaultConfig.sitemapLastmod).toBe(productSpecDate);
    expect(cliConfig.canonicalUrl).toBe("https://example.test/custom/");
    expect(cliConfig.sitemapLastmod).toBe("2026-06-01");
  });

  it("generates robots.txt and sitemap.xml from shared SEO config", () => {
    expect(existsSync(join(process.cwd(), "public/robots.txt"))).toBe(false);
    expect(existsSync(join(process.cwd(), "public/sitemap.xml"))).toBe(false);

    const robots = renderRobotsTxt();
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain(`Sitemap: ${SEO_CONFIG.canonicalUrl}sitemap.xml`);

    const sitemap = renderSitemapXml();
    const sitemapDocument = new JSDOM(sitemap, { contentType: "text/xml" }).window.document;

    expect(sitemapDocument.querySelector("loc")?.textContent).toBe(SEO_CONFIG.canonicalUrl);
    expect(sitemapDocument.querySelector("lastmod")?.textContent).toBe(SEO_CONFIG.sitemapLastmod);
  });

  it("ships a lightweight app manifest and crawlable preview assets", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public/site.webmanifest"), "utf8")
    );
    const socialPreviewPath = join(process.cwd(), "public/social-preview.jpg");
    const socialPreview = readFileSync(socialPreviewPath);

    expect(manifest).toMatchObject({
      name: "Frame Your Trail",
      short_name: "Frame Your Trail",
      start_url: ".",
      scope: ".",
      display: "standalone",
      background_color: "#f7faf7",
      theme_color: "#0f766e"
    });
    expect(manifest.icons).toEqual([
      {
        src: "icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ]);
    expect(existsSync(join(process.cwd(), "public/icon.svg"))).toBe(true);
    expect(socialPreview.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(socialPreview.byteLength).toBeGreaterThan(20_000);
  });

  it("keeps the canonical deployment URL centralized outside HTML and generated assets", () => {
    expect(html).not.toContain(SEO_CONFIG.canonicalUrl);
    expect(getSocialPreviewUrl()).toBe(`${SEO_CONFIG.canonicalUrl}social-preview.jpg`);
  });
});

function meta(attribute, value) {
  return document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute("content") ?? "";
}

function link(rel) {
  return document.querySelector(`link[rel="${rel}"]`)?.getAttribute("href") ?? "";
}
