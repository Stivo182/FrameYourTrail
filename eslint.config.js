import js from "@eslint/js";
import globals from "globals";

const sharedRules = {
  "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
};

export default [
  {
    ignores: [".worktrees/**", "dist/**", "coverage/**", "playwright-report/**", "test-results/**"]
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser
      }
    },
    rules: {
      ...sharedRules,
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: sharedRules
  },
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: sharedRules
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: sharedRules
  }
];
