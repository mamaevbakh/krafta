/**
 * tiers.ts — the Krafta paid-plan tier model (v2, ratified 2026-07-09).
 *
 * Pure and DB-free so it can run anywhere (server gates, client badges, tests).
 * Tier is resolved from a Krafta Pay plan `code` — NOT from plan metadata (the
 * payments.plans.metadata CHECK only permits a `fiscalization` key). See
 * .agents/pricing-and-packaging.md for the packaging rationale.
 *
 * Packaging:
 *   Free      — storefront + menu + QR + basic Telegram + pickup/delivery-request/browse
 *   Pro       — + card payments (online), delivery zones/courier, all order modes, basic analytics
 *   Business  — + dine-in (exclusive), multi-venue, team roles, advanced analytics, priority, AI/loyalty (as they ship)
 */

export type PlanTier = "free" | "pro" | "business";

export const TIER_ORDER: readonly PlanTier[] = ["free", "pro", "business"] as const;

const TIER_RANK: Record<PlanTier, number> = { free: 0, pro: 1, business: 2 };

/**
 * Known Krafta plan codes → tier. Any active *paid* subscription on an unknown
 * code resolves to the lowest paid tier (`pro`) so we never accidentally grant
 * Business, but never strand a paying merchant on Free either.
 */
const PLAN_CODE_TIER: Record<string, PlanTier> = {
  free: "free",
  pro: "pro",
  "pro-monthly": "pro",
  "pro-yearly": "pro",
  "pro-annual": "pro",
  business: "business",
  "business-monthly": "business",
  "business-yearly": "business",
  "business-annual": "business",
};

export function tierFromPlanCode(code: string | null | undefined): PlanTier {
  if (!code) return "free";
  const normalized = code.trim().toLowerCase();
  const known = PLAN_CODE_TIER[normalized];
  if (known) return known;
  // Defensive prefix match for future variants (e.g. "business-2026").
  if (normalized.startsWith("business")) return "business";
  if (normalized.startsWith("pro")) return "pro";
  if (normalized.startsWith("free")) return "free";
  // Unknown, but it IS a paid subscription → lowest paid tier, not Business.
  return "pro";
}

/**
 * Features that gate by tier. Only features that are actually shipped and
 * meaningfully gate today are enforced; "as they ship" Business features
 * (AI assistant, loyalty) are listed so gates exist the moment they land.
 */
export type GatedFeature =
  | "card_payments"
  | "delivery"
  | "all_order_modes"
  | "basic_analytics"
  | "dine_in"
  | "multi_venue"
  | "team_roles"
  | "advanced_analytics"
  | "ai_assistant"
  | "loyalty";

export const FEATURE_MIN_TIER: Record<GatedFeature, PlanTier> = {
  // Pro
  card_payments: "pro",
  delivery: "pro",
  all_order_modes: "pro",
  basic_analytics: "pro",
  // Business
  dine_in: "business",
  multi_venue: "business",
  team_roles: "business",
  advanced_analytics: "business",
  ai_assistant: "business",
  loyalty: "business",
};

export function tierAtLeast(tier: PlanTier, min: PlanTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

export function minTierFor(feature: GatedFeature): PlanTier {
  return FEATURE_MIN_TIER[feature];
}

/** The gate: does `tier` unlock `feature`? */
export function can(tier: PlanTier, feature: GatedFeature): boolean {
  return tierAtLeast(tier, FEATURE_MIN_TIER[feature]);
}

export function tierLabel(tier: PlanTier): string {
  switch (tier) {
    case "free":
      return "Free";
    case "pro":
      return "Pro";
    case "business":
      return "Business";
  }
}
