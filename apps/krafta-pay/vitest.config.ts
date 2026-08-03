/**
 * vitest.config.ts — minimal vitest carve-out for the Atmos pay-page correctness
 * logic. Mirrors apps/krafta: the one bug class here that's damaging if shipped
 * wrong is telling the cardholder "subscription active" on a DECLINED charge
 * (nothing collected, sub left incomplete). resolveApplyOutcome is the gate; it
 * gets a real test.
 *
 * Scope is intentionally narrow: node env, no jsdom, no @testing-library, no
 * mocking infra. Just enough to run pure-function tests. The `@` alias mirrors
 * tsconfig.json so test files can use `@/...` imports the same as app code.
 */

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "dist/**"],
  },
});
