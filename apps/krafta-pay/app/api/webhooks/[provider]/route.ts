import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { handleWebhookEvent, writePaymentDebugLog } from "@krafta/payments-core";
import { broadcastCheckoutUpdate } from "@/lib/realtime-broadcast";

const MAX_LOGGED_WEBHOOK_BODY_CHARS = 20_000;

function hashBody(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function truncateForLog(value: string, max = MAX_LOGGED_WEBHOOK_BODY_CHARS) {
  if (value.length <= max) {
    return { value, truncated: false };
  }
  return { value: value.slice(0, max), truncated: true };
}

function redactHeaderValue(name: string, value: string | null) {
  if (value == null) return null;
  const key = name.toLowerCase();
  if (
    key === "authorization" ||
    key === "cookie" ||
    key === "set-cookie" ||
    key === "x-uzum-signature" ||
    key === "x-signature" ||
    key === "signature"
  ) {
    return "[redacted]";
  }
  return value;
}

function sanitizeHeadersForLog(headers: Headers) {
  const out: Record<string, string | null> = {};
  headers.forEach((value, key) => {
    out[key] = redactHeaderValue(key, value);
  });
  return out;
}

function tryParseJson(rawBody: string) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

async function logWebhookProbe(req: Request, provider: string) {
  try {
    const supabase = createAdminSupabase();
    await writePaymentDebugLog(supabase, {
      scope: "webhook_route",
      event: "probe",
      providerId: provider,
      data: {
        method: req.method,
        url: req.url,
        headers: sanitizeHeadersForLog(req.headers),
      },
    });
  } catch {}
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const supabase = createAdminSupabase();
    const { provider } = await params;
    if (provider !== "uzum") {
      return NextResponse.json({ error: "provider_not_enabled_in_stage1" }, { status: 400 });
    }

    const rawBody = await req.text();
    const headers: Record<string, string | null> = {};
    req.headers.forEach((v, k) => (headers[k] = v));
    const parsedPayload = tryParseJson(rawBody);
    const rawBodyLogged = truncateForLog(rawBody);

    const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";
    await writePaymentDebugLog(supabase, {
      scope: "webhook_route",
      event: "request",
      providerId: provider,
      data: {
        environment,
        method: req.method,
        url: req.url,
        bodySize: rawBody.length,
        bodySha256: hashBody(rawBody),
        rawBody: rawBodyLogged.value,
        rawBodyTruncated: rawBodyLogged.truncated,
        bodyJson:
          parsedPayload && typeof parsedPayload === "object"
            ? parsedPayload
            : null,
        headers: sanitizeHeadersForLog(req.headers),
      },
    });

    const result = await handleWebhookEvent(
      supabase,
      { providerId: provider, rawBody, headers },
      environment
    );

    if (result.checkoutPublicToken) {
      try {
        await broadcastCheckoutUpdate(supabase, result.checkoutPublicToken, {
          reason: "webhook_processed",
          provider,
          paymentIntentId: result.paymentIntentId,
          at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("realtime broadcast failed", {
          provider,
          publicToken: result.checkoutPublicToken,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    await writePaymentDebugLog(supabase, {
      scope: "webhook_route",
      event: "success",
      providerId: provider,
      publicToken: result.checkoutPublicToken ?? null,
      paymentIntentId: result.paymentIntentId ?? null,
      data: {
        ok: true,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_failed";
    console.error("webhook failed", { message });
    try {
      const supabase = createAdminSupabase();
      const { provider } = await params;
      await writePaymentDebugLog(supabase, {
        scope: "webhook_route",
        event: "error",
        providerId: provider,
        level: "error",
        data: {
          error: message,
        },
      });
    } catch {}
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  await logWebhookProbe(req, provider);
  return NextResponse.json(
    {
      ok: true,
      message: "webhook_endpoint_alive",
      provider,
      expectedMethod: "POST",
    },
    { status: 200 },
  );
}
