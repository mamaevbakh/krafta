import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runBillingNotifications } from "@/lib/billing/notify-past-due";

// Vercel Cron entry point — see vercel.json. Runs both billing-notification
// sweeps: past_due (renewal failed) and card_expiring (proactive, before the
// next charge fails). Each alert goes to the org's connected Telegram bot at
// most once per (subscription, event) — see notify-past-due.ts for the
// idempotency + scoping rationale.

function getCronSecret() {
  return process.env.KRAFTA_NOTIFY_CRON_SECRET ?? process.env.CRON_SECRET ?? null;
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

export async function GET(req: Request) {
  const secret = getCronSecret();
  if (!secret) {
    return NextResponse.json({ error: "missing_notify_cron_secret" }, { status: 500 });
  }
  const provided = parseBearerAuth(req.headers.get("authorization"));
  if (!provided || !timingSafeEqualString(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runBillingNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "notify_billing_failed";
    console.error("notify-billing cron failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
