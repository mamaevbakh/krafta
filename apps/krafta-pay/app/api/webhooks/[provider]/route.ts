import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { handleWebhookEvent, writePaymentDebugLog } from "@krafta/payments-core";
import { broadcastCheckoutUpdate } from "@/lib/realtime-broadcast";

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

    const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";
    await writePaymentDebugLog(supabase, {
      scope: "webhook_route",
      event: "request",
      providerId: provider,
      data: {
        environment,
        bodySize: rawBody.length,
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
