import { spawnSync } from "node:child_process";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL;

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
