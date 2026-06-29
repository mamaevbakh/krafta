import { defineTool } from "eve/tools";
import { z } from "zod";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { connect, createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// ── Live preview of the coded shop ───────────────────────────────────────────
//
// eve's sandbox API exposes file/run/spawn but HIDES the underlying VM's port
// and public hostname, so we can't iframe a `next dev` running *inside* the
// sandbox. But authored tools run in the APP RUNTIME (this host process, full
// Node + filesystem), not the sandbox — so we snapshot the shop OUT of the
// sandbox and run it here, where the dashboard's browser can reach it.
//
// Flow: tar /workspace (source only) → read the tarball out of the sandbox →
// extract it into a per-shop dir INSIDE this repo → run the shop's own
// `next dev` on a free host port → return the URL. The panel iframes it; native
// HMR means a later refresh just re-extracts and Next reloads.
//
// Deps are NOT installed per shop. Every coded shop has the SAME stack as
// templates/krafta-shop (which the monorepo already installed), so we symlink
// the preview's node_modules at the shared install — zero install, zero disk,
// instant. The preview dir lives inside the repo on purpose: Turbopack rejects a
// node_modules symlink that points outside the project's filesystem root, so
// both the preview and the shared deps must sit under the same repo root.
//
// This is the LOCAL-dev preview. The same export step is what the future
// publish-to-subdomain path will hand to `vercel deploy`.

const MAX_SERVERS = 6;

// Preview-internal files that must survive the per-run source-wipe.
const PRESERVE = new Set([
  "node_modules",
  ".next",
  ".preview-dev.log",
  ".preview-public-env",
  ".preview-port",
]);

// Remove a path recursively, tolerating the macOS ENOTEMPTY race that rmSync
// can hit on a busy/large dir. Falls back to shell `rm -rf` and never throws.
function rmrf(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    spawnSync("rm", ["-rf", target], { stdio: "ignore" });
  }
}

// Walk up to the monorepo root (pnpm-workspace.yaml). eve runs authored tools
// from a copied snapshot under studio-agent/.eve/dev-runtime/snapshots/<id>/source,
// which carries its OWN pnpm-workspace.yaml — so we must return the OUTERMOST
// match (the real repo root), not the first one we hit. The real root is an
// ancestor of the snapshot, and only it has templates/krafta-shop (the shared deps).
function findRepoRoot(start: string): string | null {
  let dir = start;
  let outermost: string | null = null;
  for (let i = 0; i < 24; i += 1) {
    if (
      existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      existsSync(path.join(dir, "templates", "krafta-shop"))
    ) {
      outermost = dir; // keep climbing; the last (highest) match wins
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
const PREVIEW_ROOT = REPO_ROOT
  ? path.join(REPO_ROOT, ".krafta-previews")
  : path.join(process.cwd(), ".krafta-previews");
// The monorepo's already-installed shop deps — the symlink target.
const SHARED_DEPS = REPO_ROOT
  ? path.join(REPO_ROOT, "templates", "krafta-shop", "node_modules")
  : "";

// `proc` is present only for servers WE spawned this process-lifetime; an
// adopted (orphaned-then-readopted) server has just its pid from the on-disk
// marker. Either way `pid` is the process-group leader to signal.
type Running = {
  port: number;
  pid: number;
  proc?: ChildProcess;
  dir: string;
  startedAt: number;
};

// Keyed by the shop's publishable key, so each shop keeps one dev server across
// refreshes. This map is in-memory, so it RESETS when eve hot-reloads this
// module (dev) or the runtime restarts — that's why we also persist the port +
// pid to a `.preview-port` marker and re-adopt from it (see killByPid / the
// execute body), so we never spawn a SECOND next dev in the same dir (Next
// holds a per-dir lock and the second instance exits on startup).
const servers = new Map<string, Running>();

// Signal a whole process group (Next/Turbopack fork workers, so signalling the
// parent pid alone orphans them — we spawn detached and signal the negative pid
// to take the group down).
function killByPid(pid: number): void {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

function killServer(r: Running): void {
  killByPid(r.pid);
}

function pidAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPortMarker(dir: string): { port: number; pid: number } | null {
  try {
    const [p, pid] = readFileSync(path.join(dir, ".preview-port"), "utf8")
      .trim()
      .split(/\s+/)
      .map(Number);
    if (p) return { port: p, pid: pid || 0 };
  } catch {
    // no marker yet
  }
  return null;
}

function writePortMarker(dir: string, port: number, pid: number): void {
  try {
    writeFileSync(path.join(dir, ".preview-port"), `${port} ${pid}\n`);
  } catch {
    // best-effort
  }
}

let exitHooked = false;
function hookExit(): void {
  if (exitHooked) return;
  exitHooked = true;
  const killAll = (): void => {
    for (const s of servers.values()) killServer(s);
  };
  process.once("exit", killAll);
  process.once("SIGINT", () => {
    killAll();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    killAll();
    process.exit(0);
  });
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "shop";
}

// Ask the OS for an unused port by binding :0, then release it.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ port, host: "127.0.0.1" });
    sock.setTimeout(800);
    const done = (ok: boolean): void => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => resolve(false));
  });
}

async function waitForPort(
  port: number,
  proc: ChildProcess,
  failed: { err?: Error },
  timeoutMs = 120_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (failed.err) throw failed.err;
    if (proc.exitCode !== null) {
      throw new Error(`preview server exited early (code ${proc.exitCode})`);
    }
    if (await portOpen(port)) return;
    await delay(500);
  }
  throw new Error("preview server did not become ready in time");
}

function depNames(pkgPath: string): string[] {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

// Make node_modules available without installing when we can. If the preview's
// deps are a subset of the shared install (the common case — same stack as the
// template), symlink the shared node_modules. Only when the agent added a dep
// the shared install lacks do we fall back to a real per-shop install.
function ensureDeps(dir: string): void {
  // The launch artifact is node_modules/.bin/next — gate on that exact path,
  // not the package dir, so a half-set-up node_modules is treated as missing.
  if (existsSync(path.join(dir, "node_modules", ".bin", "next"))) return;

  const sharedHasNext =
    SHARED_DEPS && existsSync(path.join(SHARED_DEPS, ".bin", "next"));
  if (sharedHasNext) {
    const shared = new Set(
      depNames(path.join(SHARED_DEPS, "..", "package.json")),
    );
    const needed = depNames(path.join(dir, "package.json"));
    const coveredByShared = needed.every(
      (name) => name.startsWith("@krafta/") || shared.has(name),
    );
    if (coveredByShared) {
      rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
      symlinkSync(SHARED_DEPS, path.join(dir, "node_modules"), "dir");
      return;
    }
  }

  // Fallback: real install for a shop that added a dependency. Capture output
  // so a failure surfaces the real npm error instead of an opaque message.
  const res = spawnSync(
    "npm",
    ["install", "--no-audit", "--no-fund", "--prefer-offline"],
    { cwd: dir, encoding: "utf8", env: process.env },
  );
  if (res.status !== 0) {
    const tail = (res.stderr || res.stdout || "").trim().split("\n").slice(-8).join("\n");
    throw new Error(`could not install the preview's dependencies:\n${tail}`);
  }
}

// Keep the running-server set bounded: kill the oldest other shop's dev server
// when we'd exceed the cap.
function evictIfNeeded(keepId: string): void {
  if (servers.size < MAX_SERVERS) return;
  const oldest = [...servers.entries()]
    .filter(([id]) => id !== keepId)
    .sort((a, b) => a[1].startedAt - b[1].startedAt)[0];
  if (!oldest) return;
  killServer(oldest[1]);
  servers.delete(oldest[0]);
}

export default defineTool({
  description:
    "Build or refresh the merchant's LIVE PREVIEW of their shop. Snapshots the current /workspace shop, runs it, and returns a URL the dashboard shows in an iframe so the merchant sees their real shop. Call this right after you connect the shop to its catalog (so they see their starting point), and again after any change they could see. Returns { url, port }.",
  inputSchema: z.object({
    commerceApiUrl: z
      .string()
      .optional()
      .describe(
        "The shop's Krafta engine base URL from your context. Used to (re)write .env.local so the preview always renders the correct catalog.",
      ),
    publishableKey: z
      .string()
      .optional()
      .describe("The shop's krc_pub_… publishable key from your context."),
  }),
  async execute({ commerceApiUrl, publishableKey }, ctx) {
    hookExit();
    if (!REPO_ROOT) {
      throw new Error("could not locate the repo root for the preview server");
    }
    const sandbox = await ctx.getSandbox();
    // Key the preview by the shop's publishable key — it's stable across turns,
    // whereas eve's sandbox.id carries a per-run token, which would spin up a new
    // dev server (and lose the warm .next cache) on every refresh. Fall back to
    // the sandbox id only when no key is available.
    const id = sanitizeId(publishableKey || sandbox.id);
    const dir = path.join(PREVIEW_ROOT, id);

    // 1. Package the shop's source (no node_modules/.next/.git) inside the sandbox.
    const tar = await sandbox.run({
      command:
        "tar -czf /tmp/krafta-preview.tgz -C /workspace --exclude=./node_modules --exclude=./.next --exclude=./.git .",
    });
    if (tar.exitCode !== 0) {
      throw new Error(`could not package the shop: ${tar.stderr}`.trim());
    }
    const bytes = await sandbox.readBinaryFile({ path: "/tmp/krafta-preview.tgz" });
    if (!bytes) throw new Error("could not read the packaged shop from the sandbox");

    // 2. Materialize on the host. Preserve the prior .env.local (catalog binding)
    //    across the wipe, and keep node_modules + .next so the symlink and dev
    //    cache survive. Wipe source first so renames/deletes mirror exactly.
    mkdirSync(dir, { recursive: true });
    const envPath = path.join(dir, ".env.local");
    let priorEnv: string | null = null;
    if (existsSync(envPath)) {
      try {
        priorEnv = readFileSync(envPath, "utf8");
      } catch {
        priorEnv = null;
      }
    }
    // Preserve preview-internal artifacts across the source-wipe: the deps
    // symlink, the warm dev cache, the dev log, and the public-env fingerprint
    // marker (wiping the marker would make every run think the env changed and
    // needlessly bust .next).
    for (const entry of readdirSync(dir)) {
      if (PRESERVE.has(entry)) continue;
      rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
    const tgz = path.join(dir, ".krafta-preview.tgz");
    writeFileSync(tgz, Buffer.from(bytes));
    const extract = spawnSync("tar", ["-xzf", tgz], { cwd: dir, stdio: "ignore" });
    rmSync(tgz, { force: true });
    if (extract.status !== 0) throw new Error("could not unpack the shop on the host");

    // 3. Guarantee the catalog binding. Prefer the values passed in (authoritative);
    //    otherwise keep whatever the tarball carried, then restore the prior env so
    //    a forgotten/empty .env.local never shows an unbound, empty preview.
    if (commerceApiUrl && publishableKey) {
      writeFileSync(
        envPath,
        `NEXT_PUBLIC_KRAFTA_API_URL=${commerceApiUrl}\nNEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY=${publishableKey}\n`,
      );
    } else if (!existsSync(envPath) && priorEnv) {
      writeFileSync(envPath, priorEnv);
    }

    // 4. Make deps available (symlink shared install, or fall back to install).
    ensureDeps(dir);

    // 4b. Resolve the PUBLIC env Turbopack must inline. NEXT_PUBLIC_* are baked
    //     in at compile time, so passing them as real env vars to next dev is
    //     more reliable than trusting .env.local to be read first (the parent
    //     runtime's env can otherwise shadow it). Prefer the tool inputs; else
    //     parse the .env.local we just settled.
    let pubApiUrl = commerceApiUrl ?? "";
    let pubKey = publishableKey ?? "";
    if ((!pubApiUrl || !pubKey) && existsSync(envPath)) {
      const txt = readFileSync(envPath, "utf8");
      if (!pubApiUrl)
        pubApiUrl = txt.match(/^NEXT_PUBLIC_KRAFTA_API_URL=(.*)$/m)?.[1]?.trim() ?? "";
      if (!pubKey)
        pubKey =
          txt.match(/^NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY=(.*)$/m)?.[1]?.trim() ?? "";
    }

    // If the inlined public env changed since the last build, the warm .next has
    // a stale apiUrl/key baked in — bust it and force a fresh server (an adopted
    // orphan would still be serving the old inlined env).
    const envMarker = path.join(dir, ".preview-public-env");
    const envFingerprint = `${pubApiUrl}\n${pubKey}`;
    const priorFingerprint = existsSync(envMarker)
      ? readFileSync(envMarker, "utf8")
      : null;
    const envChanged = priorFingerprint !== envFingerprint;
    if (envChanged) {
      const stale = servers.get(id);
      if (stale) {
        killServer(stale);
        servers.delete(id);
      }
      // Also down any orphan we didn't spawn (in-memory map lost on reload).
      const orphan = readPortMarker(dir);
      if (orphan) killByPid(orphan.pid);
      rmrf(path.join(dir, ".next"));
      writeFileSync(envMarker, envFingerprint);
    }

    // 5. Ensure ONE dev server is running for this shop. Reuse across refreshes
    //    (Next's HMR picks up the freshly-extracted files). The in-memory map
    //    resets on module reload/restart, so re-adopt a still-running server
    //    from the on-disk marker rather than spawning a conflicting second one.
    let running = servers.get(id);
    if (!running && !envChanged) {
      const marker = readPortMarker(dir);
      if (marker && (await portOpen(marker.port))) {
        running = { port: marker.port, pid: marker.pid, dir, startedAt: Date.now() };
        servers.set(id, running);
      }
    }
    const alive =
      running !== undefined &&
      (running.proc ? running.proc.exitCode === null : true) &&
      (await portOpen(running.port));
    if (!alive) {
      if (running) {
        killServer(running);
        servers.delete(id);
      }
      // Make sure no orphan still holds this dir's lock before we spawn.
      const orphan = readPortMarker(dir);
      if (orphan && pidAlive(orphan.pid)) killByPid(orphan.pid);
      evictIfNeeded(id);
      const port = await freePort();
      const bin = path.join(dir, "node_modules", ".bin", "next");
      const log = openSync(path.join(dir, ".preview-dev.log"), "a");
      // Bind 0.0.0.0 so the dashboard reaches the preview at whatever host the
      // browser is on (localhost on the Mac, or the LAN IP from a phone).
      const proc = spawn(bin, ["dev", "-p", String(port), "--hostname", "0.0.0.0"], {
        cwd: dir,
        env: {
          ...process.env,
          NODE_ENV: "development",
          BROWSER: "none",
          NEXT_TELEMETRY_DISABLED: "1",
          // Authoritative — these override anything inherited from the parent
          // runtime so Turbopack inlines the correct catalog binding.
          ...(pubApiUrl ? { NEXT_PUBLIC_KRAFTA_API_URL: pubApiUrl } : {}),
          ...(pubKey ? { NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY: pubKey } : {}),
        },
        stdio: ["ignore", log, log],
        detached: true,
      });
      proc.unref();
      const failed: { err?: Error } = {};
      proc.on("error", (err) => {
        failed.err = err instanceof Error ? err : new Error(String(err));
      });
      running = { port, pid: proc.pid ?? 0, proc, dir, startedAt: Date.now() };
      servers.set(id, running);
      try {
        await waitForPort(port, proc, failed);
      } catch (err) {
        servers.delete(id);
        killServer(running);
        throw err;
      }
      writePortMarker(dir, port, proc.pid ?? 0);
    }

    if (!running) throw new Error("preview server could not be started");
    // The panel rewrites the host to match the dashboard origin; the port is the
    // stable identifier and 127.0.0.1 is a working same-machine fallback.
    return { url: `http://127.0.0.1:${running.port}`, port: running.port };
  },
});
