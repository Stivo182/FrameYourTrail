import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_CONFIG = Object.freeze({
  sitemapLastmod: "2026-05-14",
  socialPreviewFile: "social-preview.jpg"
});

const SEO_PLACEHOLDERS = Object.freeze({
  canonicalUrl: "%FRAME_YOUR_TRAIL_CANONICAL_URL%",
  socialPreviewUrl: "%FRAME_YOUR_TRAIL_SOCIAL_PREVIEW_URL%"
});

export const SEO_CONFIG = createSeoConfig();

/**
 * @param {{ env?: Record<string, string | undefined>, configPath?: string }} [options]
 */
export function createSeoConfig(options = {}) {
  const env = options.env ?? process.env;
  const fileConfig = readSeoConfigFile(
    options.configPath ?? env.FRAME_YOUR_TRAIL_SITE_CONFIG ?? "site.config.json"
  );
  const canonicalUrl = normalizeCanonicalUrl(
    env.FRAME_YOUR_TRAIL_CANONICAL_URL ?? fileConfig.canonicalUrl
  );

  if (!canonicalUrl) {
    throw new Error(
      "SEO canonical URL must be set in site.config.json or FRAME_YOUR_TRAIL_CANONICAL_URL"
    );
  }

  return Object.freeze({
    canonicalUrl,
    sitemapLastmod:
      env.FRAME_YOUR_TRAIL_SITEMAP_LASTMOD ??
      fileConfig.sitemapLastmod ??
      DEFAULT_CONFIG.sitemapLastmod,
    socialPreviewFile:
      env.FRAME_YOUR_TRAIL_SOCIAL_PREVIEW_FILE ??
      fileConfig.socialPreviewFile ??
      DEFAULT_CONFIG.socialPreviewFile
  });
}

/**
 * @param {{ socialPreviewFile: string, canonicalUrl: string }} [config]
 */
export function getSocialPreviewUrl(config = SEO_CONFIG) {
  return new URL(config.socialPreviewFile, config.canonicalUrl).href;
}

/**
 * @param {{ canonicalUrl: string }} [config]
 */
export function getSiteBasePath(config = SEO_CONFIG) {
  return normalizeBasePath(new URL(config.canonicalUrl).pathname);
}

/**
 * @param {string} html
 * @param {{ socialPreviewFile: string, canonicalUrl: string }} [config]
 */
export function applySeoPlaceholders(html, config = SEO_CONFIG) {
  return html
    .replaceAll(SEO_PLACEHOLDERS.canonicalUrl, config.canonicalUrl)
    .replaceAll(SEO_PLACEHOLDERS.socialPreviewUrl, getSocialPreviewUrl(config));
}

/**
 * @param {{ canonicalUrl: string }} [config]
 */
export function renderRobotsTxt(config = SEO_CONFIG) {
  return `User-agent: *
Allow: /

Sitemap: ${new URL("sitemap.xml", config.canonicalUrl).href}
`;
}

/**
 * @param {{ canonicalUrl: string, sitemapLastmod?: string }} [config]
 */
export function renderSitemapXml(config = SEO_CONFIG) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${config.canonicalUrl}</loc>
    <lastmod>${config.sitemapLastmod ?? DEFAULT_CONFIG.sitemapLastmod}</lastmod>
  </url>
</urlset>
`;
}

/**
 * @param {string} configPath
 * @returns {Partial<typeof DEFAULT_CONFIG> & { canonicalUrl?: string }}
 */
function readSeoConfigFile(configPath) {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), configPath), "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

/**
 * @param {string | undefined} value
 */
function normalizeCanonicalUrl(value) {
  if (!value) {
    return "";
  }

  const url = new URL(value);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url.href;
}

/**
 * @param {string} value
 */
function normalizeBasePath(value) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

/**
 * @param {unknown} error
 * @returns {error is NodeJS.ErrnoException}
 */
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
