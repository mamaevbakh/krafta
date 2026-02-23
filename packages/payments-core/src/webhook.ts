import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandleWebhookInput, HandleWebhookResult } from "./types";
import { writePaymentDebugLog } from "./debug-log";
import { finalizeInitialPayment, markPaymentFailed } from "./subscription";
import { createUzumRecurringCharge, verifyUzumWebhookSignature } from "./providers/uzum";

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

  await writePaymentDebugLog(supabase, {
    scope: "webhook",
    event: "received",
    providerId: input.providerId,
    data: {
      eventType,
      providerEventId,
      providerPaymentId,
      signatureHeaderPresent: Boolean(
        input.headers["x-uzum-signature"] ??
          input.headers["x-signature"] ??
          input.headers.signature,
      ),
    },
  });

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
        status: string;
      }
    | null = null;

  if (providerPaymentId) {
    const { data: attempt, error: attemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, payment_intent_id, org_provider_account_id, status")
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
    await writePaymentDebugLog(supabase, {
      scope: "webhook",
      event: "signature_verified",
      providerId: input.providerId,
      paymentIntentId: matchedAttempt?.payment_intent_id ?? null,
      paymentAttemptId: matchedAttempt?.id ?? null,
      data: {
        providerPaymentId,
      },
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
      const bindingId = pickBindingId(payload);
      const isBindingSetupAttempt =
        matchedAttempt?.status === "requires_action" ||
        matchedAttempt?.status === "initialized";

      if ((isSuccess || isFailure) && matchedAttempt) {
        paymentIntentId = matchedAttempt.payment_intent_id;

        if (isSuccess) {
          // Binding-first flow:
          // 1) checkout register returns bindingId in webhook
          // 2) run merchantPay using that binding
          // 3) finalize subscription only after merchantPay success
          if (bindingId && isBindingSetupAttempt) {
            const { data: intent, error: intentErr } = await supabase
              .schema("payments")
              .from("payment_intents")
              .select("id, amount_minor, currency, description, order_id, status, metadata")
              .eq("id", matchedAttempt.payment_intent_id)
              .maybeSingle();
            if (intentErr) throw intentErr;
            if (!intent) throw new Error("payment_intent_not_found");

            const { data: session, error: sessionErr } = await supabase
              .schema("payments")
              .from("checkout_sessions")
              .select("id, public_token, org_id, customer_id, success_url, cancel_url, return_url, metadata")
              .eq("payment_intent_id", matchedAttempt.payment_intent_id)
              .order("created_at", { ascending: false })
              .maybeSingle();
            if (sessionErr) throw sessionErr;

            const chargeResult = await createUzumRecurringCharge({
              supabase,
              orgProviderAccountId: matchedAttempt.org_provider_account_id,
              paymentIntentId: matchedAttempt.payment_intent_id,
              providerToken: bindingId,
              clientId: session?.customer_id ?? session?.org_id ?? "unknown",
              description: intent.description ?? "Checkout payment",
              orderNumber: String(intent.order_id ?? intent.id),
              orderId: providerPaymentId,
              currency: intent.currency,
              amountMinor: intent.amount_minor,
              returnUrl: session?.return_url ?? session?.success_url ?? session?.cancel_url ?? null,
              publicToken: session?.public_token ?? null,
              uzumCart:
                getUzumCartFromMetadata(intent.metadata) ??
                getUzumCartFromMetadata(session?.metadata) ??
                null,
            });

            await writePaymentDebugLog(supabase, {
              scope: "webhook",
              event: "binding_charge_result",
              providerId: input.providerId,
              publicToken: session?.public_token ?? null,
              paymentIntentId: matchedAttempt.payment_intent_id,
              paymentAttemptId: matchedAttempt.id,
              level: chargeResult.status === "failed" ? "warn" : "info",
              data: {
                bindingProviderPaymentId: providerPaymentId,
                chargeProviderPaymentId: chargeResult.providerPaymentId ?? null,
                chargeStatus: chargeResult.status,
              },
            });

            const normalizedAttemptStatus =
              chargeResult.status === "succeeded"
                ? "succeeded"
                : chargeResult.status === "processing"
                  ? "processing"
                  : "failed";
            const { error: attemptUpdateErr } = await supabase
              .schema("payments")
              .from("payment_attempts")
              .update({
                status: normalizedAttemptStatus,
                provider_payment_id: chargeResult.providerPaymentId ?? providerPaymentId,
                raw_init_response: {
                  bindingWebhookPayload: payload,
                  chargeResult: chargeResult.raw,
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", matchedAttempt.id);
            if (attemptUpdateErr) throw attemptUpdateErr;

            if (chargeResult.status === "succeeded") {
              await finalizeInitialPayment(supabase, {
                paymentIntentId: matchedAttempt.payment_intent_id,
                providerId: input.providerId,
                providerPaymentId: chargeResult.providerPaymentId ?? providerPaymentId,
                payload,
                attemptId: matchedAttempt.id,
              });
            } else if (chargeResult.status === "failed") {
              await markPaymentFailed(supabase, {
                paymentIntentId: matchedAttempt.payment_intent_id,
                providerId: input.providerId,
                providerPaymentId: chargeResult.providerPaymentId ?? providerPaymentId,
                payload: chargeResult.raw,
              });
            } else {
              const { error: intentProcessingErr } = await supabase
                .schema("payments")
                .from("payment_intents")
                .update({
                  status: "processing",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", matchedAttempt.payment_intent_id);
              if (intentProcessingErr) throw intentProcessingErr;
            }
          } else {
            await finalizeInitialPayment(supabase, {
              paymentIntentId: matchedAttempt.payment_intent_id,
              providerId: input.providerId,
              providerPaymentId,
              payload,
              attemptId: matchedAttempt.id,
            });
          }
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

    await writePaymentDebugLog(supabase, {
      scope: "webhook",
      event: "processed",
      providerId: input.providerId,
      publicToken: checkoutPublicToken ?? null,
      paymentIntentId: paymentIntentId ?? null,
      data: {
        eventType,
        providerPaymentId,
      },
    });
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
    await writePaymentDebugLog(supabase, {
      scope: "webhook",
      event: "processing_error",
      providerId: input.providerId,
      publicToken: checkoutPublicToken ?? null,
      paymentIntentId: paymentIntentId ?? null,
      level: "error",
      data: {
        eventType,
        providerPaymentId,
        error: message,
      },
    });
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

function pickBindingId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  if (typeof rec.bindingId === "string" && rec.bindingId) return rec.bindingId;
  if (typeof rec.binding_id === "string" && rec.binding_id) return rec.binding_id;
  if (rec.result && typeof rec.result === "object") {
    const nested = rec.result as Record<string, unknown>;
    if (typeof nested.bindingId === "string" && nested.bindingId) return nested.bindingId;
    if (typeof nested.binding_id === "string" && nested.binding_id) return nested.binding_id;
  }
  return null;
}

function getUzumCartFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const rec = metadata as Record<string, unknown>;
  if (rec.uzumCart && typeof rec.uzumCart === "object") return rec.uzumCart;
  if (rec.uzum && typeof rec.uzum === "object") {
    const uz = rec.uzum as Record<string, unknown>;
    if (uz.cart && typeof uz.cart === "object") return uz.cart;
  }
  return null;
}
