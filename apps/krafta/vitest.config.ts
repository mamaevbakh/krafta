/**
 * vitest.config.ts — minimal vitest setup for the locale write router carve-out.
 *
 * Per /plan-eng-review D11: the locale write router is the one bug class in
 * KRA-35 that produces irreversible data damage if shipped wrong (silently
 * writing UZ text into items.name corrupts the canonical row; git revert
 * restores UI but not data). This config stands up vitest just for that
 * test. Everything else in v1 ships under the "manual QA only" decision
 * (D7=C).
 *
 * Scope is intentionally narrow: jsdom-free, no @testing-library, no
 * mocking infrastructure. Just enough to run pure-function tests on
 * lib/catalogs/i18n.ts. Future tests can opt into more by extending this
 * config (or replacing it with a richer one when test infra warrants
 * the investment).
 *
 * The path alias mirrors tsconfig.json so test files can use `@/...`
 * imports the same as app code.
 */

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `import "server-only"` throws outside a react-server condition;
      // stub it so server-module pure functions (e.g. the Telegram payload
      // validators) stay testable.
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    // Pure-function tests only for now; no DOM, no browser API stubs.
    environment: "node",
    // Match the standard *.test.ts pattern colocated with source.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "dist/**"],
  },
});
