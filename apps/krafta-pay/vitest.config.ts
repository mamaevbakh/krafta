/**
 * vitest.config.ts — node-env test carve-out for pure logic in krafta-pay.
 *
 * Scope is intentionally narrow: no jsdom, no @testing-library, no mocking
 * infra. Just enough to run pure-function tests — the Atmos apply-outcome
 * resolution (telling a cardholder "subscription active" on a DECLINED charge
 * is the one bug class here that's genuinely damaging), tax-identity
 * validation, and message-catalog completeness.
 */

import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

const ROOT = __dirname;

/**
 * Mirror tsconfig's `"@/*": ["./src/*", "./*"]` — ordering AND fallback.
 *
 * A single `"@" -> root` alias is wrong here: most modules live under `src/`
 * (`@/lib/locales/…`) but a few sit at the top level (`@/lib/format`,
 * `@/components/…`). One alias resolves one group and breaks the other, and
 * the failure surfaces as "Cannot find package", which reads like a missing
 * dependency rather than a path-mapping bug.
 *
 * A two-entry alias array does not fix it either — vite takes the first regex
 * match and never falls through. TypeScript tries each root in order and takes
 * the first that exists on disk, so this resolver does the same.
 */
const TS_PATH_ROOTS = [path.resolve(ROOT, "src"), ROOT];
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".json"];

function resolveTsPathAlias(source: string): string | null {
  if (!source.startsWith("@/")) return null;
  const relative = source.slice(2);

  for (const base of TS_PATH_ROOTS) {
    const candidate = path.join(base, relative);

    for (const ext of EXTENSIONS) {
      const file = `${candidate}${ext}`;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    for (const ext of EXTENSIONS.filter(Boolean)) {
      const indexFile = path.join(candidate, `index${ext}`);
      if (fs.existsSync(indexFile)) return indexFile;
    }
  }
  return null;
}

export default defineConfig({
  plugins: [
    {
      name: "krafta-pay-tsconfig-paths",
      enforce: "pre",
      resolveId(source: string) {
        return resolveTsPathAlias(source);
      },
    },
  ],
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "dist/**"],
  },
});
