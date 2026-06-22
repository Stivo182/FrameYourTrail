import { spawnSync } from "node:child_process";
import { getSiteBasePath } from "./seo-config.mjs";

const baseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? new URL(getSiteBasePath(), "http://127.0.0.1:4173").href;

process.env.PLAYWRIGHT_BASE_URL = baseUrl;
process.env.PLAYWRIGHT_DEV_COMMAND ??= "npm run preview -- --host 127.0.0.1";

if (baseUrl && !process.env.VITE_BASE_PATH) {
  process.env.VITE_BASE_PATH = new URL(baseUrl).pathname;
}

const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", "tests/e2e/pages-smoke.spec.js"],
  {
    env: process.env,
    stdio: "inherit"
  }
);

process.exit(result.status ?? 1);
