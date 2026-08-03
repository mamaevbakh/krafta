import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { deliverPendingWebhooks, writePaymentDebugLog } from "@krafta/payments-core";

/**
 * Outbound webhook delivery worker.
 *
 * Producers (charge finalization, dunning, cancel) only ENQUEUE — they never
 * make an HTTP call inline. A merchant endpoint that hangs for 30 seconds must
 * not be able to stall a payment, and a charge that already settled at the
 * provider must not be rolled back because a webhook timed out. So delivery is
 * always out-of-band, here.
 *
 * Runs every minute (see vercel.json). Batch-bounded: a merchant whose endpoint
 * was down overnight has a backlog, and one sweep drains a slice of it rather
 * than blocking on all of it.
 */

function getCronSecret() {
  return (
    process.env.KRAFTA_PAY_WEBHOOKS_CRON_SECRET ??
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
  if (!secret) throw new Error("missing_webhooks_cron_secret");
  const provided = parseBearerAuth(req.headers.get("authorization"));
  if (!provided) throw new Error("missing_authorization_bearer");
  if (!timingSafeEqualString(provided, secret)) throw new Error("invalid_cron_secret");
}

async function handle(req: Request) {
  const supabase = createAdminSupabase();

  try {
    verifyCronAuth(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unauthorized";
    await writePaymentDebugLog(supabase, {
      type: "cron",
      event: "webhooks_deliver_cron.error",
      level: "error",
      data: { error: message },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100;

    const result = await deliverPendingWebhooks(supabase, { limit });

    await writePaymentDebugLog(supabase, {
      type: "cron",
      event: "webhooks_deliver_cron.run",
      level: result.exhausted > 0 || result.endpointsDisabled > 0 ? "warn" : "info",
      data: { result },
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_delivery_failed";
    await writePaymentDebugLog(supabase, {
      type: "cron",
      event: "webhooks_deliver_cron.error",
      level: "error",
      data: { error: message },
    }).catch(() => {});
    console.error("webhook delivery cron failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
