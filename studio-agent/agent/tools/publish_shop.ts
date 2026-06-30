import { defineTool } from "eve/tools";
import { z } from "zod";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Publish the coded shop to the public web ─────────────────────────────────
//
// Sibling of preview_shop.ts. Where preview runs the shop's `next dev` on the
// host for the in-dashboard iframe, publish DEPLOYS the same exported shop to
// Krafta's shared shop-hosting Vercel project and returns its public URL.
//
// The artifact is the merchant's real /workspace shop (the AI-built Next app),
// tarred OUT of the eve sandbox exactly like preview. Each shop is its OWN
// Vercel deployment in ONE shared `krafta-shops` project (founder-locked: one
// project, per-shop deploys — necessary anyway since every coded shop is unique
// code). The catalog binding rides as build + runtime env so the deployed shop
// renders the merchant's commerce.
//
// Like preview, this runs in the APP RUNTIME (full Node + the locally-authed
// `vercel` CLI), so it's a LOCAL-DEV capability today (eve isn't mounted on
// Vercel). The custom-subdomain step (<shop>.<apex>) is deliberately NOT here —
// that touches the live domain and is gated on founder sign-off.

// The shared shop-hosting project. Overridable via env for staging/rotation.
const VERCEL_PROJECT_ID =
  process.env.KRAFTA_SHOPS_PROJECT_ID ?? "prj_m1UtLk7WHtnJmMlJwOIrFmhktx6c";
const VERCEL_ORG_ID =
  process.env.KRAFTA_SHOPS_ORG_ID ?? "team_foBrfCOYNmfPqg3jcPGZPsgu";
const VERCEL_SCOPE = process.env.KRAFTA_SHOPS_SCOPE ?? "bakh";
const DEPLOY_TIMEOUT_MS = 300_000;

// The deployed shop is PUBLIC, so it must reach a PUBLIC commerce engine — never
// the localhost/LAN URL the in-dashboard preview uses on the dev machine. When
// the passed apiUrl is local, swap it for the public engine (env-overridable;
// set KRAFTA_PUBLIC_API_URL to the prod engine when shops go to production).
const PUBLIC_ENGINE_URL =
  process.env.KRAFTA_PUBLIC_API_URL ?? "https://dev.krafta.org";

// Shops live at <slug>.<apex>. The krafta-shops project owns the *.<apex>
// wildcard, so each deployment just needs its subdomain aliased to it.
const SHOP_APEX = process.env.KRAFTA_SHOPS_APEX ?? "krafta.org";

// Coerce a shop slug into a valid DNS label (lowercase, alphanumeric + hyphens,
// no leading/trailing hyphen, ≤63 chars).
function toSubdomain(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
}

function publicApiUrl(apiUrl: string): string {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
    apiUrl,
  )
    ? PUBLIC_ENGINE_URL
    : apiUrl;
}

// Outermost pnpm-workspace.yaml that also has templates/krafta-shop = the real
// repo root (eve runs authored tools from a snapshot copy with its own marker —
// see preview_shop.ts for the full story).
function findRepoRoot(start: string): string | null {
  let dir = start;
  let outermost: string | null = null;
  for (let i = 0; i < 24; i += 1) {
    if (
      existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      existsSync(path.join(dir, "templates", "krafta-shop"))
    ) {
      outermost = dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return outermost;
}

const REPO_ROOT =
  findRepoRoot(path.dirname(fileURLToPath(import.meta.url))) ??
  findRepoRoot(process.cwd());
const PUBLISH_ROOT = REPO_ROOT
  ? path.join(REPO_ROOT, ".krafta-publishes")
  : path.join(process.cwd(), ".krafta-publishes");

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "shop";
}

// Run `vercel` without blocking the runtime event loop (spawnSync would freeze
// it for the whole remote build). Resolves with the combined output + code.
function runVercel(
  args: string[],
  cwd: string,
): Promise<{ code: number; out: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn("vercel", args, { cwd, env: process.env });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        // already gone
      }
    }, DEPLOY_TIMEOUT_MS);
    proc.stdout?.on("data", (d) => (out += d.toString()));
    proc.stderr?.on("data", (d) => (out += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, out: `${out}\n${String(err)}`, timedOut });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, timedOut });
    });
  });
}

export default defineTool({
  description:
    "Publish the merchant's shop to the public web. Exports the current /workspace shop and deploys it to Krafta's shop hosting, returning the public URL the merchant can share. Call this when the merchant asks to publish, go live, or make their shop public — after you've confirmed the shop looks right in the preview. Returns { url }.",
  inputSchema: z.object({
    commerceApiUrl: z
      .string()
      .describe(
        "The shop's Krafta engine base URL from your context — baked into the deploy so the live shop renders the right catalog.",
      ),
    publishableKey: z
      .string()
      .describe("The shop's krc_pub_… publishable key from your context."),
    subdomain: z
      .string()
      .optional()
      .describe(
        "The shop's slug from your context — the shop goes live at <slug>.krafta.org. Omit only if you don't have it; then the shop gets a temporary URL instead.",
      ),
  }),
  async execute({ commerceApiUrl, publishableKey, subdomain }, ctx) {
    if (!REPO_ROOT) {
      throw new Error("could not locate the repo root to publish the shop");
    }
    // Fail fast with a clear message if the deploy CLI isn't available/authed.
    const cliCheck = spawnSync("vercel", ["whoami", "--scope", VERCEL_SCOPE], {
      encoding: "utf8",
      env: process.env,
    });
    if (cliCheck.status !== 0) {
      throw new Error(
        "the `vercel` CLI isn't available or isn't logged in — publishing needs it (run `vercel login`)",
      );
    }

    const sandbox = await ctx.getSandbox();
    const id = sanitizeId(publishableKey || sandbox.id);
    const dir = path.join(PUBLISH_ROOT, id);

    // Publish staging is DISPOSABLE — the live shop runs on Vercel, nothing reads
    // this dir after the deploy. Wrap the whole job so we always remove it (even
    // on failure), so .krafta-publishes never accumulates per-shop build dirs and
    // a half-extracted dir is never left behind (CORR-1 / PROD-4).
    try {
    // 1. Package the shop's source (no node_modules/.next/.git) from the sandbox.
    const tar = await sandbox.run({
      command:
        "tar -czf /tmp/krafta-publish.tgz -C /workspace --exclude=./node_modules --exclude=./.next --exclude=./.git .",
    });
    if (tar.exitCode !== 0) {
      throw new Error(`could not package the shop: ${tar.stderr}`.trim());
    }
    const bytes = await sandbox.readBinaryFile({
      path: "/tmp/krafta-publish.tgz",
    });
    if (!bytes) throw new Error("could not read the packaged shop from the sandbox");

    // 2. Materialize fresh on the host (full wipe — a publish always deploys the
    //    current shop, no stale carryover).
    mkdirSync(dir, { recursive: true });
    for (const entry of readdirSync(dir)) {
      rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
    const tgz = path.join(dir, ".krafta-publish.tgz");
    writeFileSync(tgz, Buffer.from(bytes));
    const extract = spawnSync("tar", ["-xzf", tgz], { cwd: dir, stdio: "ignore" });
    rmSync(tgz, { force: true });
    if (extract.status !== 0) {
      throw new Error("could not unpack the shop on the host");
    }

    // 3. Make it deploy-ready + link to the shared krafta-shops project.
    //    Always (re)write vercel.json so a bare project deploys the Next output
    //    instead of looking for a static `public/` dir, even if an older shop
    //    session predates the template's vercel.json.
    writeFileSync(
      path.join(dir, "vercel.json"),
      `${JSON.stringify({ framework: "nextjs" }, null, 2)}\n`,
    );
    writeFileSync(path.join(dir, ".vercelignore"), "node_modules\n.next\n.env*\n");
    mkdirSync(path.join(dir, ".vercel"), { recursive: true });
    writeFileSync(
      path.join(dir, ".vercel", "project.json"),
      JSON.stringify({ projectId: VERCEL_PROJECT_ID, orgId: VERCEL_ORG_ID }),
    );

    // 4. Deploy. The catalog binding goes in as BOTH build env (so NEXT_PUBLIC_*
    //    inline correctly) and runtime env (for the force-dynamic SSR). Use a
    //    PUBLIC engine URL — the live shop can't reach the preview's localhost.
    const apiUrl = publicApiUrl(commerceApiUrl);
    const envArgs = [
      "-b",
      `NEXT_PUBLIC_KRAFTA_API_URL=${apiUrl}`,
      "-b",
      `NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY=${publishableKey}`,
      "-e",
      `NEXT_PUBLIC_KRAFTA_API_URL=${apiUrl}`,
      "-e",
      `NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY=${publishableKey}`,
    ];
    const { code, out, timedOut } = await runVercel(
      ["deploy", "--yes", "--scope", VERCEL_SCOPE, ...envArgs],
      dir,
    );
    if (timedOut) {
      throw new Error("publishing timed out while the shop was deploying");
    }
    if (code !== 0) {
      const tail = out.trim().split("\n").slice(-10).join("\n");
      throw new Error(`could not publish the shop:\n${tail}`);
    }

    // The deploy prints the deployment URL; take the last *.vercel.app it emits.
    const urls = out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g);
    const deploymentUrl = urls ? urls[urls.length - 1] : null;
    if (!deploymentUrl) {
      throw new Error(
        `the shop deployed but no public URL was found in the output:\n${out.slice(-400)}`,
      );
    }

    // 5. Point the shop's own subdomain at this deployment. The project owns the
    //    *.<apex> wildcard, so the alias provisions instantly. If aliasing fails
    //    (or we have no slug), fall back to the raw deployment URL AND flag that
    //    the subdomain isn't live — so the dashboard never shows a green
    //    "Live · <slug>.krafta.org" for a host that doesn't resolve (CORR-3/UX-5).
    const label = subdomain ? toSubdomain(subdomain) : "";
    if (label) {
      const aliasHost = `${label}.${SHOP_APEX}`;
      const alias = await runVercel(
        ["alias", "set", deploymentUrl, aliasHost, "--scope", VERCEL_SCOPE],
        dir,
      );
      if (alias.code === 0) {
        return {
          url: `https://${aliasHost}`,
          deploymentUrl,
          subdomainProvisioned: true,
          projectId: VERCEL_PROJECT_ID,
        };
      }
      // Aliasing failed — the deploy is still live at its raw URL, but say so
      // plainly so the caller can warn instead of claiming the subdomain.
      return {
        url: deploymentUrl,
        deploymentUrl,
        subdomainProvisioned: false,
        intendedUrl: `https://${aliasHost}`,
        aliasError: alias.out.trim().split("\n").slice(-4).join("\n"),
        projectId: VERCEL_PROJECT_ID,
      };
    }

    return {
      url: deploymentUrl,
      deploymentUrl,
      subdomainProvisioned: false,
      projectId: VERCEL_PROJECT_ID,
    };
    } finally {
      // Disposable staging — remove it whether the publish succeeded or threw.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {
        spawnSync("rm", ["-rf", dir], { stdio: "ignore" });
      }
    }
  },
});
