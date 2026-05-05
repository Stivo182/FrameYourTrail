// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { SEO_CONFIG, getSocialPreviewUrl, renderRobotsTxt } from "../../scripts/seo-config.mjs";

const execFileAsync = promisify(execFile);
const CUSTOM_CANONICAL_URL = "https://example.test/FrameYourTrail/";
const CUSTOM_SOCIAL_IMAGE_URL = `${CUSTOM_CANONICAL_URL}social-preview.jpg`;
const GITHUB_PAGES_BASE_PATH = "/FrameYourTrail/";
const SCRIPT_PATH = resolve("scripts/verify-build-output.mjs");

describe("production build output verifier", () => {
  it("rejects SEO metadata fields that are broken even when the canonical URL appears elsewhere", async () => {
    const fixtureDir = await createDistFixture({
      indexHtml: `<!doctype html>
        <html lang="en">
          <head>
            <link rel="canonical" href="https://example.invalid/" />
            <link rel="manifest" href="/wrong.webmanifest" />
            <link rel="icon" href="/wrong.svg" />
            <meta property="og:url" content="https://example.invalid/" />
            <meta property="og:image" content="https://example.invalid/social-preview.jpg" />
            <meta name="twitter:image" content="https://example.invalid/social-preview.jpg" />
            <script type="application/ld+json">
              { "@context": "https://schema.org", "@type": "WebApplication", "url": "https://example.invalid/" }
            </script>
          </head>
          <body>
            The real canonical URL is mentioned in body copy only: ${SEO_CONFIG.canonicalUrl}
          </body>
        </html>`,
      sitemap: `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.invalid/</loc></url>
          <!-- ${SEO_CONFIG.canonicalUrl} -->
        </urlset>`
    });

    await expect(runVerifier(fixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("canonical")
    });
  });

  it("accepts exact SEO metadata and discovery assets", async () => {
    const fixtureDir = await createDistFixture({
      indexHtml: `<!doctype html>
        <html lang="en">
          <head>
            <link rel="canonical" href="${SEO_CONFIG.canonicalUrl}" />
            <link rel="manifest" href="/site.webmanifest" />
            <link rel="icon" href="/icon.svg" />
            <meta property="og:url" content="${SEO_CONFIG.canonicalUrl}" />
            <meta property="og:image" content="${getSocialPreviewUrl()}" />
            <meta name="twitter:image" content="${getSocialPreviewUrl()}" />
            <script type="application/ld+json">
              { "@context": "https://schema.org", "@type": "WebApplication", "url": "${SEO_CONFIG.canonicalUrl}" }
            </script>
          </head>
          <body></body>
        </html>`,
      sitemap: `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>${SEO_CONFIG.canonicalUrl}</loc>
            <lastmod>${SEO_CONFIG.sitemapLastmod}</lastmod>
          </url>
        </urlset>`
    });

    const result = await runVerifier(fixtureDir);

    expect(result.stdout).toContain("Verified shared production XML parser helpers asset");
    expect(result.stdout).toContain("Verified shared production timer event types asset");
    expect(result.stdout).toContain("Verified production SEO discovery assets and canonical URLs");
  });

  it("derives built public asset links from VITE_BASE_PATH", async () => {
    const fixtureDir = await createDistFixture({
      indexHtml: `<!doctype html>
        <html lang="en">
          <head>
            <link rel="canonical" href="${SEO_CONFIG.canonicalUrl}" />
            <link rel="manifest" href="${GITHUB_PAGES_BASE_PATH}site.webmanifest" />
            <link rel="icon" href="${GITHUB_PAGES_BASE_PATH}icon.svg" />
            <meta property="og:url" content="${SEO_CONFIG.canonicalUrl}" />
            <meta property="og:image" content="${getSocialPreviewUrl()}" />
            <meta name="twitter:image" content="${getSocialPreviewUrl()}" />
            <script type="application/ld+json">
              { "@context": "https://schema.org", "@type": "WebApplication", "url": "${SEO_CONFIG.canonicalUrl}" }
            </script>
          </head>
          <body></body>
        </html>`,
      sitemap: `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>${SEO_CONFIG.canonicalUrl}</loc>
            <lastmod>${SEO_CONFIG.sitemapLastmod}</lastmod>
          </url>
        </urlset>`
    });

    await expect(
      runVerifier(fixtureDir, { VITE_BASE_PATH: GITHUB_PAGES_BASE_PATH })
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("Verified production SEO discovery assets and canonical URLs")
    });
  });

  it("uses FRAME_YOUR_TRAIL_CANONICAL_URL when verifying production SEO metadata", async () => {
    const fixtureDir = await createDistFixture({
      canonicalUrl: CUSTOM_CANONICAL_URL,
      socialImageUrl: CUSTOM_SOCIAL_IMAGE_URL
    });

    await expect(
      runVerifier(fixtureDir, { FRAME_YOUR_TRAIL_CANONICAL_URL: CUSTOM_CANONICAL_URL })
    ).resolves.toMatchObject({
      stdout: expect.stringContaining("Verified production SEO discovery assets and canonical URLs")
    });
  });

  it("rejects a sitemap with a missing lastmod", async () => {
    const fixtureDir = await createDistFixture({
      sitemap: `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>${SEO_CONFIG.canonicalUrl}</loc></url>
        </urlset>`
    });

    await expect(runVerifier(fixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("dist/sitemap.xml lastmod does not match")
    });
  });

  it("rejects a sitemap with a stale lastmod", async () => {
    const staleLastmod = SEO_CONFIG.sitemapLastmod === "2026-01-01" ? "2026-01-02" : "2026-01-01";
    const fixtureDir = await createDistFixture({
      sitemap: `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>${SEO_CONFIG.canonicalUrl}</loc>
            <lastmod>${staleLastmod}</lastmod>
          </url>
        </urlset>`
    });

    await expect(runVerifier(fixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("dist/sitemap.xml lastmod does not match")
    });
  });

  it("checks the configured social preview asset instead of a hard-coded filename", async () => {
    const socialPreviewFile = "custom-social-preview.jpg";
    const fixtureDir = await createDistFixture({
      socialPreviewFile,
      socialImageUrl: `${SEO_CONFIG.canonicalUrl}${socialPreviewFile}`
    });

    await expect(runVerifier(fixtureDir)).resolves.toMatchObject({
      stdout: expect.stringContaining("Verified production SEO discovery assets and canonical URLs")
    });
  });

  it("rejects empty JavaScript chunks", async () => {
    const fixtureDir = await createDistFixture({
      extraAssets: {
        "track-analysis-modes-empty.js": " "
      }
    });

    await expect(runVerifier(fixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("empty JavaScript asset")
    });
  });

  it("rejects missing or duplicate track source primitives chunks", async () => {
    const missingFixtureDir = await createDistFixture({
      includeTrackSourcePrimitiveAsset: false
    });
    const duplicateFixtureDir = await createDistFixture({
      extraAssets: {
        "track-source-primitives-ijklmnop.js": "export {};"
      }
    });

    await expect(runVerifier(missingFixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Expected exactly one track source primitives asset")
    });
    await expect(runVerifier(duplicateFixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Expected exactly one track source primitives asset")
    });
  });

  it("rejects missing or duplicate XML parser helpers chunks", async () => {
    const missingFixtureDir = await createDistFixture({
      includeXmlParserHelperAsset: false
    });
    const duplicateFixtureDir = await createDistFixture({
      extraAssets: {
        "xml-parser-helpers-qrstuvwx.js": "export {};"
      }
    });

    await expect(runVerifier(missingFixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Expected exactly one XML parser helpers asset")
    });
    await expect(runVerifier(duplicateFixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Expected exactly one XML parser helpers asset")
    });
  });

  it("rejects missing or duplicate timer event types chunks", async () => {
    const missingFixtureDir = await createDistFixture({
      includeTimerEventTypeAsset: false
    });
    const duplicateFixtureDir = await createDistFixture({
      extraAssets: {
        "timer-event-types-yzabcdef.js": "export {};"
      }
    });

    await expect(runVerifier(missingFixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Expected exactly one timer event types asset")
    });
    await expect(runVerifier(duplicateFixtureDir)).rejects.toMatchObject({
      stderr: expect.stringContaining("Expected exactly one timer event types asset")
    });
  });
});

/**
 * @param {{
 *   indexHtml?: string,
 *   sitemap?: string,
 *   canonicalUrl?: string,
 *   socialImageUrl?: string,
 *   socialPreviewFile?: string,
 *   includeTrackSourcePrimitiveAsset?: boolean,
 *   includeXmlParserHelperAsset?: boolean,
 *   includeTimerEventTypeAsset?: boolean,
 *   extraAssets?: Record<string, string | Buffer>
 * }} options
 */
async function createDistFixture({
  indexHtml,
  sitemap,
  canonicalUrl = SEO_CONFIG.canonicalUrl,
  socialImageUrl = getSocialPreviewUrl(),
  socialPreviewFile = SEO_CONFIG.socialPreviewFile,
  includeTrackSourcePrimitiveAsset = true,
  includeXmlParserHelperAsset = true,
  includeTimerEventTypeAsset = true,
  extraAssets = {}
}) {
  const fixtureDir = await mkdtemp(join(tmpdir(), "frame-your-trail-build-verifier-"));
  const distDir = join(fixtureDir, "dist");
  const assetsDir = join(distDir, "assets");
  const workerAsset = "track-analysis-worker-abc.js";
  const workerClientAsset = "track-analysis-worker-client-def.js";
  const pipelineAsset = "track-analysis-pipeline-ghi.js";
  const coreAsset = "track-analysis-core-abcdefgh.js";
  const trackSourcePrimitiveAsset = "track-source-primitives-abcdefgh.js";
  const xmlParserHelperAsset = "xml-parser-helpers-abcdefgh.js";
  const timerEventTypeAsset = "timer-event-types-abcdefgh.js";
  const gpxParserAsset = "gpx-parser-mno.js";
  const fitParserAsset = "fit-parser-jkl.js";
  const html =
    indexHtml ??
    `<!doctype html>
      <html lang="en">
        <head>
          <link rel="canonical" href="${canonicalUrl}" />
          <link rel="manifest" href="/site.webmanifest" />
          <link rel="icon" href="/icon.svg" />
          <meta property="og:url" content="${canonicalUrl}" />
          <meta property="og:image" content="${socialImageUrl}" />
          <meta name="twitter:image" content="${socialImageUrl}" />
          <script type="application/ld+json">
            { "@context": "https://schema.org", "@type": "WebApplication", "url": "${canonicalUrl}" }
          </script>
        </head>
        <body></body>
      </html>`;
  const sitemapXml =
    sitemap ??
    `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>${canonicalUrl}</loc>
          <lastmod>${SEO_CONFIG.sitemapLastmod}</lastmod>
        </url>
      </urlset>`;

  await mkdir(assetsDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(fixtureDir, "site.config.json"),
      `${JSON.stringify({
        canonicalUrl: SEO_CONFIG.canonicalUrl,
        sitemapLastmod: SEO_CONFIG.sitemapLastmod,
        socialPreviewFile
      })}\n`
    ),
    writeFile(join(distDir, "index.html"), html),
    writeFile(join(distDir, "robots.txt"), renderRobotsTxt({ canonicalUrl })),
    writeFile(join(distDir, "sitemap.xml"), sitemapXml),
    writeFile(join(distDir, "site.webmanifest"), "{}"),
    writeFile(join(distDir, "icon.svg"), "<svg></svg>"),
    writeFile(join(distDir, socialPreviewFile), Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    writeFile(
      join(assetsDir, workerAsset),
      `import "./${coreAsset}"; import "./${fitParserAsset}";`
    ),
    writeFile(join(assetsDir, workerClientAsset), `new Worker("${workerAsset}")`),
    writeFile(
      join(assetsDir, pipelineAsset),
      `import "./${coreAsset}"; import "./${fitParserAsset}";`
    ),
    writeFile(join(assetsDir, coreAsset), "export {};"),
    ...(includeTrackSourcePrimitiveAsset
      ? [writeFile(join(assetsDir, trackSourcePrimitiveAsset), "export {};")]
      : []),
    ...(includeXmlParserHelperAsset
      ? [writeFile(join(assetsDir, xmlParserHelperAsset), "export {};")]
      : []),
    ...(includeTimerEventTypeAsset
      ? [writeFile(join(assetsDir, timerEventTypeAsset), "export {};")]
      : []),
    writeFile(join(assetsDir, gpxParserAsset), "export {};"),
    writeFile(join(assetsDir, fitParserAsset), "export {};"),
    ...Object.entries(extraAssets).map(([assetName, source]) =>
      writeFile(join(assetsDir, assetName), source)
    )
  ]);

  return fixtureDir;
}

async function runVerifier(cwd, env = {}) {
  try {
    return await execFileAsync(process.execPath, [SCRIPT_PATH], {
      cwd,
      env: { ...process.env, ...env }
    });
  } catch (error) {
    if (isExecError(error)) {
      error.stderr = `${error.stderr}\n${error.stdout}`;
    }
    throw error;
  }
}

function isExecError(error) {
  return error instanceof Error && "stderr" in error && "stdout" in error;
}
