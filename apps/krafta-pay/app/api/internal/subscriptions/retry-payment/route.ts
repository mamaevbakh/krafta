import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import { assertMemberOrThrow, resolveOwnedSubscription } from "@/lib/internal-subscription";
import {
  RETRYABLE_INVOICE_STATUSES,
  activateSubscriptionAfterCharge,
  createAtmosRecurringCharge,
  extractAtmosChargeProviderRefs,
  pickRetryTargetInvoice,
  writePaymentDebugLog,
} from "@krafta/payments-core";

/**
 * Manual retry for a subscription's currently-failed invoice, driven from the
 * Krafta dashboard. Covers BOTH cases the automatic renewal cron can't reach:
 *  - `incomplete` — the very first (signup) charge failed. chargeRenewal()
 *    refuses to run for anything but active/past_due, so a fresh subscription
 *    has no automatic recovery path at all.
 *  - `past_due`   — a later renewal charge failed and dunning is exhausted.
 *
 * Charges the customer's already-saved Atmos card (bound before the original
 * charge, so it survives a decline) against the SAME invoice/intent — never
 * creates a new one. Atmos-only for now; Uzum subscriptions aren't part of
 * Krafta's own billing.
 */
type RetryPaymentBody = {
  customerOrgId?: string;
  subscriptionId?: string;
  initiatedByUserId?: string;
};

const RETRYABLE_STATUSES = new Set(["incomplete", "past_due"]);

export async function POST(req: Request) {
  const supabase = createAdminSupabase();
  let paymentIntentId: string | null = null;
  let paymentAttemptId: string | null = null;

  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as RetryPaymentBody;
    const customerOrgId = body?.customerOrgId?.trim();
    const subscriptionId = body?.subscriptionId?.trim();
    if (!customerOrgId || !subscriptionId) {
      return NextResponse.json(
        { error: "customerOrgId and subscriptionId are required" },
        { status: 400 },
      );
    }

    await assertMemberOrThrow(supabase, {
      orgId: customerOrgId,
      userId: body.initiatedByUserId,
    });

    const sub = await resolveOwnedSubscription(supabase, { subscriptionId, customerOrgId });
    if (!sub) {
      return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
    }
    if (!RETRYABLE_STATUSES.has(sub.status ?? "")) {
      return NextResponse.json(
        { error: "subscription_not_retryable", status: sub.status },
        { status: 409 },
      );
    }

    // `past_due` (dunning exhausted) carries an `uncollectible` invoice, not an
    // `open` one — filtering to `open` alone returned no_open_invoice for the
    // exact state this route claims to recover. Accept both retryable statuses
    // and let finalizeInitialPayment flip it uncollectible→paid on success.
    const { data: candidateInvoices, error: invoiceErr } = await supabase
      .schema("payments")
      .from("invoices")
      .select("id, payment_intent_id, amount_due_minor, currency, status")
      .eq("subscription_id", sub.id)
      .in("status", RETRYABLE_INVOICE_STATUSES)
      .order("created_at", { ascending: false });
    if (invoiceErr) throw invoiceErr;
    const invoiceRow = pickRetryTargetInvoice(candidateInvoices ?? []);
    if (!invoiceRow?.payment_intent_id) {
      return NextResponse.json({ error: "no_open_invoice" }, { status: 409 });
    }
    const paymentIntentIdValue = String(invoiceRow.payment_intent_id);
    paymentIntentId = paymentIntentIdValue;

    const { data: intentRow, error: intentErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .select("id, amount_minor, order_id, status")
      .eq("id", paymentIntentIdValue)
      .maybeSingle();
    if (intentErr) throw intentErr;
    if (!intentRow) {
      return NextResponse.json({ error: "payment_intent_not_found" }, { status: 404 });
    }
    if (intentRow.status === "succeeded") {
      return NextResponse.json({ ok: true, status: "succeeded", paymentIntentStatus: "succeeded" });
    }
    if (intentRow.status !== "failed") {
      return NextResponse.json(
        { error: "payment_intent_not_retryable", paymentIntentStatus: intentRow.status },
        { status: 409 },
      );
    }

    if (!sub.default_payment_method_id) {
      return NextResponse.json({ error: "saved_binding_not_found" }, { status: 409 });
    }
    const { data: paymentMethod, error: paymentMethodErr } = await supabase
      .schema("payments")
      .from("payment_methods")
      .select("id, provider_id, provider_token, org_provider_account_id, status")
      .eq("id", sub.default_payment_method_id)
      .maybeSingle();
    if (paymentMethodErr) throw paymentMethodErr;
    if (!paymentMethod || paymentMethod.provider_id !== "atmos" || !paymentMethod.provider_token) {
      return NextResponse.json({ error: "saved_binding_not_found" }, { status: 409 });
    }

    const { data: attempt, error: attemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, org_provider_account_id")
      .eq("payment_intent_id", paymentIntentIdValue)
      .eq("provider_id", "atmos")
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    if (!attempt) {
      return NextResponse.json({ error: "payment_attempt_not_found" }, { status: 404 });
    }
    paymentAttemptId = attempt.id;

    const orgProviderAccountId =
      attempt.org_provider_account_id ?? paymentMethod.org_provider_account_id ?? null;
    if (!orgProviderAccountId) {
      return NextResponse.json({ error: "org_provider_account_missing" }, { status: 409 });
    }

    // Optimistic lock: only one retry (or the renewal cron) can move a
    // "failed" intent to "processing" at a time — blocks spam-click double-submit.
    const { data: locked, error: lockErr } = await supabase
      .schema("payments")
      .from("payment_intents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", paymentIntentIdValue)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (lockErr) throw lockErr;
    if (!locked) {
      return NextResponse.json(
        { error: "payment_intent_not_retryable", paymentIntentStatus: "processing" },
        { status: 409 },
      );
    }

    await writePaymentDebugLog(supabase, {
      scope: "subscription_retry",
      event: "manual_request",
      providerId: "atmos",
      paymentIntentId: paymentIntentIdValue,
      paymentAttemptId,
      data: { subscriptionId: sub.id, subscriptionStatus: sub.status },
    });

    const account = intentRow.order_id ? String(intentRow.order_id) : String(intentRow.id);
    const charge = await createAtmosRecurringCharge({
      supabase,
      orgProviderAccountId: String(orgProviderAccountId),
      providerToken: String(paymentMethod.provider_token),
      amountMinor: Number(intentRow.amount_minor),
      account,
    });

    await activateSubscriptionAfterCharge(supabase, {
      paymentIntentId: paymentIntentIdValue,
      providerId: "atmos",
      attemptId: String(attempt.id),
      chargeStatus: charge.status,
      providerPaymentId: charge.providerPaymentId,
      attemptRawResponse: {
        attemptKind: "atmos_manual_retry",
        providerRefs: extractAtmosChargeProviderRefs(charge.raw),
      },
      finalizePayload: { provider_id: "atmos", provider_payment_id: charge.providerPaymentId },
      failurePayload: { provider_id: "atmos", provider_payment_id: charge.providerPaymentId },
    });

    await writePaymentDebugLog(supabase, {
      scope: "subscription_retry",
      event: "manual_result",
      providerId: "atmos",
      paymentIntentId: paymentIntentIdValue,
      paymentAttemptId,
      level: charge.status === "failed" ? "warn" : "info",
      data: { chargeStatus: charge.status, providerPaymentId: charge.providerPaymentId },
    });

    return NextResponse.json({
      ok: true,
      status: charge.status,
      paymentIntentStatus: charge.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "retry_payment_failed";
    const status =
      message === "forbidden"
        ? 403
        : message.startsWith("missing_") ||
            message.startsWith("invalid_") ||
            message.startsWith("signature_")
          ? 401
          : 500;

    await writePaymentDebugLog(supabase, {
      scope: "subscription_retry",
      event: "manual_error",
      level: "error",
      providerId: "atmos",
      paymentIntentId,
      paymentAttemptId,
      data: { error: message },
    }).catch(() => {});

    if (status === 500) {
      console.error("internal subscription retry-payment failed", { message });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
