// @vitest-environment node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getSiteBasePath } from "../../scripts/seo-config.mjs";
import { resolveViteBasePath } from "../../vite.config.js";

const pagesWorkflowPath = resolve(".github/workflows/pages.yml");
const pagesSmokeRunnerPath = resolve("scripts/run-pages-smoke.mjs");
const siteConfigPath = resolve("site.config.json");
const githubPagesBasePath = getSiteBasePath();

describe("GitHub Pages configuration", () => {
  it("builds production assets from the canonical site base path by default", () => {
    expect(resolveViteBasePath("build")).toBe(githubPagesBasePath);
  });

  it("serves local development assets from the site root by default", () => {
    expect(resolveViteBasePath("serve")).toBe("/");
  });

  it("previews production assets from the canonical site base path by default", () => {
    expect(resolveViteBasePath("serve", true)).toBe(githubPagesBasePath);
  });

  it("allows the Vite base path to be overridden by environment", async () => {
    const previousBasePath = process.env.VITE_BASE_PATH;
    process.env.VITE_BASE_PATH = "/custom-base/";

    try {
      vi.resetModules();
      const { resolveViteBasePath: resolveBasePath } = await import("../../vite.config.js");

      expect(resolveBasePath("build")).toBe("/custom-base/");
      expect(resolveBasePath("serve")).toBe("/custom-base/");
      expect(resolveBasePath("serve", true)).toBe("/custom-base/");
    } finally {
      if (previousBasePath === undefined) {
        delete process.env.VITE_BASE_PATH;
      } else {
        process.env.VITE_BASE_PATH = previousBasePath;
      }
    }
  });

  it("publishes the Vite dist output through GitHub Actions", () => {
    const hasWorkflow = existsSync(pagesWorkflowPath);
    const workflow = hasWorkflow ? readFileSync(pagesWorkflowPath, "utf8") : "";

    expect(hasWorkflow).toBe(true);
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("actions/upload-pages-artifact");
    expect(workflow).toContain("path: dist");
    expect(workflow).toContain("actions/deploy-pages");
  });

  it("runs the full verification gate on the OS that owns the committed visual snapshot", () => {
    const hasWorkflow = existsSync(pagesWorkflowPath);
    const workflow = hasWorkflow ? readFileSync(pagesWorkflowPath, "utf8") : "";
    const verifyJob = workflow.match(/verify:\n(?<body>(?:[ ]{4}.+\n)+)/)?.groups?.body ?? "";
    const buildJob =
      workflow.match(/\n[ ]{2}build:\n(?<body>[\s\S]*?)\n[ ]{2}deploy:/)?.groups?.body ?? "";
    const deployJob = workflow.match(/\n[ ]{2}deploy:\n(?<body>[\s\S]*)/)?.groups?.body ?? "";

    expect(hasWorkflow).toBe(true);
    expect(verifyJob).toContain("runs-on: windows-latest");
    expect(verifyJob).toContain("run: npx playwright install chromium");
    expect(verifyJob).not.toContain("npx playwright install --with-deps chromium");
    expect(verifyJob).toContain("run: npm run verify");
    expect(buildJob).toContain("runs-on: ubuntu-latest");
    expect(deployJob).toContain("runs-on: ubuntu-latest");
    expect(workflow).toMatch(/build:\n(?:[ ]{4}.+\n)*[ ]{4}needs: verify/);
  });

  it("overrides the Vite base path for GitHub project Pages", () => {
    const hasWorkflow = existsSync(pagesWorkflowPath);
    const workflow = hasWorkflow ? readFileSync(pagesWorkflowPath, "utf8") : "";

    expect(hasWorkflow).toBe(true);
    expect(workflow).toContain('VITE_BASE_PATH: ""');
    expect(githubPagesBasePath).toBe("/FrameYourTrail/");
  });

  it("verifies the production build output with the canonical site base path", () => {
    const hasWorkflow = existsSync(pagesWorkflowPath);
    const workflow = hasWorkflow ? readFileSync(pagesWorkflowPath, "utf8") : "";
    const testBuildStep = workflow.match(
      /- name: Test production build output\n(?<body>(?: {8}.+\n)+)/
    )?.groups?.body;

    expect(hasWorkflow).toBe(true);
    expect(testBuildStep).toContain('VITE_BASE_PATH: ""');
    expect(testBuildStep).toContain("run: npm run test:build");
  });

  it("runs a browser smoke test against the GitHub project Pages artifact", () => {
    const hasWorkflow = existsSync(pagesWorkflowPath);
    const workflow = hasWorkflow ? readFileSync(pagesWorkflowPath, "utf8") : "";
    const pagesSmokeScript = readFileSync(resolve("scripts/run-pages-smoke.mjs"), "utf8");
    const buildJob =
      workflow.match(/\n[ ]{2}build:\n(?<body>[\s\S]*?)\n[ ]{2}deploy:/)?.groups?.body ?? "";
    const playwrightInstallIndex = buildJob.indexOf("- name: Install Playwright browsers");
    const browserSmokeIndex = buildJob.indexOf("- name: Browser smoke production Pages build");
    const browserSmokeStep = buildJob.match(
      /- name: Browser smoke production Pages build\n(?<body>(?: {8}.+\n)+)/
    )?.groups?.body;

    expect(hasWorkflow).toBe(true);
    expect(playwrightInstallIndex).toBeGreaterThan(-1);
    expect(buildJob).toContain("run: npx playwright install --with-deps chromium");
    expect(playwrightInstallIndex).toBeLessThan(browserSmokeIndex);
    expect(browserSmokeStep).not.toContain("PLAYWRIGHT_BASE_URL:");
    expect(browserSmokeStep).not.toContain("PLAYWRIGHT_DEV_COMMAND:");
    expect(browserSmokeStep).toContain("run: npm run test:pages");
    expect(pagesSmokeScript).toContain("getSiteBasePath");
    expect(pagesSmokeScript).toContain("PLAYWRIGHT_BASE_URL");
    expect(pagesSmokeScript).toContain("npm run preview -- --host 127.0.0.1");
  });

  it("derives the default Pages smoke URL from site.config.json", () => {
    const siteConfig = JSON.parse(readFileSync(siteConfigPath, "utf8"));
    const expectedBasePath = new URL(siteConfig.canonicalUrl).pathname;
    const expectedBaseUrl = new URL(expectedBasePath, "http://127.0.0.1:4173").href;
    const { captured, result } = runPagesSmokeWithCapturedEnv();

    expect(result.status).toBe(0);
    expect(captured.PLAYWRIGHT_BASE_URL).toBe(expectedBaseUrl);
    expect(captured.PLAYWRIGHT_DEV_COMMAND).toBe("npm run preview -- --host 127.0.0.1");
    expect(captured.VITE_BASE_PATH).toBe(expectedBasePath);
    expect(captured.argv).toEqual(["test", "tests/e2e/pages-smoke.spec.js"]);
  });

  it("preserves custom Pages smoke URL, dev command, and base path overrides", () => {
    const customBaseUrl = "http://127.0.0.1:4300/custom-pages/";
    const customDevCommand = "npm run preview -- --port 4300 --host 127.0.0.1";
    const { captured, result } = runPagesSmokeWithCapturedEnv({
      PLAYWRIGHT_BASE_URL: customBaseUrl,
      PLAYWRIGHT_DEV_COMMAND: customDevCommand,
      VITE_BASE_PATH: "/explicit-base/"
    });

    expect(result.status).toBe(0);
    expect(captured.PLAYWRIGHT_BASE_URL).toBe(customBaseUrl);
    expect(captured.PLAYWRIGHT_DEV_COMMAND).toBe(customDevCommand);
    expect(captured.VITE_BASE_PATH).toBe("/explicit-base/");
  });
});

/**
 * @param {Record<string, string | undefined>} [env]
 */
function runPagesSmokeWithCapturedEnv(env = {}) {
  const fixtureDir = mkdtempSync(resolve(tmpdir(), "pages-smoke-"));
  const cliDir = resolve(fixtureDir, "node_modules", "@playwright", "test");
  const capturePath = resolve(fixtureDir, "captured-env.json");

  try {
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(resolve(cliDir, "cli.js"), renderFakePlaywrightCli(), "utf8");
    writeFileSync(resolve(fixtureDir, "site.config.json"), readFileSync(siteConfigPath), "utf8");

    /** @type {Record<string, string | undefined>} */
    const childEnv = {
      ...process.env,
      PAGES_SMOKE_ENV_CAPTURE: capturePath
    };
    delete childEnv.PLAYWRIGHT_BASE_URL;
    delete childEnv.PLAYWRIGHT_DEV_COMMAND;
    delete childEnv.VITE_BASE_PATH;
    Object.assign(childEnv, env);

    const result = spawnSync(process.execPath, [pagesSmokeRunnerPath], {
      cwd: fixtureDir,
      encoding: "utf8",
      env: childEnv
    });
    const captured = JSON.parse(readFileSync(capturePath, "utf8"));

    return { captured, result };
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true });
  }
}

function renderFakePlaywrightCli() {
  return `const { writeFileSync } = require("node:fs");

writeFileSync(
  process.env.PAGES_SMOKE_ENV_CAPTURE,
  JSON.stringify({
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? null,
    PLAYWRIGHT_DEV_COMMAND: process.env.PLAYWRIGHT_DEV_COMMAND ?? null,
    VITE_BASE_PATH: process.env.VITE_BASE_PATH ?? null,
    argv: process.argv.slice(2)
  })
);
`;
}
