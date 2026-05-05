// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import eslintConfig from "../../eslint.config.js";

const jsconfig = JSON.parse(readFileSync(join(process.cwd(), "jsconfig.json"), "utf8"));

describe("tooling configuration", () => {
  it("typechecks build and verification scripts", () => {
    expect(jsconfig.include).toContain("scripts/**/*.mjs");
  });

  it("keeps browser and node ESLint globals scoped to their runtime files", () => {
    const browserConfig = findEslintConfigFor("src/**/*.js");
    const rootNodeConfig = findEslintConfigFor("*.js");
    const scriptNodeConfig = findEslintConfigFor("scripts/**/*.mjs");
    const testConfig = findEslintConfigFor("tests/**/*.js");

    expect(browserConfig?.languageOptions?.globals).toMatchObject({
      window: false,
      document: false
    });
    expect(browserConfig?.languageOptions?.globals).not.toHaveProperty("process");

    expect(rootNodeConfig?.languageOptions?.globals).toMatchObject({
      process: false,
      Buffer: false
    });
    expect(rootNodeConfig?.languageOptions?.globals).not.toHaveProperty("window");

    expect(scriptNodeConfig?.languageOptions?.globals).toMatchObject({
      process: false,
      Buffer: false
    });
    expect(scriptNodeConfig?.languageOptions?.globals).not.toHaveProperty("window");

    expect(testConfig?.languageOptions?.globals).toMatchObject({
      window: false,
      document: false,
      process: false,
      Buffer: false
    });
  });
});

/**
 * @param {string} filePattern
 * @returns {Record<string, any> | undefined}
 */
function findEslintConfigFor(filePattern) {
  const configs = /** @type {Record<string, any>[]} */ (eslintConfig);
  return configs.find((config) => config.files?.includes(filePattern));
}
