import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getPaymentIntentStatuses } from "./pay-internal";
import { catalogCan, orgCan } from "@/lib/billing/gate";

/**
 * settings.ts — server-only access to commerce.org_payment_settings, the
 * non-secret mirror of a merchant's Krafta Pay (Atmos) connection.
 *
 * The storefront is anonymous, so the card-checkout gate reads this via a
 * service-role client (trusted server work, bypasses RLS). No secret ever
 * lives here — the encrypted Atmos credentials stay in Krafta Pay.
 */

function createServiceClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("missing_supabase_service_credentials");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type OrgPaymentSettings = {
  provider: string;
  environment: string;
  isActive: boolean;
  accountLabel: string | null;
  storeId: string | null;
  verified: boolean;
  connectedAt: string;
};

/** Full connection state for the dashboard (service-role read). */
export async function getOrgPaymentSettings(
  orgId: string,
): Promise<OrgPaymentSettings | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .schema("commerce")
    .from("org_payment_settings")
    .select(
      "provider, environment, is_active, account_label, store_id, verified, connected_at",
    )
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    provider: data.provider,
    environment: data.environment,
    isActive: data.is_active,
    accountLabel: data.account_label,
    storeId: data.store_id,
    verified: data.verified,
    connectedAt: data.connected_at,
  };
}

/**
 * Storefront gate: is card checkout available for this org right now?
 * A connected + active Krafta Pay (Atmos) account. Fails closed (false) on any
 * read error so a Krafta Pay hiccup never blocks the (cash) checkout path.
 */
export async function getOrgCardPaymentEnabled(orgId: string): Promise<boolean> {
  try {
    const settings = await getOrgPaymentSettings(orgId);
    if (!settings?.isActive) return false;
    // Card acceptance is a Pro-tier feature. A connected-but-downgraded org
    // falls back to cash-only until they upgrade.
    return await orgCan(orgId, "card_payments");
  } catch {
    return false;
  }
}

/**
 * Per-catalog storefront card gate. The Atmos account is connected once per org
 * (org_payment_settings), but whether a given catalog may OFFER card is a
 * per-catalog Pro+ entitlement — so Shop A (Pro) shows card while sibling Shop B
 * (Free) stays cash-only, even though they share the org's connected account.
 * Fails closed (false) on any error.
 */
export async function getCatalogCardPaymentEnabled(
  orgId: string,
  catalogId: string,
): Promise<boolean> {
  try {
    const settings = await getOrgPaymentSettings(orgId);
    if (!settings?.isActive) return false;
    return await catalogCan(orgId, catalogId, "card_payments");
  } catch {
    return false;
  }
}

/**
 * Mark an order's Krafta Pay payment completed once the charge has settled.
 * Idempotent: only flips a still-`pending` krafta_pay row → `completed`, so a
 * duplicate return hit or a later reconcile pass is a no-op.
 */
export async function markOrderCardPaymentCompleted(
  orderId: string,
): Promise<{ completed: boolean }> {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .schema("commerce")
    .from("order_payments")
    .update({ status: "completed", completed_at: nowIso })
    .eq("order_id", orderId)
    .eq("source_type", "krafta_pay")
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  return { completed: (data?.length ?? 0) > 0 };
}

export type OrderCardConfirmation = "completed" | "pending" | "failed" | "none";

/**
 * Confirm an order's card payment against Krafta Pay and settle the local
 * mirror. Reads the order's payment-intent id, asks Krafta Pay for its status
 * (signed internal endpoint), and flips the order_payments row to 'completed'
 * when the charge succeeded. Idempotent + safe to call from the customer's
 * return route AND a merchant-dashboard reconcile pass.
 */
export async function confirmOrderCardPayment(
  orderId: string,
): Promise<OrderCardConfirmation> {
  const supabase = createServiceClient();
  const { data: payment, error } = await supabase
    .schema("commerce")
    .from("order_payments")
    .select("status, krafta_pay_payment_intent_id")
    .eq("order_id", orderId)
    .eq("source_type", "krafta_pay")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment || !payment.krafta_pay_payment_intent_id) return "none";
  if (payment.status === "completed") return "completed";

  const statuses = await getPaymentIntentStatuses([
    payment.krafta_pay_payment_intent_id,
  ]);
  const intentStatus = statuses[payment.krafta_pay_payment_intent_id];

  if (intentStatus === "succeeded") {
    await markOrderCardPaymentCompleted(orderId);
    return "completed";
  }
  if (intentStatus === "failed" || intentStatus === "canceled") {
    return "failed";
  }
  return "pending";
}
