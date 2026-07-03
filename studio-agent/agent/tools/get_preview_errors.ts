import { defineTool } from "eve/tools";
import { z } from "zod";
import { connect } from "node:net";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Debug the live preview ───────────────────────────────────────────────────
//
// preview_shop runs the shop's `next dev` on the HOST (see preview_shop.ts for
// why), so its stdout/stderr — the ONLY place compile errors and thrown
// exceptions show up — lands in `.preview-dev.log` on the host filesystem, at
// `<repo>/.krafta-previews/<id>/`. The agent's bash/file tools only ever see
// `/workspace` INSIDE the sandbox, so without this tool the agent is blind to
// its own shop breaking: it can `tsc --noEmit` (types only) but has no way to
// see a runtime throw, a missing-module compile error, or a 500 the merchant
// is actually looking at. This tool reads the log tail and probes the running
// page over HTTP so the agent can close that loop itself.

const LOG_TAIL_BYTES = 60_000; // enough to span several recompiles without ballooning the model's context
const RETURN_LOG_LINES = 40;
const FETCH_TIMEOUT_MS = 5_000;
const PAGE_ERROR_CHARS = 4_000;

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
const PREVIEW_ROOT = REPO_ROOT
  ? path.join(REPO_ROOT, ".krafta-previews")
  : path.join(process.cwd(), ".krafta-previews");

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "shop";
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

function pidAlive(pid: number): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

// Read only the last `maxBytes` of a (potentially large, ever-growing) log file.
function tailFile(filePath: string, maxBytes: number): string {
  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return "";
  }
  try {
    const size = statSync(filePath).size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString("utf8");
  } catch {
    return "";
  } finally {
    closeSync(fd);
  }
}

// Next's dev output marks a failing compile/module with "⨯"; a clean one with
// "✓ Compiled" / "✓ Ready". Take everything after the LAST success marker (or
// the whole tail if there's none) so a fixed-then-broken-again cycle doesn't
// surface a stale error, and a fixed shop doesn't drag its old error along.
function extractRecentErrors(logTail: string): string[] {
  const lines = logTail.split("\n");
  let lastGoodIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/✓\s+(Compiled|Ready)/.test(lines[i])) lastGoodIdx = i;
  }
  const relevant = lines.slice(lastGoodIdx + 1);
  const errorLines = relevant.filter((l) => /⨯|Error:|Failed to compile|Unhandled Rejection/.test(l));
  return errorLines.slice(-20);
}

export default defineTool({
  description:
    "Check whether the shop's LIVE PREVIEW is actually rendering cleanly — compile errors, thrown exceptions, and HTTP failures the merchant would see. The preview's dev-server log lives outside your sandbox, so this is the only way you can see those errors yourself. Call it right after preview_shop when you want to confirm a change didn't break anything, and immediately when the merchant says something looks broken or shows an error — read the real error here before guessing. Returns { running, healthy, httpStatus, pageError, recentLogErrors }.",
  inputSchema: z.object({
    publishableKey: z
      .string()
      .optional()
      .describe("The shop's krc_pub_… publishable key from your context — identifies which shop's preview to check."),
  }),
  async execute({ publishableKey }, ctx) {
    if (!REPO_ROOT) {
      throw new Error("could not locate the repo root for the preview server");
    }
    let id = publishableKey ? sanitizeId(publishableKey) : "";
    if (!id) {
      const sandbox = await ctx.getSandbox();
      id = sanitizeId(sandbox.id);
    }
    const dir = path.join(PREVIEW_ROOT, id);
    const marker = readPortMarker(dir);
    if (!marker || !pidAlive(marker.pid) || !(await portOpen(marker.port))) {
      return {
        running: false,
        healthy: false,
        message: "No live preview is running for this shop yet — call preview_shop first.",
      };
    }

    const logPath = path.join(dir, ".preview-dev.log");
    const logTail = tailFile(logPath, LOG_TAIL_BYTES);
    const recentLogErrors = extractRecentErrors(logTail);

    const url = `http://127.0.0.1:${marker.port}/`;
    let httpStatus: number | null = null;
    let pageError: string | null = null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      httpStatus = res.status;
      if (res.status >= 400) {
        const body = await res.text();
        pageError = body.slice(0, PAGE_ERROR_CHARS);
      }
    } catch (err) {
      pageError = `could not reach the preview: ${err instanceof Error ? err.message : String(err)}`;
    }

    const healthy = httpStatus !== null && httpStatus < 400 && recentLogErrors.length === 0;

    return {
      running: true,
      healthy,
      port: marker.port,
      httpStatus,
      pageError,
      recentLogErrors,
      logTail: logTail.split("\n").slice(-RETURN_LOG_LINES).join("\n"),
    };
  },
});
