import { randomBytes } from "crypto";
import { resolveOwnedSubscription } from "@/lib/internal-subscription";

/**
 * card-setup.ts — a zero-amount "SetupIntent" for changing the card on an
 * existing subscription. It mints a payment_intent (amount 0, metadata.purpose
 * = "card_update") + checkout_session so the standard pay.krafta.uz Atmos card
 * form can bind a NEW card. The Atmos apply route recognizes the card_update
 * purpose and, instead of charging, sets the freshly-bound card as the
 * subscription's renewal default (see the apply route's card_update branch).
 *
 * No money moves. The subscription's org is the payee (it owns the Atmos
 * account), exactly as in the original subscribe flow.
 */

function randomToken(bytes = 18) {
  return randomBytes(bytes).toString("base64url");
}

export type CardSetupResult =
  | { ok: true; publicToken: string; payUrl: string; paymentIntentId: string }
  | { ok: false; error: "subscription_not_found" | "pay_base_url_missing" };

export async function createCardSetupSession(
  supabase: any,
  input: {
    subscriptionId: string;
    // Main-app path: prove ownership via the merchant-app org id.
    customerOrgId?: string | null;
    // Customer-portal path: the session already binds a concrete customer, so
    // ownership is proven by (org_id, customer_id) directly.
    customerId?: string | null;
    merchantOrgId?: string | null;
    payBaseUrl: string;
    returnUrl?: string | null;
  },
): Promise<CardSetupResult> {
  const payBaseUrl = input.payBaseUrl?.replace(/\/+$/, "");
  if (!payBaseUrl) return { ok: false, error: "pay_base_url_missing" };

  let sub:
    | { id: string; org_id: string; customer_id: string; plan_id: string | null }
    | null = null;
  if (input.customerId && input.merchantOrgId) {
    const { data, error } = await supabase
      .schema("payments")
      .from("subscriptions")
      .select("id, org_id, customer_id, plan_id")
      .eq("id", input.subscriptionId)
      .eq("org_id", input.merchantOrgId)
      .eq("customer_id", input.customerId)
      .maybeSingle();
    if (error) throw error;
    sub = data;
  } else if (input.customerOrgId) {
    sub = await resolveOwnedSubscription(supabase, {
      subscriptionId: input.subscriptionId,
      customerOrgId: input.customerOrgId,
    });
  }
  if (!sub) return { ok: false, error: "subscription_not_found" };

  // Currency for the (zero-amount) intent — mirror the plan's, default UZS.
  let currency = "UZS";
  if (sub.plan_id) {
    const { data: plan } = await supabase
      .schema("payments")
      .from("plans")
      .select("currency")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (plan?.currency) currency = String(plan.currency);
  }

  const returnUrl = input.returnUrl ?? null;
  const publicToken = randomToken(18);
  const clientSecret = randomToken(24);

  const cardUpdateMetadata = {
    purpose: "card_update" as const,
    subscription_id: sub.id,
    customer_id: sub.customer_id,
    customer_org_id: input.customerOrgId ?? null,
    merchant_org_id: sub.org_id,
  };

  const { data: intent, error: intentErr } = await supabase
    .schema("payments")
    .from("payment_intents")
    .insert({
      org_id: sub.org_id,
      amount_minor: 0,
      currency,
      description: "Update card on file",
      status: "requires_action",
      client_secret: clientSecret,
      return_url: returnUrl,
      metadata: cardUpdateMetadata,
    })
    .select("id")
    .single();
  if (intentErr) throw intentErr;

  const { error: sessionErr } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .insert({
      org_id: sub.org_id,
      payment_intent_id: intent.id,
      customer_id: sub.customer_id,
      public_token: publicToken,
      status: "open",
      success_url: returnUrl,
      cancel_url: returnUrl,
      return_url: returnUrl,
      metadata: cardUpdateMetadata,
    })
    .select("id")
    .single();
  if (sessionErr) throw sessionErr;

  return {
    ok: true,
    publicToken,
    paymentIntentId: intent.id,
    payUrl: `${payBaseUrl}/pay/${publicToken}`,
  };
}
