import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { type PlanTier, tierFromPlanCode } from "@/lib/billing/tiers";

/**
 * Access = the health of the merchant's paid subscription.
 *  - "active"   : paid subscription in good standing (may be set to cancel at period end)
 *  - "grace"    : canceled but still inside the paid period — full paid access remains
 *  - "past_due" : payment failed past the retry window — dropped to Free
 *  - "none"     : never subscribed / expired / incomplete — on Free
 */
export type BillingAccess = "active" | "grace" | "past_due" | "none";

export type BillingEntitlement = {
  /** The effective tier the merchant is entitled to right now. Free unless a paid sub is active/grace. */
  tier: PlanTier;
  /** Health of the paid subscription behind the tier. */
  access: BillingAccess;
  /**
   * Legacy tri-state kept for existing consumers (layout upgrade CTA, billing page).
   * active → "active", grace → "grace", everything-else → "locked".
   * NOTE: "locked" no longer means "no dashboard access" — a lapsed merchant is on Free.
   */
  status: "active" | "grace" | "locked";
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  subscriptionId: string | null;
  planId: string | null;
  planCode: string | null;
  cancelAtPeriodEnd: boolean;
};

const FREE_ENTITLEMENT: BillingEntitlement = {
  tier: "free",
  access: "none",
  status: "locked",
  subscriptionStatus: null,
  currentPeriodEnd: null,
  subscriptionId: null,
  planId: null,
  planCode: null,
  cancelAtPeriodEnd: false,
};

/**
 * getOrgBillingEntitlement — authoritative, service-role read of a merchant
 * org's subscription entitlement. Reads the latest subscription for the org,
 * resolves its plan code → tier, and fails CLOSED to Free (never throws to the
 * caller; a broken read must not silently grant paid features).
 *
 * Callers must have already authorized the requesting user for `orgId`
 * (dashboard routes resolve org by slug under an authed layout).
 */
export const getOrgBillingEntitlement = cache(
  _getOrgBillingEntitlement,
);

async function _getOrgBillingEntitlement(
  orgId: string,
): Promise<BillingEntitlement> {
  if (!orgId) return FREE_ENTITLEMENT;

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    // No service credentials in this environment — fail closed to Free.
    return FREE_ENTITLEMENT;
  }

  const { data: subscription, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(
      "id, status, plan_id, cancel_at_period_end, current_period_end, created_at, customers!inner(customer_org_id)",
    )
    .eq("customers.customer_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !subscription) {
    return FREE_ENTITLEMENT;
  }

  const subStatus = (subscription.status as string | null) ?? null;
  const periodEnd = (subscription.current_period_end as string | null) ?? null;
  const subscriptionId = (subscription.id as string | null) ?? null;
  const planId = (subscription.plan_id as string | null) ?? null;
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  // Resolve the plan code (→ tier) with a direct lookup. Kept separate from the
  // subscription select so an embed-relationship quirk can't silently null the tier.
  let planCode: string | null = null;
  if (planId) {
    const { data: plan } = await supabase
      .schema("payments")
      .from("plans")
      .select("code")
      .eq("id", planId)
      .maybeSingle();
    planCode = (plan?.code as string | null) ?? null;
  }

  const periodInFuture = Boolean(periodEnd && new Date(periodEnd) > new Date());
  const paidTier = tierFromPlanCode(planCode);

  // Active — good standing (a scheduled cancel is still active until period end).
  if (subStatus === "active" || subStatus === "trialing") {
    return {
      tier: paidTier,
      access: "active",
      status: "active",
      subscriptionStatus: subStatus,
      currentPeriodEnd: periodEnd,
      subscriptionId,
      planId,
      planCode,
      cancelAtPeriodEnd,
    };
  }

  // Canceled but still inside the paid window — keep full paid access (grace).
  if (subStatus === "canceled" && periodInFuture) {
    return {
      tier: paidTier,
      access: "grace",
      status: "grace",
      subscriptionStatus: subStatus,
      currentPeriodEnd: periodEnd,
      subscriptionId,
      planId,
      planCode,
      cancelAtPeriodEnd,
    };
  }

  // Everything else (past_due, unpaid, incomplete, incomplete_expired,
  // expired-canceled) → dropped to Free. Storefront stays live; paid features lock.
  return {
    tier: "free",
    access: subStatus === "past_due" || subStatus === "unpaid" ? "past_due" : "none",
    status: "locked",
    subscriptionStatus: subStatus,
    currentPeriodEnd: periodEnd,
    subscriptionId,
    planId,
    planCode,
    cancelAtPeriodEnd,
  };
}
