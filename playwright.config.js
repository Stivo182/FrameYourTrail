import { defineConfig, devices } from "@playwright/test";

const isNestedWorktree = process.cwd().split(/[\\/]/).includes(".worktrees");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const devCommand = process.env.PLAYWRIGHT_DEV_COMMAND ?? "npm run dev";

export default defineConfig({
  testDir: ".",
  testIgnore: isNestedWorktree ? [] : [".worktrees/**"],
  timeout: 30000,
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02
    }
  },
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: devCommand,
    url: baseURL,
    // Nested worktrees can have another branch's dev server on the default port.
    reuseExistingServer: !process.env.CI && !isNestedWorktree
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } }
    }
  ]
});
