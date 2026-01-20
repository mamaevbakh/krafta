import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { handleWebhookEvent } from "@krafta/payments-core";
import { broadcastCheckoutUpdate } from "@/lib/realtime-broadcast";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const supabase = createAdminSupabase();
  const { provider } = await params;

  const rawBody = await req.text();
  const headers: Record<string, string | null> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  const environment = (process.env.PAY_ENV ?? "live") as "test" | "live";

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

  return NextResponse.json({ ok: true });
}
