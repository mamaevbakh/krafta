import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The two eve agents are workspace packages with their own node_modules;
    // without this, linting `agents/` walks into them and reports ~13k issues
    // from dependencies.
    "**/node_modules/**",
    "agents/*/.eve/**",
    ".vercel/**",
  ]),
]);

export default eslintConfig;
