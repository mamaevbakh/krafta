import "server-only";

import { getOrgBillingEntitlement } from "@/lib/billing/entitlement";
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
