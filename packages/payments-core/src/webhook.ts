import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandleWebhookInput, HandleWebhookResult } from "./types";

export async function handleWebhookEvent(
  supabase: SupabaseClient,
  input: HandleWebhookInput,
  environment: "test" | "live",
): Promise<HandleWebhookResult> {
  let checkoutPublicToken: string | undefined;
  let paymentIntentId: string | undefined;

  // 1) Store raw event (always)
  const payload = safeJsonParse(input.rawBody) ?? { raw: input.rawBody };

  const providerEventId =
    (payload && typeof payload === "object" && "id" in payload) ? String((payload as any).id) : null;

  const providerPaymentId =
    (payload && typeof payload === "object" && "payment_id" in payload)
      ? String((payload as any).payment_id)
      : (payload && typeof payload === "object" && "orderId" in payload)
        ? String((payload as any).orderId)
        : (payload && typeof payload === "object" && "order_id" in payload)
          ? String((payload as any).order_id)
          : null;

  const eventType =
    (payload && typeof payload === "object" && "event" in payload)
      ? String((payload as any).event)
      : (payload && typeof payload === "object" && "operationState" in payload)
        ? `operationState:${String((payload as any).operationState)}`
        : "unknown";

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

  // 2) Minimal provider-specific handling (MVP)
  // NOTE: Signature verification should be added once webhook_secret_encrypted is wired.
  if (input.providerId === "uzum" && providerPaymentId) {
    const opStateRaw =
      payload && typeof payload === "object" && "operationState" in payload
        ? String((payload as any).operationState)
        : null;

    const normalizedState = opStateRaw?.toUpperCase() ?? null;
    const attemptStatus =
      normalizedState === "SUCCESS" ? "succeeded" :
      normalizedState === "CANCEL" ? "failed" :
      normalizedState === "ERROR" ? "failed" :
      null;

    if (attemptStatus) {
      const { data: attempt, error: attErr } = await supabase
        .schema("payments")
        .from("payment_attempts")
        .select("id, payment_intent_id")
        .eq("provider_id", input.providerId)
        .eq("provider_payment_id", providerPaymentId)
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (attErr) throw attErr;

      if (attempt) {
        paymentIntentId = attempt.payment_intent_id;

        const { error: updAttErr } = await supabase
          .schema("payments")
          .from("payment_attempts")
          .update({ status: attemptStatus })
          .eq("id", attempt.id);

        if (updAttErr) throw updAttErr;

        const { error: updIntErr } = await supabase
          .schema("payments")
          .from("payment_intents")
          .update({ status: attemptStatus })
          .eq("id", attempt.payment_intent_id);

        if (updIntErr) throw updIntErr;

        const { data: session, error: sessErr } = await supabase
          .schema("payments")
          .from("checkout_sessions")
          .select("public_token")
          .eq("payment_intent_id", attempt.payment_intent_id)
          .order("created_at", { ascending: false })
          .maybeSingle();

        if (sessErr) throw sessErr;
        if (session?.public_token) checkoutPublicToken = session.public_token;
      }
    }
  }

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

  return {
    ok: true,
    checkoutPublicToken,
    paymentIntentId,
  };
}

function safeJsonParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
