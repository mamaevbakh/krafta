import "server-only";

import {
  getCatalogBillingEntitlement,
  getOrgBillingEntitlement,
} from "@/lib/billing/entitlement";
import {
  type GatedFeature,
  type PlanTier,
  can,
  minTierFor,
} from "@/lib/billing/tiers";

/**
 * gate.ts — the server-side entitlement gate. Feature code (settings actions,
 * storefront serve paths, create-venue) calls these to decide whether an org
 * may use a tier-gated capability. Always fails CLOSED (getOrgBillingEntitlement
 * returns Free on any error).
 */

export async function getOrgTier(orgId: string): Promise<PlanTier> {
  const entitlement = await getOrgBillingEntitlement(orgId);
  return entitlement.tier;
}

export async function orgCan(
  orgId: string,
  feature: GatedFeature,
): Promise<boolean> {
  const tier = await getOrgTier(orgId);
  return can(tier, feature);
}

export type FeatureGate = {
  allowed: boolean;
  tier: PlanTier;
  minTier: PlanTier;
  feature: GatedFeature;
};

/** Resolve the tier once and report whether `feature` is unlocked. */
export async function checkOrgFeature(
  orgId: string,
  feature: GatedFeature,
): Promise<FeatureGate> {
  const tier = await getOrgTier(orgId);
  return {
    allowed: can(tier, feature),
    tier,
    minTier: minTierFor(feature),
    feature,
  };
}

/**
 * Throwing guard for server actions / route handlers. Throws a stable,
 * catchable error string when the org can't use the feature.
 */
export async function assertOrgFeature(
  orgId: string,
  feature: GatedFeature,
): Promise<void> {
  if (!(await orgCan(orgId, feature))) {
    throw new Error(`feature_locked:${feature}`);
  }
}

// ── Per-catalog gates ────────────────────────────────────────────────────────
// One org account holds one subscription per catalog. These resolve the tier for
// a SPECIFIC catalog (its own sub, falling back to a legacy org-wide sub) so Shop A
// on Business unlocks dine-in while sibling Shop B on Free stays gated.

export async function getCatalogTier(
  orgId: string,
  catalogId: string,
): Promise<PlanTier> {
  const entitlement = await getCatalogBillingEntitlement(orgId, catalogId);
  return entitlement.tier;
}

export async function catalogCan(
  orgId: string,
  catalogId: string,
  feature: GatedFeature,
): Promise<boolean> {
  const tier = await getCatalogTier(orgId, catalogId);
  return can(tier, feature);
}

export async function checkCatalogFeature(
  orgId: string,
  catalogId: string,
  feature: GatedFeature,
): Promise<FeatureGate> {
  const tier = await getCatalogTier(orgId, catalogId);
  return {
    allowed: can(tier, feature),
    tier,
    minTier: minTierFor(feature),
    feature,
  };
}

export async function assertCatalogFeature(
  orgId: string,
  catalogId: string,
  feature: GatedFeature,
): Promise<void> {
  if (!(await catalogCan(orgId, catalogId, feature))) {
    throw new Error(`feature_locked:${feature}`);
  }
}
