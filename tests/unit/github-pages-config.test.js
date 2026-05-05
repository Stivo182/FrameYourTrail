// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import viteConfig from "../../vite.config.js";

const pagesWorkflowPath = resolve(".github/workflows/pages.yml");

describe("GitHub Pages configuration", () => {
  it("serves built assets from the site root by default", () => {
    expect(viteConfig.base).toBe("/");
  });

  it("allows the Vite base path to be overridden by environment", async () => {
    const previousBasePath = process.env.VITE_BASE_PATH;
    process.env.VITE_BASE_PATH = "/custom-base/";

    try {
      vi.resetModules();
      const { default: config } = await import("../../vite.config.js");

      expect(config.base).toBe("/custom-base/");
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
    expect(workflow).toContain("VITE_BASE_PATH: /FrameYourTrail/");
  });

  it("verifies the production build output with the GitHub project Pages base path", () => {
    const hasWorkflow = existsSync(pagesWorkflowPath);
    const workflow = hasWorkflow ? readFileSync(pagesWorkflowPath, "utf8") : "";
    const testBuildStep = workflow.match(
      /- name: Test production build output\n(?<body>(?: {8}.+\n)+)/
    )?.groups?.body;

    expect(hasWorkflow).toBe(true);
    expect(testBuildStep).toContain("env:");
    expect(testBuildStep).toContain("VITE_BASE_PATH: /FrameYourTrail/");
    expect(testBuildStep).toContain("run: npm run test:build");
  });

  it("runs a browser smoke test against the GitHub project Pages artifact", () => {
    const hasWorkflow = existsSync(pagesWorkflowPath);
    const workflow = hasWorkflow ? readFileSync(pagesWorkflowPath, "utf8") : "";
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
    expect(browserSmokeStep).toContain(
      "PLAYWRIGHT_BASE_URL: http://127.0.0.1:4173/FrameYourTrail/"
    );
    expect(browserSmokeStep).toContain(
      "PLAYWRIGHT_DEV_COMMAND: npm run preview -- --host 127.0.0.1"
    );
    expect(browserSmokeStep).toContain("run: npm run test:pages");
  });
});
