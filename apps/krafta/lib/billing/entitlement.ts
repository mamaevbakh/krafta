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
  /**
   * The catalog this subscription is scoped to, or null for a legacy org-wide sub
   * (covers every catalog under the org). Set on new per-catalog subscriptions.
   */
  catalogId: string | null;
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
  catalogId: null,
};

type ServiceClient = ReturnType<typeof createServiceClient>;

// Minimal subscription shape used for tier resolution.
type SubRow = {
  id: string | null;
  status: string | null;
  plan_id: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const SUB_SELECT =
  "id, status, plan_id, cancel_at_period_end, current_period_end, created_at, metadata, customers!inner(customer_org_id)";

/** The catalog a subscription is scoped to (metadata.catalog_id), or null = org-wide/legacy. */
function subCatalogId(sub: { metadata?: Record<string, unknown> | null } | null): string | null {
  const meta = sub?.metadata;
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).catalog_id;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Turn a chosen subscription row (or null) into an entitlement. Fails closed to Free. */
async function resolveEntitlement(
  supabase: ServiceClient,
  sub: SubRow | null,
): Promise<BillingEntitlement> {
  if (!sub) return FREE_ENTITLEMENT;

  const subStatus = (sub.status as string | null) ?? null;
  const periodEnd = (sub.current_period_end as string | null) ?? null;
  const subscriptionId = (sub.id as string | null) ?? null;
  const planId = (sub.plan_id as string | null) ?? null;
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  const catalogId = subCatalogId(sub);

  // Resolve the plan code (→ tier) with a direct lookup — kept separate from the
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
      catalogId,
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
      catalogId,
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
    catalogId,
  };
}

/**
 * getOrgBillingEntitlement — org-level entitlement (the org's latest subscription,
 * any catalog). Kept for callers without a catalog context. Under the per-catalog
 * model this reflects "does the org have ANY paid sub"; prefer
 * getCatalogBillingEntitlement wherever a catalog is in scope.
 *
 * Fails CLOSED to Free (never throws; a broken read must not grant paid features).
 */
async function _getOrgBillingEntitlement(orgId: string): Promise<BillingEntitlement> {
  if (!orgId) return FREE_ENTITLEMENT;

  let supabase: ServiceClient;
  try {
    supabase = createServiceClient();
  } catch {
    return FREE_ENTITLEMENT;
  }

  const { data: sub, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(SUB_SELECT)
    .eq("customers.customer_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return FREE_ENTITLEMENT;
  return resolveEntitlement(supabase, (sub as SubRow | null) ?? null);
}

/**
 * getCatalogBillingEntitlement — per-catalog entitlement. One org account (customer)
 * holds one subscription per catalog. Resolution order:
 *   1. the org's latest sub scoped to THIS catalog (metadata.catalog_id === catalogId)
 *   2. else the org's latest LEGACY org-wide sub (no catalog_id — covers all catalogs;
 *      this is what every pre-per-catalog sub, incl. grandfathered comps, resolves as)
 *   3. else Free
 *
 * Fails CLOSED to Free.
 */
async function _getCatalogBillingEntitlement(
  orgId: string,
  catalogId: string,
): Promise<BillingEntitlement> {
  if (!orgId || !catalogId) return FREE_ENTITLEMENT;

  let supabase: ServiceClient;
  try {
    supabase = createServiceClient();
  } catch {
    return FREE_ENTITLEMENT;
  }

  const { data: subs, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(SUB_SELECT)
    .eq("customers.customer_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !subs || subs.length === 0) return FREE_ENTITLEMENT;

  const rows = subs as SubRow[];
  const catalogSub = rows.find((s) => subCatalogId(s) === catalogId) ?? null;
  const legacySub = rows.find((s) => subCatalogId(s) === null) ?? null;

  return resolveEntitlement(supabase, catalogSub ?? legacySub);
}

export const getOrgBillingEntitlement = cache(_getOrgBillingEntitlement);
export const getCatalogBillingEntitlement = cache(_getCatalogBillingEntitlement);
