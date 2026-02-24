import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { runRenewalCycle, writePaymentDebugLog } from "@krafta/payments-core";

function getCronSecret() {
  return (
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
    throw new Error("missing_renewals_cron_secret");
  }

  const provided = parseBearerAuth(req.headers.get("authorization"));
  if (!provided) {
    throw new Error("missing_authorization_bearer");
  }
  if (!timingSafeEqualString(provided, secret)) {
    throw new Error("invalid_cron_secret");
  }
}

function parseRunDate(value: string | null | undefined) {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_date");
  }
  return date;
}

async function runRenewals(req: Request, dateOverride?: string | null) {
  const startedAt = Date.now();
  verifyCronAuth(req);
  const runAt = parseRunDate(dateOverride);
  const supabase = createAdminSupabase();
  const result = await runRenewalCycle(supabase, runAt);
  await writePaymentDebugLog(supabase, {
    scope: "renewals_cron",
    event: "run",
    data: {
      source: "vercel_cron",
      runAt: runAt.toISOString(),
      durationMs: Date.now() - startedAt,
      result,
      userAgent: req.headers.get("user-agent"),
      vercelCronHeader: req.headers.get("x-vercel-cron") ?? null,
    },
  });
  return NextResponse.json({
    ok: true,
    source: "cron",
    runAt: runAt.toISOString(),
    result,
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    return await runRenewals(req, url.searchParams.get("date"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "renewals_cron_failed";
    console.error("renewals cron GET failed", { message });
    try {
      const supabase = createAdminSupabase();
      await writePaymentDebugLog(supabase, {
        scope: "renewals_cron",
        event: "error",
        level: "error",
        data: {
          source: "vercel_cron",
          method: "GET",
          error: message,
          userAgent: req.headers.get("user-agent"),
          vercelCronHeader: req.headers.get("x-vercel-cron") ?? null,
        },
      });
    } catch {}
    const status =
      message === "missing_renewals_cron_secret" ||
      message === "missing_authorization_bearer" ||
      message === "invalid_cron_secret"
        ? 401
        : message === "invalid_date"
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    let dateOverride: string | null = null;
    const rawBody = await req.text();
    if (rawBody) {
      const payload = JSON.parse(rawBody) as { date?: string };
      dateOverride = payload?.date ?? null;
    }
    return await runRenewals(req, dateOverride);
  } catch (error) {
    const message = error instanceof Error ? error.message : "renewals_cron_failed";
    try {
      const supabase = createAdminSupabase();
      await writePaymentDebugLog(supabase, {
        scope: "renewals_cron",
        event: "error",
        level: "error",
        data: {
          source: "vercel_cron",
          method: "POST",
          error: message,
          userAgent: req.headers.get("user-agent"),
          vercelCronHeader: req.headers.get("x-vercel-cron") ?? null,
        },
      });
    } catch {}
    const status =
      message === "missing_renewals_cron_secret" ||
      message === "missing_authorization_bearer" ||
      message === "invalid_cron_secret"
        ? 401
        : message === "invalid_date"
          ? 400
          : 500;
    console.error("renewals cron POST failed", { message });
    return NextResponse.json({ error: message }, { status });
  }
}
