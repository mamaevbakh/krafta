import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayEnvironment } from "./subscription";

/**
 * platform-billing.ts — the layer where Krafta Pay bills its own merchants.
 *
 * Krafta Pay is BYOA: for an ordinary subscription the merchant's own Atmos or
 * Uzum contract collects the money and none of it flows through us. Platform
 * fees are the exact opposite — WE collect them, through OUR Atmos account,
 * FROM the merchant. Conflating the two is the main way this goes wrong, so
 * every function in this file is about the second case only.
 *
 * Nothing here is a second billing engine. A platform fee is an ordinary
 * `payments.subscriptions` row on the platform org, charged by the same
 * `chargeRenewal` that charges everyone else, so the existing dunning schedule
 * (3/7/14 days), recovery links and outbound webhooks apply with no new code.
 * This file supplies only the three things the generic engine cannot know:
 * what the plans cost, how much volume the merchant put through, and how those
 * two become invoice lines.
 */

/** The payee. Krafta Pay's own organization, which owns the Atmos contract. */
export const PLATFORM_ORG_SLUG = "krafta-studio";

/**
 * Plan-code prefix that marks a plan as a platform fee.
 *
 * Platform-fee subscriptions live on the SAME org that bills catalog merchants
 * for the Krafta app (10 active Business subscriptions in production today). A
 * separate platform org would be cleaner, but it would need its own Atmos
 * contract — not worth it for v1. So the two are distinguished by this prefix
 * plus `metadata.kind = "platform_fee"`, and every report filters on it.
 */
export const PLATFORM_PLAN_CODE_PREFIX = "platform-";

/** The discriminator written onto every platform-fee subscription. */
export const PLATFORM_SUBSCRIPTION_KIND = "platform_fee";

/**
 * Which Atmos account collects platform fees, by environment.
 *
 * Production runs `live` — the platform org's live Atmos account. The dev
 * branch has no live Atmos account for the platform org, so dev sets this to
 * `test` and binds against the test account instead.
 *
 * Note this is a DIFFERENT axis from the environment metering filters on. What
 * we bill for is always live merchant volume (see `computePlatformUsage`);
 * this only decides which acquirer of ours takes the payment.
 */
export function platformBillingEnvironment(): PayEnvironment {
  return process.env.KRAFTA_PLATFORM_BILLING_ENV === "test" ? "test" : "live";
}

export type PlatformPlanDefinition = {
  code: string;
  name: string;
  /** Flat monthly fee, UZS minor units (major x 100). */
  amountMinor: number;
  /** Usage fee on successful live charge volume, in basis points. */
  usageRateBps: number;
  /** Monthly ceiling on the usage fee, UZS minor units. null = uncapped. */
  usageCapMinor: number | null;
  /** Entitlements. Declared here; enforcement is out of scope for v1. */
  features: Record<string, boolean>;
};

/**
 * The three tiers, priced natively in UZS. Pricing is decided — do not redesign
 * it here.
 *
 *   Start     0 UZS      + 1.0%  capped at 2,500,000 UZS/mo
 *   Growth    600,000    + 0.6%  uncapped
 *   Scale     2,500,000  + 0.4%  uncapped
 *
 * There is deliberately no currency conversion anywhere in this file. These are
 * the prices, in the currency merchants are actually charged in and in round
 * numbers a merchant can hold in their head — not a converted figure carrying
 * the fingerprints of some rate on some day. A rate held in config would be a
 * second thing that can drift, and a platform fee that moves between two months
 * because a rate moved destroys trust in the invoice.
 *
 * The Start cap is set EQUAL to Scale's monthly fee, deliberately. It means a
 * merchant on the free tier can never pay more than the top tier's base, and the
 * moment they approach the cap the upgrade argument makes itself: the same money
 * buys the lower 0.4% rate and the Growth feature set.
 *
 * Re-pricing is a deliberate act: edit these numbers, mirror them into
 * supabase/migrations/20260804121000_pay_seed_platform_plans.sql, re-run that
 * seed, and subscribers re-price at their next period boundary — the same rule
 * as a plan change, since there is no proration in this repo.
 *
 * MINOR UNITS: major x 100, UZS included. 600,000 UZS is 60,000,000. Writing the
 * major number here would create a plan for one hundredth of its price, which
 * has already happened once in this repo (the production `pro` plan sits at
 * 200000 = 2,000 UZS).
 *
 * Growth is the tier that unlocks hosted checkout, coupons and analytics. The
 * `features` map exists so gating has somewhere to read from; this file does
 * not enforce it and neither does the billing engine.
 */
export const PLATFORM_PLANS: PlatformPlanDefinition[] = [
  {
    code: "platform-start",
    name: "Start",
    amountMinor: 0,
    usageRateBps: 100,
    // Equal to Scale's monthly fee — see the note above.
    usageCapMinor: 250_000_000, // 2,500,000 UZS
    features: {
      hosted_checkout: false,
      coupons: false,
      analytics: false,
    },
  },
  {
    code: "platform-growth",
    name: "Growth",
    amountMinor: 60_000_000, // 600,000 UZS
    usageRateBps: 60,
    usageCapMinor: null,
    features: {
      hosted_checkout: true,
      coupons: true,
      analytics: true,
    },
  },
  {
    code: "platform-scale",
    name: "Scale",
    amountMinor: 250_000_000, // 2,500,000 UZS
    usageRateBps: 40,
    usageCapMinor: null,
    features: {
      hosted_checkout: true,
      coupons: true,
      analytics: true,
    },
  },
];

export const PLATFORM_PLAN_CURRENCY = "UZS";

/** The plan every merchant starts on. */
export const PLATFORM_DEFAULT_PLAN_CODE = "platform-start";

export function getPlatformPlanDefinition(code: string): PlatformPlanDefinition | null {
  return PLATFORM_PLANS.find((plan) => plan.code === code) ?? null;
}

/** The plan's flat monthly fee, in UZS minor units. */
export function platformPlanAmountMinor(plan: PlatformPlanDefinition): number {
  return plan.amountMinor;
}

/** The plan's monthly usage ceiling, in UZS minor units. null = uncapped. */
export function platformPlanCapMinor(plan: PlatformPlanDefinition): number | null {
  return plan.usageCapMinor;
}

/**
 * The metadata blob written onto a platform plan row, so a plan read back from
 * the database carries everything the billing math needs without this file
 * having to re-derive it from the code.
 */
export function platformPlanMetadata(plan: PlatformPlanDefinition) {
  return {
    kind: PLATFORM_SUBSCRIPTION_KIND,
    usage_rate_bps: plan.usageRateBps,
    usage_cap_minor: plan.usageCapMinor,
  };
}

export type PlatformPlanPricing = {
  usageRateBps: number;
  usageCapMinor: number | null;
};

/**
 * Read the usage terms off a plan row.
 *
 * Prefers the row's own metadata (what the merchant actually signed up to) and
 * falls back to the code definition only when the row predates it. A plan
 * re-rated in the database must bill at the database's numbers, not the file's.
 */
export function platformPricingFromPlanRow(plan: {
  code?: string | null;
  metadata?: unknown;
}): PlatformPlanPricing {
  const metadata =
    plan.metadata && typeof plan.metadata === "object" && !Array.isArray(plan.metadata)
      ? (plan.metadata as Record<string, unknown>)
      : {};

  const rateFromRow = metadata.usage_rate_bps;
  const capFromRow = metadata.usage_cap_minor;

  const definition = plan.code ? getPlatformPlanDefinition(plan.code) : null;

  const usageRateBps =
    typeof rateFromRow === "number" && Number.isFinite(rateFromRow)
      ? rateFromRow
      : (definition?.usageRateBps ?? 0);

  const usageCapMinor =
    typeof capFromRow === "number" && Number.isFinite(capFromRow)
      ? capFromRow
      : capFromRow === null
        ? null
        : definition
          ? platformPlanCapMinor(definition)
          : null;

  return { usageRateBps, usageCapMinor };
}

/** True when this subscription is Krafta Pay billing a merchant, not a merchant billing a customer. */
export function isPlatformFeeSubscription(input: {
  subscriptionMetadata?: unknown;
  planCode?: string | null;
}): boolean {
  const metadata =
    input.subscriptionMetadata &&
    typeof input.subscriptionMetadata === "object" &&
    !Array.isArray(input.subscriptionMetadata)
      ? (input.subscriptionMetadata as Record<string, unknown>)
      : {};

  if (metadata.kind === PLATFORM_SUBSCRIPTION_KIND) return true;
  return typeof input.planCode === "string" && input.planCode.startsWith(PLATFORM_PLAN_CODE_PREFIX);
}

export type PlatformBillingExemption = {
  orgId: string;
  reason: string;
  createdAt: string | null;
};

/**
 * Is this organization exempt from platform fees?
 *
 * Checked in three places, deliberately redundantly: before provisioning a
 * platform subscription, before rendering the merchant's billing page, and
 * again inside the charge path. Redundancy is the point — an exemption that
 * only guards the entry point does nothing for an org that was already
 * provisioned before it was granted, and the failure mode here is charging
 * someone's real card.
 *
 * Returns null when the org is billable. Any row means exempt; the `reason` is
 * for humans reading the table, not a rule the code branches on.
 */
export async function getPlatformBillingExemption(
  supabase: SupabaseClient,
  orgId: string,
): Promise<PlatformBillingExemption | null> {
  const { data, error } = await supabase
    .schema("payments")
    .from("platform_billing_exemptions")
    .select("org_id, reason, created_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    orgId: String(data.org_id),
    reason: String(data.reason ?? "exempt"),
    createdAt: (data.created_at as string | null) ?? null,
  };
}

export async function isPlatformBillingExempt(
  supabase: SupabaseClient,
  orgId: string,
): Promise<boolean> {
  return (await getPlatformBillingExemption(supabase, orgId)) !== null;
}

export type PlatformUsage = {
  /** Successful live charge volume for the period, in minor units. */
  baseMinor: number;
  /** How many charges that volume came from — the merchant's reconciliation handle. */
  successfulCharges: number;
};

/**
 * Meter one merchant's billable volume for a closed period.
 *
 * The billable base is successful LIVE charge volume. Two filters carry all the
 * risk:
 *
 *   - `status = 'succeeded'` — we bill on money that actually moved.
 *   - `environment = 'live'` — a merchant's sandbox testing is not revenue.
 *     Dropping this filter invoices merchants for their own integration work.
 *
 * The amount lives on `payment_intents`; `payment_attempts` has no amount
 * column, so metering attempts is not merely wrong, it is impossible.
 *
 * Half-open interval [start, end) so two adjacent periods can never both claim
 * the same charge.
 */
export async function computePlatformUsage(
  supabase: SupabaseClient,
  params: {
    merchantOrgId: string;
    periodStart: Date | string;
    periodEnd: Date | string;
  },
): Promise<PlatformUsage> {
  const startIso =
    params.periodStart instanceof Date ? params.periodStart.toISOString() : params.periodStart;
  const endIso =
    params.periodEnd instanceof Date ? params.periodEnd.toISOString() : params.periodEnd;

  const { data, error } = await supabase
    .schema("payments")
    .from("payment_intents")
    .select("amount_minor")
    .eq("org_id", params.merchantOrgId)
    .eq("status", "succeeded")
    .eq("environment", "live")
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (error) throw error;

  const rows = data ?? [];
  let baseMinor = 0;
  for (const row of rows) {
    const amount = Number((row as { amount_minor?: unknown }).amount_minor ?? 0);
    if (Number.isFinite(amount)) baseMinor += amount;
  }

  return { baseMinor, successfulCharges: rows.length };
}

/**
 * Usage fee = min(round(volume x rate), cap).
 *
 * The cap is the entire reason a merchant can sit on Start with real volume and
 * not be surprised: at 1.0% it binds the moment monthly volume passes the
 * $200-equivalent.
 */
export function computeUsageFeeMinor(
  baseMinor: number,
  pricing: PlatformPlanPricing,
): { feeMinor: number; capped: boolean } {
  const uncapped = Math.round((baseMinor * pricing.usageRateBps) / 10_000);
  if (pricing.usageCapMinor === null) {
    return { feeMinor: uncapped, capped: false };
  }
  const feeMinor = Math.min(uncapped, pricing.usageCapMinor);
  return { feeMinor, capped: feeMinor < uncapped };
}

export type PlatformInvoiceLine = {
  kind: "base" | "usage";
  description: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

function formatUzsMajor(amountMinor: number): string {
  return Math.round(amountMinor / 100).toLocaleString("en-US");
}

/**
 * Turn a plan + a metered period into the invoice's lines.
 *
 * The base line covers the period being OPENED (billed in advance, which is
 * what the engine's `current_period_start`/`current_period_end` already mean).
 * The usage line covers the period that just CLOSED (billed in arrears, because
 * you cannot meter a month before it happens). Both period ranges are written
 * into the line metadata so the invoice is self-describing and the merchant is
 * never left guessing which month a number refers to.
 */
export function buildPlatformInvoiceLines(params: {
  planName: string;
  planAmountMinor: number;
  pricing: PlatformPlanPricing;
  usage: PlatformUsage;
  /** Period being opened by this invoice (the base fee's period). */
  servicePeriodStartIso: string;
  servicePeriodEndIso: string;
  /** Period that just closed (the usage fee's period). */
  usagePeriodStartIso: string;
  usagePeriodEndIso: string;
}): PlatformInvoiceLine[] {
  // NOTE on `description`: it is the audit record — the sentence as we computed
  // it at close, in English, frozen. It is deliberately NOT what the dashboard
  // renders: the invoice detail page rebuilds the same sentence from `kind` plus
  // this metadata in the merchant's own language, so a Russian-speaking merchant
  // does not read an English line inside a Russian invoice. Both come from the
  // same frozen numbers, so they can never disagree.
  const lines: PlatformInvoiceLine[] = [];
  const { feeMinor, capped } = computeUsageFeeMinor(params.usage.baseMinor, params.pricing);

  lines.push({
    kind: "base",
    description: `${params.planName} plan — monthly`,
    quantity: 1,
    unitAmountMinor: params.planAmountMinor,
    amountMinor: params.planAmountMinor,
    sortOrder: 0,
    metadata: {
      plan_name: params.planName,
      period_start: params.servicePeriodStartIso,
      period_end: params.servicePeriodEndIso,
    },
  });

  const ratePercent = params.pricing.usageRateBps / 100;
  lines.push({
    kind: "usage",
    description:
      `Usage — ${ratePercent}% of ${formatUzsMajor(params.usage.baseMinor)} UZS processed ` +
      `(${params.usage.successfulCharges} ${params.usage.successfulCharges === 1 ? "charge" : "charges"})` +
      (capped ? " — capped" : ""),
    quantity: 1,
    unitAmountMinor: feeMinor,
    amountMinor: feeMinor,
    sortOrder: 1,
    // THE SNAPSHOT. Everything needed to explain this number a year from now,
    // frozen at close. Never recomputed — a late webhook that adds one more
    // succeeded intent must not move a figure the merchant already paid.
    metadata: {
      base_minor: params.usage.baseMinor,
      successful_charges: params.usage.successfulCharges,
      rate_bps: params.pricing.usageRateBps,
      cap_minor: params.pricing.usageCapMinor,
      capped,
      usage_period_start: params.usagePeriodStartIso,
      usage_period_end: params.usagePeriodEndIso,
    },
  });

  return lines;
}

export function sumLineItems(lines: Array<{ amountMinor: number }>): number {
  return lines.reduce((total, line) => total + line.amountMinor, 0);
}

/**
 * Persist an invoice's lines.
 *
 * `ignoreDuplicates` on the (invoice_id, kind) unique index: a re-entered period
 * close must not double the itemisation under an unchanged invoice total.
 */
export async function insertInvoiceLineItems(
  supabase: SupabaseClient,
  invoiceId: string,
  lines: PlatformInvoiceLine[],
): Promise<void> {
  if (lines.length === 0) return;
  const { error } = await supabase
    .schema("payments")
    .from("invoice_line_items")
    .upsert(
      lines.map((line) => ({
        invoice_id: invoiceId,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unit_amount_minor: line.unitAmountMinor,
        amount_minor: line.amountMinor,
        sort_order: line.sortOrder,
        metadata: line.metadata,
      })),
      { onConflict: "invoice_id,kind", ignoreDuplicates: true },
    );
  if (error) throw error;
}
