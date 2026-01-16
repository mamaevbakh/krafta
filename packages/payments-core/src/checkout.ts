import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  assertNonNegativeAmount,
  getCheckoutSessionByPublicToken,
} from "./db";
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
  SelectProviderInput,
  SelectProviderResult,
} from "./types";
import { createProviderAttempt } from "./providers";

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

export async function createCheckoutSession(
  supabase: SupabaseClient,
  input: CreateCheckoutSessionInput,
  payBaseUrl: string, // e.g. https://pay.krafta.uz
): Promise<CreateCheckoutSessionResult> {
  assertNonNegativeAmount(input.amountMinor);

  const publicToken = randomToken(18);
  const clientSecret = randomToken(24);

  // 1) payment_intent
  const { data: intent, error: intentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .insert({
      org_id: input.orgId,
      amount_minor: input.amountMinor,
      currency: input.currency,
      description: input.description ?? null,
      order_id: input.orderId ?? null,
      return_url: input.returnUrl ?? input.successUrl ?? null,
      client_secret: clientSecret,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (intentErr) throw intentErr;

  // (optional) 2) customer record (for now create only if data provided)
  let customerId: string | null = null;
  if (input.customer?.email || input.customer?.phone || input.customer?.customerUserRef) {
    const { data: customer, error: custErr } = await supabase
      .schema("payments")
      .from("customers")
      .insert({
        org_id: input.orgId,
        email: input.customer.email ?? null,
        phone: input.customer.phone ?? null,
        customer_user_ref: input.customer.customerUserRef ?? null,
        metadata: {},
      })
      .select("id")
      .single();

    if (custErr) throw custErr;
    customerId = customer.id;
  }

  // 3) checkout_session
  const { data: session, error: sessErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .insert({
      org_id: input.orgId,
      payment_intent_id: intent.id,
      status: "open",
      success_url: input.successUrl ?? null,
      cancel_url: input.cancelUrl ?? null,
      return_url: input.returnUrl ?? null,
      public_token: publicToken,
      customer_id: customerId,
      metadata: input.metadata ?? {},
    })
    .select("id, public_token, payment_intent_id")
    .single();

  if (sessErr) throw sessErr;

  return {
    checkoutSessionId: session.id,
    paymentIntentId: session.payment_intent_id,
    publicToken: session.public_token,
    payUrl: `${payBaseUrl.replace(/\/+$/, "")}/pay/${session.public_token}`,
  };
}

export async function selectProviderCreateAttempt(
  supabase: SupabaseClient,
  input: SelectProviderInput,
  environment: "test" | "live",
  payBaseUrl: string, // used for return/webhook urls
): Promise<SelectProviderResult> {
  const session = await getCheckoutSessionByPublicToken(supabase, input.publicToken);

  if (session.status !== "open") {
    throw new Error("checkout_session_not_open");
  }

  // Find org_provider_account for that org+provider+env
  const { data: opa, error: opaErr } = await supabase
    .schema("payments")
    .from("org_provider_accounts")
    .select("id, org_id, provider_id, environment, status")
    .eq("org_id", session.org_id)
    .eq("provider_id", input.providerId)
    .eq("environment", environment)
    .eq("status", "active")
    .maybeSingle();

  if (opaErr) throw opaErr;
  if (!opa) throw new Error("provider_not_configured");

  // Create attempt row first (status initialized)
  const { data: attempt, error: attErr } = await supabase
    .schema("payments")
    .from("payment_attempts")
    .insert({
      payment_intent_id: session.payment_intent_id,
      provider_id: input.providerId,
      org_provider_account_id: opa.id,
      status: "initialized",
      raw_init_response: {},
    })
    .select("*")
    .single();

  if (attErr) throw attErr;

  // Call provider adapter to get redirect URL (MVP)
  const providerResult = await createProviderAttempt({
    supabase,
    providerId: input.providerId,
    orgProviderAccountId: opa.id,
    paymentIntentId: session.payment_intent_id,
    paymentAttemptId: attempt.id,
    payBaseUrl,
    publicToken: input.publicToken,
  });

  // Persist provider result on attempt and on session
  const { error: updErr } = await supabase
    .schema("payments")
    .from("payment_attempts")
    .update({
      checkout_url: providerResult.redirectUrl ?? null,
      provider_payment_id: providerResult.providerPaymentId ?? null,
      raw_init_response: providerResult.raw ?? {},
      status: providerResult.status ?? "requires_action",
    })
    .eq("id", attempt.id);

  if (updErr) throw updErr;

  const { error: sessUpdErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .update({
      selected_provider_id: input.providerId,
      selected_attempt_id: attempt.id,
    })
    .eq("id", session.id);

  if (sessUpdErr) throw sessUpdErr;

  return {
    attemptId: attempt.id,
    redirectUrl: providerResult.redirectUrl,
  };
}
