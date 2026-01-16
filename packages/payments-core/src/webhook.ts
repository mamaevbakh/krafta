import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandleWebhookInput, HandleWebhookResult } from "./types";

export async function handleWebhookEvent(
  supabase: SupabaseClient,
  input: HandleWebhookInput,
  environment: "test" | "live",
): Promise<HandleWebhookResult> {
  // 1) Store raw event (always)
  const payload = safeJsonParse(input.rawBody) ?? { raw: input.rawBody };

  const providerEventId =
    (payload && typeof payload === "object" && "id" in payload) ? String((payload as any).id) : null;

  const providerPaymentId =
    (payload && typeof payload === "object" && "payment_id" in payload) ? String((payload as any).payment_id) : null;

  const eventType =
    (payload && typeof payload === "object" && "event" in payload) ? String((payload as any).event) : "unknown";

  const { data: evt, error: evtErr } = await supabase
    .schema("payments")
    .from("payment_events")
    .insert({
      provider_id: input.providerId,
      environment,
      provider_event_id: providerEventId,
      provider_payment_id: providerPaymentId,
      event_type: eventType,
      payload,
      // org_id is optional in schema; you can fill it once you can map it.
    })
    .select("id")
    .single();

  if (evtErr) throw evtErr;

  // 2) Provider-specific mapping (later):
  // - verify signature using org_provider_account_secrets
  // - map event -> payment_attempts.provider_payment_id
  // - update attempt + intent status
  // For now, we just store the event and return OK.
  await supabase
    .schema("payments")
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", evt.id);

  return { ok: true };
}

function safeJsonParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
