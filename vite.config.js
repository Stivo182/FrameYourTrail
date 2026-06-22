import { defineConfig } from "vitest/config";
import {
  applySeoPlaceholders,
  getSiteBasePath,
  renderRobotsTxt,
  renderSitemapXml
} from "./scripts/seo-config.mjs";

function routeParserChunks(id) {
  const normalizedId = id.replaceAll("\\", "/");

  if (normalizedId.endsWith("/src/core/gpx-parser.js")) {
    return "gpx-parser";
  }

  if (normalizedId.endsWith("/src/core/activity-provenance.js")) {
    return "activity-provenance";
  }

  if (normalizedId.endsWith("/src/core/analysis-modes.js")) {
    return "track-analysis-modes";
  }

  if (normalizedId.endsWith("/src/core/analysis-mode-core.js")) {
    return "track-analysis-mode-core";
  }

  if (normalizedId.endsWith("/src/core/geo.js")) {
    return "geo";
  }

  if (normalizedId.endsWith("/src/core/haversine.js")) {
    return "haversine";
  }

  if (normalizedId.endsWith("/src/core/speed-calibration.js")) {
    return "speed-calibration";
  }

  if (normalizedId.endsWith("/src/core/track-source-primitives.js")) {
    return "track-source-primitives";
  }

  if (normalizedId.endsWith("/src/core/xml-parser-helpers.js")) {
    return "xml-parser-helpers";
  }

  if (normalizedId.endsWith("/src/core/timer-event-types.js")) {
    return "timer-event-types";
  }

  if (
    normalizedId.endsWith("/src/core/analysis-diagnostics.js") ||
    normalizedId.endsWith("/src/core/metric-modes.js") ||
    normalizedId.endsWith("/src/core/track-analyzer.js") ||
    normalizedId.endsWith("/src/core/track-cleaner.js") ||
    normalizedId.endsWith("/src/core/elevation-profile.js")
  ) {
    return "track-analysis-core";
  }
}

function seoDiscoveryPlugin() {
  return {
    name: "frame-your-trail-seo-discovery",
    transformIndexHtml(html) {
      return applySeoPlaceholders(html);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: renderRobotsTxt()
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: renderSitemapXml()
      });
    }
  };
}

export function resolveViteBasePath(command = "build", isPreview = false) {
  if (process.env.VITE_BASE_PATH) {
    return process.env.VITE_BASE_PATH;
  }

  return command === "serve" && !isPreview ? "/" : getSiteBasePath();
}

export default defineConfig(({ command, isPreview }) => ({
  base: resolveViteBasePath(command, isPreview),
  plugins: [seoDiscoveryPlugin()],
  build: {
    // MapLibre is lazy-loaded as a dedicated map engine chunk.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        minifyInternalExports: false,
        manualChunks: routeParserChunks
      }
    }
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        minifyInternalExports: false,
        manualChunks: routeParserChunks
      }
    }
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.js"]
  }
}));
