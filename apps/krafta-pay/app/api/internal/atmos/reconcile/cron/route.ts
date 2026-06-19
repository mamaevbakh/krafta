import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  reconcileProcessingAtmosIntents,
  writePaymentDebugLog,
  type AtmosReconcileResult,
} from "@krafta/payments-core";
import { broadcastCheckoutUpdate } from "@/lib/realtime-broadcast";

// Deferred reconciler for Atmos intents stranded in 'processing'. Atmos inline
// charges settle synchronously; if a local write blips AFTER Atmos took the
// money the intent is left 'processing'. This sweeps those, re-queries Atmos
// (/merchant/pay/get) and replays the same finalize path the apply route would
// have run. Runs on Vercel Cron (see vercel.json) every 5 minutes.
//
// Manual recovery of a single intent (skips the age filter):
//   GET /api/internal/atmos/reconcile/cron?public_token=<token>
//   GET /api/internal/atmos/reconcile/cron?intent_id=<uuid>

function getCronSecret() {
  return (
    process.env.KRAFTA_PAY_ATMOS_RECONCILE_CRON_SECRET ??
    process.env.KRAFTA_PAY_RENEWALS_CRON_SECRET ??
    process.env.KRAFTA_PAY_CRON_SECRET ??
    process.env.CRON_SECRET ??
    null
  );
}

function parseBearerAuth(authHeader: string | null) {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function timingSafeEqualString(a: string, b: string) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyCronAuth(req: Request) {
  const secret = getCronSecret();
  if (!secret) {
    throw new Error("missing_atmos_reconcile_cron_secret");
  }
  const provided = parseBearerAuth(req.headers.get("authorization"));
  if (!provided) {
    throw new Error("missing_authorization_bearer");
  }
  if (!timingSafeEqualString(provided, secret)) {
    throw new Error("invalid_cron_secret");
  }
}

function parsePositiveInt(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("invalid_number");
  }
  return Math.trunc(n);
}

type ReconcileParams = {
  publicToken?: string;
  paymentIntentId?: string;
  olderThanMs?: number;
  limit?: number;
};

async function runReconcile(req: Request, params: ReconcileParams) {
  const startedAt = Date.now();
  verifyCronAuth(req);

  const supabase = createAdminSupabase();
  const result: AtmosReconcileResult = await reconcileProcessingAtmosIntents(supabase, {
    publicToken: params.publicToken,
    paymentIntentId: params.paymentIntentId,
    olderThanMs: params.olderThanMs,
    limit: params.limit,
  });

  // Nudge the hosted page (same realtime channel as the apply route / webhooks)
  // for any intent we just resolved, so a waiting customer redirects promptly.
  for (const item of result.items) {
    if ((item.outcome === "succeeded" || item.outcome === "failed") && item.publicToken) {
      try {
        await broadcastCheckoutUpdate(supabase, item.publicToken, {
          reason: "atmos_reconcile",
          providerId: "atmos",
          paymentIntentId: item.paymentIntentId,
        });
      } catch {}
    }
  }

  await writePaymentDebugLog(supabase, {
    scope: "atmos_reconcile_cron",
    event: "run",
    level: result.errors > 0 ? "warn" : "info",
    data: {
      source: "vercel_cron",
      durationMs: Date.now() - startedAt,
      params,
      result: {
        scanned: result.scanned,
        succeeded: result.succeeded,
        failed: result.failed,
        stillProcessing: result.stillProcessing,
        skipped: result.skipped,
        errors: result.errors,
      },
      userAgent: req.headers.get("user-agent"),
      vercelCronHeader: req.headers.get("x-vercel-cron") ?? null,
    },
  });

  return NextResponse.json({ ok: true, source: "cron", result });
}

function errorStatus(message: string) {
  if (
    message === "missing_atmos_reconcile_cron_secret" ||
    message === "missing_authorization_bearer" ||
    message === "invalid_cron_secret"
  ) {
    return 401;
  }
  if (message === "invalid_number") return 400;
  return 500;
}

async function logError(req: Request, method: string, message: string) {
  try {
    const supabase = createAdminSupabase();
    await writePaymentDebugLog(supabase, {
      scope: "atmos_reconcile_cron",
      event: "error",
      level: "error",
      data: {
        source: "vercel_cron",
        method,
        error: message,
        userAgent: req.headers.get("user-agent"),
        vercelCronHeader: req.headers.get("x-vercel-cron") ?? null,
      },
    });
  } catch {}
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    return await runReconcile(req, {
      publicToken: url.searchParams.get("public_token") ?? undefined,
      paymentIntentId: url.searchParams.get("intent_id") ?? undefined,
      olderThanMs: parsePositiveInt(url.searchParams.get("older_than_ms")),
      limit: parsePositiveInt(url.searchParams.get("limit")),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "atmos_reconcile_cron_failed";
    console.error("atmos reconcile cron GET failed", { message });
    await logError(req, "GET", message);
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}

export async function POST(req: Request) {
  try {
    let params: ReconcileParams = {};
    const rawBody = await req.text();
    if (rawBody) {
      const payload = JSON.parse(rawBody) as {
        public_token?: string;
        intent_id?: string;
        older_than_ms?: number;
        limit?: number;
      };
      params = {
        publicToken: payload.public_token,
        paymentIntentId: payload.intent_id,
        olderThanMs: payload.older_than_ms,
        limit: payload.limit,
      };
    }
    return await runReconcile(req, params);
  } catch (error) {
    const message = error instanceof Error ? error.message : "atmos_reconcile_cron_failed";
    console.error("atmos reconcile cron POST failed", { message });
    await logError(req, "POST", message);
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
