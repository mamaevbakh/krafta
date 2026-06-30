// Regenerate the codegen agent's sandbox seed from the canonical shop template.
//
// The eve sandbox can't use a pnpm workspace dependency, so the seed at
// agent/sandbox/workspace/ vendors `@krafta/commerce` as `@/lib/commerce-client`.
// That made the seed a hand-maintained fork that drifted from
// `templates/krafta-shop` (it missed the entire cart/checkout build). This script
// mirrors the template's SOURCE into the seed and rewrites the one import path, so
// the seed is always a faithful, buildable copy of the canonical template.
//
// What it does NOT touch (seed-owned): package.json, next.config.ts, tsconfig.json,
// the other root configs, and lib/commerce-client/ (the vendored client). Run after
// any change to templates/krafta-shop:  node studio-agent/scripts/sync-shop-template.mjs

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const SRC = path.join(ROOT, "templates/krafta-shop");
const DEST = path.join(ROOT, "studio-agent/agent/sandbox/workspace");

// Source trees + files to mirror from the template into the seed. Config files
// (package.json, next.config.ts, tsconfig.json, postcss, vercel.json) and the
// vendored lib/commerce-client/ are intentionally excluded — the seed owns those.
const SYNC_DIRS = ["app", "components", "lib/cart"];
const SYNC_FILES = [
  "theme.css",
  "README.md",
  "lib/commerce.ts",
  "lib/site.config.ts",
  "lib/utils.ts",
];

// Never copy these (build artifacts / the delegation brief / local env).
const SKIP_NAMES = new Set(["node_modules", ".next"]);
const skip = (name) =>
  SKIP_NAMES.has(name) ||
  name === "docs" ||
  name.endsWith(".tsbuildinfo") ||
  name.startsWith(".env");

// The seed vendors the client locally, so retarget the workspace-package import.
const rewrite = (s) => s.split('@krafta/commerce').join("@/lib/commerce-client");

async function syncFile(absSrc, rel) {
  const absDest = path.join(DEST, rel);
  await fs.mkdir(path.dirname(absDest), { recursive: true });
  let content = await fs.readFile(absSrc, "utf8");
  if (/\.(ts|tsx|md)$/.test(rel)) content = rewrite(content);
  await fs.writeFile(absDest, content);
  return rel;
}

async function walk(rel) {
  const entries = await fs.readdir(path.join(SRC, rel), { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (skip(e.name)) continue;
    const childRel = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...(await walk(childRel)));
    else out.push(await syncFile(path.join(SRC, childRel), childRel));
  }
  return out;
}

const synced = [];
for (const dir of SYNC_DIRS) synced.push(...(await walk(dir)));
for (const file of SYNC_FILES) synced.push(await syncFile(path.join(SRC, file), file));

// Guard: nothing in the seed should still reference the workspace package.
const leaks = [];
for (const rel of synced) {
  if (!/\.(ts|tsx)$/.test(rel)) continue;
  const text = await fs.readFile(path.join(DEST, rel), "utf8");
  if (text.includes("@krafta/commerce")) leaks.push(rel);
}

console.log(`Synced ${synced.length} files: templates/krafta-shop -> studio-agent seed`);
for (const rel of synced.sort()) console.log("  " + rel);
if (leaks.length) {
  console.error("\nERROR: residual @krafta/commerce import in:", leaks);
  process.exit(1);
}
console.log("\nOK — no residual @krafta/commerce imports.");
