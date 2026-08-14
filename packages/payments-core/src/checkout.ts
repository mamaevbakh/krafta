import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultPayEnvironment, type PayEnvironment } from "./subscription";
import crypto from "crypto";
import {
  assertNonNegativeAmount,
  getCheckoutSessionByPublicToken,
  getPaymentIntentById,
} from "./db";
import { SETTLED_INTENT_STATUSES } from "./webhook";
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

// How long a provider-hosted redirect URL stays worth replaying.
//
// Uzum registers each order with `sessionTimeoutSecs`, whose documented range is
// 600-1800 and which we always send at the 1800 maximum — 30 minutes is their
// ceiling, not a default we could raise. Once it lapses the paymentRedirectUrl
// renders "payment expired", so replaying a stored URL past that point can only
// ever dead-end the customer. The margin covers clock skew between us and the
// provider plus the time the customer spends on their page after we hand it over.
const REDIRECT_URL_TTL_MS = 30 * 60 * 1000;
const REDIRECT_URL_REUSE_MARGIN_MS = 2 * 60 * 1000;
const REDIRECT_URL_REUSE_WINDOW_MS = REDIRECT_URL_TTL_MS - REDIRECT_URL_REUSE_MARGIN_MS;

export async function createCheckoutSession(
  supabase: SupabaseClient,
  input: CreateCheckoutSessionInput,
  payBaseUrl: string, // e.g. https://pay.krafta.uz
): Promise<CreateCheckoutSessionResult> {
  assertNonNegativeAmount(input.amountMinor);

  // Fixed at creation, like a subscription checkout. Without it a payment link
  // made in test mode is written as live and resolves the live acquirer.
  const environment: PayEnvironment = input.environment ?? defaultPayEnvironment();

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
      environment,
      // Absent means `required`, the safe direction: a flow that forgets to say
      // gets a card binding, which is what every subscription and card update
      // needs. Only a route that cannot create a subscription may pass "none".
      card_binding: input.cardBinding ?? "required",
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (intentErr) throw intentErr;

  // (optional) 2) customer record
  let customerId: string | null = input.customerId ?? null;
  if (
    !customerId &&
    (input.customer?.name ||
      input.customer?.email ||
      input.customer?.phone ||
      input.customer?.customerUserRef)
  ) {
    const { data: customer, error: custErr } = await supabase
      .schema("payments")
      .from("customers")
      .insert({
        org_id: input.orgId,
        environment,
        name: input.customer.name ?? null,
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
      environment,
      customer_id: customerId,
      // Only meaningful when nobody was named. A caller who passed a customer
      // has already answered the question this setting exists to ask.
      customer_creation: customerId ? "if_required" : (input.customerCreation ?? "if_required"),
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

  // Never start a second payment for money that has already moved.
  //
  // The session being `open` is not enough on its own. A provider's callback
  // can arrive late — the customer pays, lands back on our page, and for the
  // seconds or minutes until we hear back the intent still reads
  // `requires_payment_method` while the session is still `open`. In that window
  // the pay page offers "back to checkout", and every provider adapter below
  // will happily register a brand-new order. The customer pays twice, and the
  // second charge is one WE created, so "it happened on the provider's page" is
  // no defence.
  //
  // This sits above createProviderAttempt deliberately: it is the same rule for
  // Uzum, for Atmos, and for Payme/Click/Octo when they arrive. A provider
  // adapter cannot opt out of it or reimplement it differently.
  //
  // `processing` counts as settled here. It means we are waiting on the
  // provider's answer, and "we have not heard back" must not read as "nothing
  // happened" — that is precisely the case this exists to stop.
  const intentForGuard = await getPaymentIntentById(supabase, session.payment_intent_id);
  const intentStatus = String((intentForGuard as any)?.status ?? "").toLowerCase();
  if (SETTLED_INTENT_STATUSES.has(intentStatus)) {
    throw new Error("payment_intent_already_settled");
  }

  // Idempotency: if this checkout session already selected the same provider and the attempt is still usable,
  // just return the existing checkout_url instead of creating a new provider order.
  const selectedProviderId = (session as any).selected_provider_id as string | null | undefined;
  const selectedAttemptId = (session as any).selected_attempt_id as string | null | undefined;
  if (selectedProviderId === input.providerId && selectedAttemptId) {
    const { data: existingAttempt, error: existingAttemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, checkout_url, status, created_at")
      .eq("id", selectedAttemptId)
      .maybeSingle();

    if (existingAttemptErr) throw existingAttemptErr;

    const status = (existingAttempt as any)?.status as string | undefined;
    const checkoutUrl = (existingAttempt as any)?.checkout_url as string | null | undefined;
    const createdAt = (existingAttempt as any)?.created_at as string | undefined;
    const reusableStatuses = new Set(["initialized", "requires_action", "processing"]);
    const ageMs = createdAt
      ? Date.now() - new Date(createdAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (
      existingAttempt &&
      checkoutUrl &&
      status &&
      reusableStatuses.has(status) &&
      ageMs < REDIRECT_URL_REUSE_WINDOW_MS
    ) {
      // Reuse only fires for redirect providers in Phase 0 (checkout_url present).
      // Inline (Atmos) re-selection reuse lands with the adapter in Phase 1.
      return { attemptId: existingAttempt.id, mode: "redirect", redirectUrl: checkoutUrl };
    }

    // Past the window the stored URL is a corpse — the provider's own page will
    // tell the customer the payment expired. Fall through and register a fresh
    // order rather than handing back the dead one.
    //
    // The stale attempt is deliberately left in `requires_action` and not
    // canceled: if a late callback still arrives for that order, the webhook's
    // binding-setup check has to recognise it and persist the binding.
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
    environment,
    paymentIntentId: session.payment_intent_id,
    paymentAttemptId: attempt.id,
    payBaseUrl,
    publicToken: input.publicToken,
    viewType: input.viewType,
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

  if (updErr) {
    // If the provider returns the same provider_payment_id for repeated init calls
    // (e.g. Uzum orderId reused for the same orderNumber), the DB unique constraint will reject
    // writing it on a newly-created attempt. In that case, reuse the already-existing attempt.
    const message = (updErr as any)?.message as string | undefined;
    const code = (updErr as any)?.code as string | undefined;
    const isUniqueViolation = code === "23505" || (message?.includes("duplicate key") ?? false);

    if (isUniqueViolation && providerResult.providerPaymentId) {
      const { data: existing, error: existingErr } = await supabase
        .schema("payments")
        .from("payment_attempts")
        .select("id, checkout_url")
        .eq("provider_id", input.providerId)
        .eq("provider_payment_id", providerResult.providerPaymentId)
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (existingErr) throw existingErr;
      if (existing?.checkout_url) {
        await supabase
          .schema("payments")
          .from("checkout_sessions")
          .update({
            selected_provider_id: input.providerId,
            selected_attempt_id: existing.id,
          })
          .eq("id", session.id);

        // Prefer the URL the provider minted moments ago in this very call. The
        // one stored on the existing attempt is by definition older, and is the
        // likely reason we are here at all — returning it would send the
        // customer straight back to the expired page.
        return {
          attemptId: existing.id,
          mode: "redirect",
          redirectUrl: providerResult.redirectUrl ?? existing.checkout_url,
        };
      }
    }

    throw updErr;
  }

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
    mode: providerResult.mode ?? "redirect",
    redirectUrl: providerResult.redirectUrl,
  };
}
