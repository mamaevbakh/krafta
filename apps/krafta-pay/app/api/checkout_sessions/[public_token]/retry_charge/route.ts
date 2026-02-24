import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  createUzumRecurringCharge,
  extractUzumChargeProviderRefs,
  finalizeInitialPayment,
  markPaymentFailed,
  writePaymentDebugLog,
} from "@krafta/payments-core";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ public_token: string }> },
) {
  const supabase = createAdminSupabase();
  let publicToken = "";
  let paymentIntentId: string | null = null;
  let paymentAttemptId: string | null = null;

  try {
    const routeParams = await params;
    publicToken = routeParams.public_token;

    const { data: sessionRow, error: sessionErr } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .select(
        [
          "id",
          "public_token",
          "status",
          "org_id",
          "customer_id",
          "payment_intent_id",
          "selected_provider_id",
          "selected_attempt_id",
          "success_url",
          "cancel_url",
          "return_url",
          "metadata",
        ].join(","),
      )
      .eq("public_token", publicToken)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!sessionRow) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const session = sessionRow as any;
    if (session.selected_provider_id !== "uzum") {
      return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
    }
    if (!session.payment_intent_id) {
      return NextResponse.json({ error: "payment_intent_missing" }, { status: 400 });
    }
    const paymentIntentIdValue = String(session.payment_intent_id);
    paymentIntentId = paymentIntentIdValue;

    const { data: intentRow, error: intentErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .select("id, amount_minor, currency, description, order_id, status, metadata, updated_at")
      .eq("id", paymentIntentIdValue)
      .maybeSingle();
    if (intentErr) throw intentErr;
    if (!intentRow) {
      return NextResponse.json({ error: "payment_intent_not_found" }, { status: 404 });
    }

    const intent = intentRow as any;
    const intentStatus = String(intent.status ?? "").toLowerCase();
    if (intentStatus === "succeeded") {
      return NextResponse.json({ ok: true, status: "succeeded", paymentIntentStatus: "succeeded" });
    }
    if (intentStatus !== "failed") {
      return NextResponse.json(
        { error: "payment_intent_not_retryable", paymentIntentStatus: intent.status ?? null },
        { status: 409 },
      );
    }

    const { data: invoiceRow, error: invoiceErr } = await supabase
      .schema("payments")
      .from("invoices")
      .select("id, subscription_id")
      .eq("payment_intent_id", paymentIntentIdValue)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (invoiceErr) throw invoiceErr;
    if (!invoiceRow?.subscription_id) {
      return NextResponse.json({ error: "subscription_not_found_for_payment_intent" }, { status: 404 });
    }

    const { data: subscriptionRow, error: subscriptionErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .select("id, org_id, customer_id, default_payment_method_id")
      .eq("id", invoiceRow.subscription_id)
      .maybeSingle();
    if (subscriptionErr) throw subscriptionErr;
    if (!subscriptionRow) {
      return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
    }
    const subscription = subscriptionRow as any;

    let attempt: any = null;
    if (session.selected_attempt_id) {
      const { data: attemptById, error: attemptByIdErr } = await supabase
        .schema("payments")
        .from("payment_attempts")
        .select("id, provider_id, org_provider_account_id, provider_payment_id, status, raw_init_response")
        .eq("id", session.selected_attempt_id)
        .maybeSingle();
      if (attemptByIdErr) throw attemptByIdErr;
      attempt = attemptById;
    }
    if (!attempt) {
      const { data: latestAttempt, error: latestAttemptErr } = await supabase
        .schema("payments")
        .from("payment_attempts")
        .select("id, provider_id, org_provider_account_id, provider_payment_id, status, raw_init_response")
        .eq("payment_intent_id", paymentIntentIdValue)
        .eq("provider_id", "uzum")
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (latestAttemptErr) throw latestAttemptErr;
      attempt = latestAttempt;
    }
    if (!attempt?.id) {
      return NextResponse.json({ error: "payment_attempt_not_found" }, { status: 404 });
    }
    paymentAttemptId = attempt.id;

    let paymentMethod: any = null;
    if (subscription.default_payment_method_id) {
      const { data: defaultMethod, error: defaultMethodErr } = await supabase
        .schema("payments")
        .from("payment_methods")
        .select("id, provider_id, org_provider_account_id, provider_token, status")
        .eq("id", subscription.default_payment_method_id)
        .maybeSingle();
      if (defaultMethodErr) throw defaultMethodErr;
      paymentMethod = defaultMethod;
    }

    if (!paymentMethod && subscription.customer_id) {
      const fallbackMethodQuery = supabase
        .schema("payments")
        .from("payment_methods")
        .select("id, provider_id, org_provider_account_id, provider_token, status")
        .eq("customer_id", subscription.customer_id)
        .eq("provider_id", "uzum")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1);

      const { data: fallbackRows, error: fallbackMethodErr } = await fallbackMethodQuery;
      if (fallbackMethodErr) throw fallbackMethodErr;
      paymentMethod = Array.isArray(fallbackRows) ? fallbackRows[0] : null;
    }

    if (!paymentMethod || paymentMethod.provider_id !== "uzum" || !paymentMethod.provider_token) {
      return NextResponse.json({ error: "saved_binding_not_found" }, { status: 409 });
    }

    const orgProviderAccountId =
      attempt.org_provider_account_id ??
      paymentMethod.org_provider_account_id ??
      null;
    if (!orgProviderAccountId) {
      return NextResponse.json({ error: "org_provider_account_missing" }, { status: 409 });
    }

    const bindingOrderId =
      extractBindingOrderIdFromAttemptRaw(attempt.raw_init_response) ??
      (typeof attempt.provider_payment_id === "string" && attempt.provider_payment_id
        ? attempt.provider_payment_id
        : null);

    await writePaymentDebugLog(supabase, {
      scope: "checkout_retry",
      event: "manual_request",
      providerId: "uzum",
      publicToken,
      paymentIntentId,
      paymentAttemptId,
      data: {
        sessionStatus: session.status ?? null,
        intentStatus: intent.status ?? null,
        hasSavedBinding: true,
        bindingOrderId,
        chargeOrderStrategy: "register_new_order",
      },
    });

    const { data: lockedIntent, error: lockIntentErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentIntentIdValue)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (lockIntentErr) throw lockIntentErr;
    if (!lockedIntent) {
      const { data: currentIntent, error: currentIntentErr } = await supabase
        .schema("payments")
        .from("payment_intents")
        .select("status")
        .eq("id", paymentIntentIdValue)
        .maybeSingle();
      if (currentIntentErr) throw currentIntentErr;
      return NextResponse.json(
        {
          error: "payment_intent_not_retryable",
          paymentIntentStatus: currentIntent?.status ?? null,
        },
        { status: 409 },
      );
    }

    const priorAttemptRaw =
      attempt.raw_init_response &&
      typeof attempt.raw_init_response === "object" &&
      !Array.isArray(attempt.raw_init_response)
        ? (attempt.raw_init_response as Record<string, unknown>)
        : {};

    const { error: markAttemptProcessingErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
        raw_init_response: {
          ...priorAttemptRaw,
          attemptKind: "manual_retry_bound_charge",
          manualRetry: {
            requestedAt: new Date().toISOString(),
            source: "result_page",
          },
        },
      })
      .eq("id", attempt.id);
    if (markAttemptProcessingErr) throw markAttemptProcessingErr;

    const providerToken = String(paymentMethod.provider_token);

    const chargeResult = await createUzumRecurringCharge({
      supabase,
      orgProviderAccountId,
      paymentIntentId: paymentIntentIdValue,
      providerToken,
      clientId: session.customer_id ?? session.org_id ?? "unknown",
      description: intent.description ?? "Checkout payment",
      // Must differ from the binding register orderNumber, otherwise Uzum may
      // return the binding orderId again (idempotent by orderNumber).
      orderNumber: `manual-${Date.now()}-${attempt.id.slice(0, 8)}`,
      currency: intent.currency,
      amountMinor: intent.amount_minor,
      returnUrl: session.return_url ?? session.success_url ?? session.cancel_url ?? null,
      publicToken,
      uzumCart:
        getUzumCartFromMetadata(intent.metadata) ??
        getUzumCartFromMetadata(session.metadata) ??
        null,
    });
    const uzumRefs = extractUzumChargeProviderRefs(chargeResult.raw);
    const chargeAttemptProviderPaymentId =
      chargeResult.providerPaymentId ??
      uzumRefs.chargeOrderId ??
      (typeof attempt.provider_payment_id === "string" ? attempt.provider_payment_id : null);

    const normalizedAttemptStatus =
      chargeResult.status === "succeeded"
        ? "succeeded"
        : chargeResult.status === "processing"
          ? "processing"
          : "failed";

    const { error: updateAttemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .update({
        status: normalizedAttemptStatus,
        provider_payment_id: chargeAttemptProviderPaymentId,
        raw_init_response: ({
          ...priorAttemptRaw,
          attemptKind: "manual_retry_bound_charge",
          providerRefs: uzumRefs,
          manualRetry: {
            requestedAt: new Date().toISOString(),
            source: "result_page",
            chargeResult: chargeResult.raw,
            providerRefs: uzumRefs,
          },
        } as any),
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);
    if (updateAttemptErr) throw updateAttemptErr;

    if (chargeResult.status === "succeeded") {
      await finalizeInitialPayment(supabase, {
        paymentIntentId,
        providerId: "uzum",
        providerPaymentId: chargeAttemptProviderPaymentId,
        payload: chargeResult.raw,
        attemptId: attempt.id,
      });
    } else if (chargeResult.status === "failed") {
      await markPaymentFailed(supabase, {
        paymentIntentId,
        providerId: "uzum",
        providerPaymentId: chargeAttemptProviderPaymentId,
        payload: chargeResult.raw,
      });
    } else {
      const { error: keepProcessingErr } = await supabase
        .schema("payments")
        .from("payment_intents")
        .update({
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentIntentIdValue);
      if (keepProcessingErr) throw keepProcessingErr;
    }

    const finalIntentStatus =
      chargeResult.status === "succeeded"
        ? "succeeded"
        : chargeResult.status === "processing"
          ? "processing"
          : "failed";

    await writePaymentDebugLog(supabase, {
      scope: "checkout_retry",
      event: "manual_result",
      providerId: "uzum",
      publicToken,
      paymentIntentId,
      paymentAttemptId,
      level: chargeResult.status === "failed" ? "warn" : "info",
      data: {
        chargeStatus: chargeResult.status,
        providerPaymentId: chargeAttemptProviderPaymentId,
        providerRefs: uzumRefs,
      },
    });

    return NextResponse.json({
      ok: true,
      status: chargeResult.status,
      paymentIntentStatus: finalIntentStatus,
    });
  } catch (error) {
    const err = error as { message?: string; code?: string; details?: string; hint?: string };
    const message = err?.message ?? (typeof error === "string" ? error : "Unknown error");

    await writePaymentDebugLog(supabase, {
      scope: "checkout_retry",
      event: "manual_error",
      providerId: "uzum",
      publicToken: publicToken || null,
      paymentIntentId,
      paymentAttemptId,
      level: "error",
      data: {
        error: message,
        code: err?.code ?? null,
        details: err?.details ?? null,
        hint: err?.hint ?? null,
      },
    });

    console.error("checkout_session retry_charge POST failed", {
      publicToken,
      paymentIntentId,
      paymentAttemptId,
      error: message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractBindingOrderIdFromAttemptRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const bindingWebhookPayload = record.bindingWebhookPayload;
  return pickProviderPaymentId(bindingWebhookPayload);
}

function pickProviderPaymentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;

  const direct =
    (typeof record.payment_id === "string" && record.payment_id) ||
    (typeof record.orderId === "string" && record.orderId) ||
    (typeof record.order_id === "string" && record.order_id) ||
    null;
  if (direct) return direct;

  const result = record.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const nested = result as Record<string, unknown>;
    return (
      (typeof nested.payment_id === "string" && nested.payment_id) ||
      (typeof nested.orderId === "string" && nested.orderId) ||
      (typeof nested.order_id === "string" && nested.order_id) ||
      null
    );
  }

  return null;
}

function getUzumCartFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rec = metadata as Record<string, unknown>;
  if (rec.uzumCart && typeof rec.uzumCart === "object") return rec.uzumCart;
  if (rec.uzum && typeof rec.uzum === "object" && !Array.isArray(rec.uzum)) {
    const uz = rec.uzum as Record<string, unknown>;
    if (uz.cart && typeof uz.cart === "object") return uz.cart;
  }
  return null;
}
