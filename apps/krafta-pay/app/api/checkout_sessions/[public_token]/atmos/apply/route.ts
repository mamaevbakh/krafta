import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  loadAtmosCredentials,
  atmosBindConfirm,
  atmosCardDetailsFromBindResult,
  createAtmosRecurringCharge,
  extractAtmosChargeProviderRefs,
  persistBindingPaymentMethodForPaymentIntent,
  persistBindingPaymentMethodForCustomer,
  activateSubscriptionAfterCharge,
  writePaymentDebugLog,
  classifyAtmosFailure,
  AtmosError,
} from "@krafta/payments-core";
import { broadcastCheckoutUpdate } from "@/lib/realtime-broadcast";

// Step 2 of the Atmos inline flow: the cardholder's single SMS code. We confirm
// the binding (→ reusable card_token), SAVE the card before charging (so it
// survives a declined charge for retry/renewal), then charge the first invoice
// off-session with that token (no second OTP) and drive the subscription state
// machine through the same path the Uzum webhook uses.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> },
) {
  const supabase = createAdminSupabase();
  const { public_token } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const otp = String(body.otp ?? "").replace(/\D/g, "");
    if (otp.length < 4) {
      return NextResponse.json({ error: "atmos_otp_invalid" }, { status: 400 });
    }

    const { data: session, error: sessionErr } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .select("id, status, selected_provider_id, selected_attempt_id, payment_intent_id")
      .eq("public_token", public_token)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!session) {
      return NextResponse.json({ error: "checkout_session_not_found" }, { status: 404 });
    }
    if (session.selected_provider_id !== "atmos" || !session.selected_attempt_id) {
      return NextResponse.json({ error: "atmos_not_selected" }, { status: 409 });
    }

    const { data: intent, error: intentErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .select("id, amount_minor, currency, status, order_id, metadata")
      .eq("id", session.payment_intent_id)
      .maybeSingle();
    if (intentErr) throw intentErr;
    if (!intent) {
      return NextResponse.json({ error: "payment_intent_not_found" }, { status: 404 });
    }

    const { data: attempt, error: attemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, org_provider_account_id, raw_init_response")
      .eq("id", session.selected_attempt_id)
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    if (!attempt) {
      return NextResponse.json({ error: "payment_attempt_not_found" }, { status: 404 });
    }

    const bindTransactionId = (attempt.raw_init_response as any)?.bindTransactionId;
    if (!bindTransactionId) {
      return NextResponse.json({ error: "atmos_bind_not_started" }, { status: 409 });
    }
    const orgProviderAccountId = attempt.org_provider_account_id as string;

    // Optimistic lock: block a concurrent second submit / page reload.
    //
    // `failed` is chargeable here, not just the pre-charge states. A recovery
    // link (createRecoveryCheckoutSession, sent out with
    // subscription.payment_failed) is an OPEN session over an intent that
    // markPaymentFailed already flipped to `failed` — retrying with a different
    // card is the entire point of that link. Without `failed` in this list the
    // page renders a working card form whose submit always 409s, which is worse
    // than not sending the link at all.
    //
    // The lock still serializes: exactly one caller wins the transition out of
    // `failed`, and any concurrent submit matches no row and bails. Same
    // contract the manual retry route and chargeRenewal already rely on.
    const { data: locked, error: lockErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", intent.id)
      .in("status", ["requires_action", "requires_payment_method", "failed"])
      .select("id")
      .maybeSingle();
    if (lockErr) throw lockErr;
    if (!locked) {
      return NextResponse.json(
        { error: "payment_intent_not_submittable", paymentIntentStatus: intent.status },
        { status: 409 },
      );
    }

    const creds = await loadAtmosCredentials(supabase, orgProviderAccountId);

    // 1) Confirm the binding with the cardholder's OTP → reusable card_token.
    let bind;
    try {
      bind = await atmosBindConfirm(creds, {
        transactionId: String(bindTransactionId),
        otp,
      });
    } catch (bindError) {
      // Wrong/expired code: un-lock so the cardholder can re-enter the OTP.
      await supabase
        .schema("payments")
        .from("payment_intents")
        .update({ status: "requires_action", updated_at: new Date().toISOString() })
        .eq("id", intent.id);
      // A transient Atmos glitch (ERR-001) or a transport blip must NOT masquerade
      // as a wrong code — the cardholder typed it correctly. Keep atmos_otp_invalid
      // for a genuine rejection; surface the retryable copy otherwise.
      const code =
        classifyAtmosFailure(bindError) === "temporary"
          ? "atmos_temporary_error"
          : "atmos_otp_invalid";
      await writePaymentDebugLog(supabase, {
        scope: "atmos",
        event: "bind_confirm.error",
        level: "warn",
        providerId: "atmos",
        publicToken: public_token,
        paymentIntentId: intent.id,
        paymentAttemptId: attempt.id,
        data: {
          error: code,
          detail: bindError instanceof Error ? bindError.message : String(bindError),
          cause: (bindError as { cause?: { code?: string } } | null)?.cause?.code ?? null,
          atmos: bindError instanceof AtmosError ? bindError.raw : undefined,
        },
      }).catch(() => {});
      return NextResponse.json({ error: code }, { status: 400 });
    }

    // Card-update ("SetupIntent"): bind the new card as the subscription's
    // renewal default and finish — NO charge, NO activation. Isolated from the
    // charge path below so it can never move money.
    const intentMetadata = (intent.metadata ?? {}) as Record<string, unknown>;
    if (intentMetadata.purpose === "card_update") {
      const subscriptionId = String(intentMetadata.subscription_id ?? "");
      const customerId = String(intentMetadata.customer_id ?? "");
      if (!subscriptionId || !customerId) {
        await supabase
          .schema("payments")
          .from("payment_intents")
          .update({ status: "requires_action", updated_at: new Date().toISOString() })
          .eq("id", intent.id);
        return NextResponse.json({ error: "card_update_context_missing" }, { status: 409 });
      }

      const cardPersist = await persistBindingPaymentMethodForCustomer(supabase, {
        customerId,
        providerId: "atmos",
        bindingId: bind.cardToken,
        orgProviderAccountId,
        setDefaultForSubscriptionId: subscriptionId,
        cardDetails: atmosCardDetailsFromBindResult(bind),
      });

      await supabase
        .schema("payments")
        .from("payment_intents")
        .update({ status: "succeeded", updated_at: new Date().toISOString() })
        .eq("id", intent.id);

      await writePaymentDebugLog(supabase, {
        scope: "atmos",
        event: "card_update.saved",
        providerId: "atmos",
        publicToken: public_token,
        paymentIntentId: intent.id,
        paymentAttemptId: attempt.id,
        data: {
          subscriptionId,
          setAsDefault: cardPersist.setAsDefault,
          last4: bind.pan ? bind.pan.replace(/\D/g, "").slice(-4) : null,
        },
      }).catch(() => {});

      try {
        await broadcastCheckoutUpdate(supabase, public_token, {
          reason: "atmos_card_update",
          providerId: "atmos",
          paymentIntentId: intent.id,
        });
      } catch {}

      return NextResponse.json({ status: "succeeded", paymentIntentStatus: "succeeded" });
    }

    // 2) Save the card BEFORE charging (survives a declined first charge).
    const persist = await persistBindingPaymentMethodForPaymentIntent(supabase, {
      paymentIntentId: intent.id,
      providerId: "atmos",
      bindingId: bind.cardToken,
      orgProviderAccountId,
      cardDetails: atmosCardDetailsFromBindResult(bind),
    });

    await writePaymentDebugLog(supabase, {
      scope: "atmos",
      event: "bind_confirmed",
      providerId: "atmos",
      publicToken: public_token,
      paymentIntentId: intent.id,
      paymentAttemptId: attempt.id,
      data: {
        saved: persist.saved,
        last4: bind.pan ? bind.pan.replace(/\D/g, "").slice(-4) : null,
      },
    });

    // 3) Charge the first invoice off-session with the saved token (no 2nd OTP).
    const account = intent.order_id ? String(intent.order_id) : String(intent.id);
    const charge = await createAtmosRecurringCharge({
      supabase,
      orgProviderAccountId,
      providerToken: bind.cardToken,
      amountMinor: intent.amount_minor,
      account,
    });

    await writePaymentDebugLog(supabase, {
      scope: "atmos",
      event: "charge_result",
      level: charge.status === "failed" ? "warn" : "info",
      providerId: "atmos",
      publicToken: public_token,
      paymentIntentId: intent.id,
      paymentAttemptId: attempt.id,
      data: { chargeStatus: charge.status, providerPaymentId: charge.providerPaymentId },
    });

    // 4) Same activation path as the Uzum webhook → identical subscription state.
    await activateSubscriptionAfterCharge(supabase, {
      paymentIntentId: intent.id,
      providerId: "atmos",
      attemptId: attempt.id,
      chargeStatus: charge.status,
      providerPaymentId: charge.providerPaymentId,
      attemptRawResponse: {
        attemptKind: "atmos_inline_charge",
        providerRefs: extractAtmosChargeProviderRefs(charge.raw),
      },
      finalizePayload: { provider_id: "atmos", provider_payment_id: charge.providerPaymentId },
      failurePayload: { provider_id: "atmos", provider_payment_id: charge.providerPaymentId },
    });

    // 5) Nudge the hosted page to redirect (same realtime channel as webhooks).
    try {
      await broadcastCheckoutUpdate(supabase, public_token, {
        reason: "atmos_apply",
        providerId: "atmos",
        paymentIntentId: intent.id,
      });
    } catch {}

    // A declined first charge is HTTP 200 with status:"failed" (no money moved,
    // subscription left incomplete by activateSubscriptionAfterCharge). Carry an
    // explicit `error` so the hosted page can NEVER misread it as a success — the
    // client also gates on status, this is defense-in-depth for that P1.
    return NextResponse.json({
      status: charge.status,
      paymentIntentStatus: charge.status,
      ...(charge.status === "succeeded" ? {} : { error: "atmos_charge_declined" }),
    });
  } catch (error) {
    // A failure here may leave the intent 'processing' (e.g. charge settled at
    // Atmos but our write failed). The pay/get reconciler recovers it — do NOT
    // blindly reset the intent, which could hide a real charge.
    //
    // A known-transient Atmos glitch (ERR-001) or a transport blip gets the
    // retryable copy; a genuine decline or unknown charge failure keeps the
    // cautious generic code (both invite a retry the reconciler makes safe).
    const code =
      classifyAtmosFailure(error) === "temporary"
        ? "atmos_temporary_error"
        : "atmos_apply_failed";
    await writePaymentDebugLog(supabase, {
      scope: "atmos",
      event: "apply.error",
      level: "error",
      providerId: "atmos",
      publicToken: public_token,
      data: {
        error: code,
        detail: error instanceof Error ? error.message : String(error),
        cause: (error as { cause?: { code?: string } } | null)?.cause?.code ?? null,
        atmos: error instanceof AtmosError ? error.raw : undefined,
      },
    }).catch(() => {});
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
