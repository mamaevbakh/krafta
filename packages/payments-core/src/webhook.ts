import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandleWebhookInput, HandleWebhookResult } from "./types";
import { finalizeInitialPayment, markPaymentFailed } from "./subscription";
import { verifyUzumWebhookSignature } from "./providers/uzum";

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

  // Fast idempotency guard on provider event id
  if (providerEventId) {
    const { data: existingEvent, error: existingEventErr } = await supabase
      .schema("payments")
      .from("payment_events")
      .select("id")
      .eq("provider_id", input.providerId)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    if (existingEventErr) throw existingEventErr;
    if (existingEvent) {
      return { ok: true };
    }
  }

  let matchedAttempt:
    | {
        id: string;
        payment_intent_id: string;
        org_provider_account_id: string;
      }
    | null = null;

  if (providerPaymentId) {
    const { data: attempt, error: attemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, payment_intent_id, org_provider_account_id")
      .eq("provider_id", input.providerId)
      .eq("provider_payment_id", providerPaymentId)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    matchedAttempt = attempt ?? null;
  }

  if (input.providerId === "uzum") {
    await verifyUzumWebhookSignature({
      supabase,
      orgProviderAccountId: matchedAttempt?.org_provider_account_id,
      rawBody: input.rawBody,
      headers: input.headers,
      allowUnsigned: process.env.PAY_ALLOW_UNSIGNED_UZUM_WEBHOOKS === "true",
    });
  }

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

  try {
    // 2) Provider-specific handling
    if (input.providerId === "uzum" && providerPaymentId) {
      const opStateRaw =
        payload && typeof payload === "object" && "operationState" in payload
          ? String((payload as any).operationState)
          : null;

      const normalizedState = opStateRaw?.toUpperCase() ?? null;
      const isSuccess = normalizedState === "SUCCESS";
      const isFailure = normalizedState === "CANCEL" || normalizedState === "ERROR";

      if ((isSuccess || isFailure) && matchedAttempt) {
        paymentIntentId = matchedAttempt.payment_intent_id;

        if (isSuccess) {
          await finalizeInitialPayment(supabase, {
            paymentIntentId: matchedAttempt.payment_intent_id,
            providerId: input.providerId,
            providerPaymentId,
            payload,
            attemptId: matchedAttempt.id,
          });
        } else {
          await markPaymentFailed(supabase, {
            paymentIntentId: matchedAttempt.payment_intent_id,
            providerId: input.providerId,
            providerPaymentId,
            payload,
          });
        }

        const { data: session, error: sessionErr } = await supabase
          .schema("payments")
          .from("checkout_sessions")
          .select("public_token")
          .eq("payment_intent_id", matchedAttempt.payment_intent_id)
          .order("created_at", { ascending: false })
          .maybeSingle();
        if (sessionErr) throw sessionErr;
        if (session?.public_token) checkoutPublicToken = session.public_token;
      }
    }

    await supabase
      .schema("payments")
      .from("payment_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", evt.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_processing_failed";
    await supabase
      .schema("payments")
      .from("payment_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: message,
      })
      .eq("id", evt.id);
    throw error;
  }

  return {
    ok: true,
    checkoutPublicToken,
    paymentIntentId,
  };
}

export async function applyWebhookEvent(
  supabase: SupabaseClient,
  input: HandleWebhookInput,
  environment: "test" | "live",
) {
  return handleWebhookEvent(supabase, input, environment);
}

function safeJsonParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
