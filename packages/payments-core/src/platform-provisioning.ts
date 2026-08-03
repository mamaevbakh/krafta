import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PLATFORM_DEFAULT_PLAN_CODE,
  PLATFORM_ORG_SLUG,
  PLATFORM_PLANS,
  PLATFORM_PLAN_CURRENCY,
  PLATFORM_SUBSCRIPTION_KIND,
  getPlatformPlanDefinition,
  isPlatformBillingExempt,
  platformBillingEnvironment,
  platformPlanAmountMinor,
  platformPlanMetadata,
} from "./platform-billing";
import { resolveOrCreateCustomer } from "./subscription";

/**
 * platform-provisioning.ts — getting a merchant onto a platform-fee plan.
 *
 * Deliberately separate from platform-billing.ts, which stays pure math and
 * metering. This file is the only place that writes the plan, customer and
 * subscription rows, so there is exactly one answer to "how does a merchant end
 * up billable".
 */

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export async function resolvePlatformOrgId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", PLATFORM_ORG_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("platform_org_not_found");
  return data.id as string;
}

/**
 * The Atmos account that collects platform fees.
 *
 * This is OUR acquirer, not the merchant's. A saved card attached for platform
 * billing must carry this account id on `payment_methods.org_provider_account_id`
 * — the merchant is acting as a customer here, and the money lands with us.
 * Getting this backwards would bind the merchant's card to their own Atmos
 * contract and then try to charge them through it.
 */
export async function resolvePlatformAtmosAccountId(
  supabase: SupabaseClient,
  platformOrgId?: string,
): Promise<string> {
  const orgId = platformOrgId ?? (await resolvePlatformOrgId(supabase));
  const environment = platformBillingEnvironment();

  const { data, error } = await supabase
    .schema("payments")
    .from("org_provider_accounts")
    .select("id")
    .eq("org_id", orgId)
    .eq("provider_id", "atmos")
    .eq("environment", environment)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("platform_atmos_account_not_found");
  return data.id as string;
}

export type EnsurePlatformPlansResult = {
  planIdsByCode: Record<string, string>;
  created: string[];
  updated: string[];
};

/**
 * Create (or re-rate) the three platform plans on the platform org.
 *
 * Idempotent on (org_id, code). Re-running after a rate change updates the
 * amount and the usage terms on the plan row; subscribers are NOT re-priced
 * mid-period — the engine reads the plan at each period close, so a re-rated
 * plan takes effect at the next boundary, which is the same rule as a plan
 * change.
 */
export async function ensurePlatformPlans(
  supabase: SupabaseClient,
  platformOrgId?: string,
): Promise<EnsurePlatformPlansResult> {
  const orgId = platformOrgId ?? (await resolvePlatformOrgId(supabase));
  const planIdsByCode: Record<string, string> = {};
  const created: string[] = [];
  const updated: string[] = [];

  for (const definition of PLATFORM_PLANS) {
    const amountMinor = platformPlanAmountMinor(definition);
    const metadata = platformPlanMetadata(definition);

    const { data: existing, error: existingErr } = await supabase
      .schema("payments")
      .from("plans")
      .select("id, amount_minor, metadata, features, name, is_active")
      .eq("org_id", orgId)
      .eq("code", definition.code)
      .maybeSingle();
    if (existingErr) throw existingErr;

    if (existing?.id) {
      const { error: updateErr } = await supabase
        .schema("payments")
        .from("plans")
        .update({
          name: definition.name,
          amount_minor: amountMinor,
          currency: PLATFORM_PLAN_CURRENCY,
          interval: "month",
          interval_count: 1,
          is_active: true,
          features: definition.features,
          metadata: {
            ...(existing.metadata && typeof existing.metadata === "object"
              ? (existing.metadata as Record<string, unknown>)
              : {}),
            ...metadata,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
      planIdsByCode[definition.code] = existing.id as string;
      updated.push(definition.code);
      continue;
    }

    const { data: inserted, error: insertErr } = await supabase
      .schema("payments")
      .from("plans")
      .insert({
        org_id: orgId,
        code: definition.code,
        name: definition.name,
        // major x 100, UZS included. platformPlanAmountMinor is the ONLY place
        // this conversion happens — see the invariant note there.
        amount_minor: amountMinor,
        currency: PLATFORM_PLAN_CURRENCY,
        interval: "month",
        interval_count: 1,
        trial_days: 0,
        is_active: true,
        features: definition.features,
        metadata,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;
    planIdsByCode[definition.code] = inserted.id as string;
    created.push(definition.code);
  }

  return { planIdsByCode, created, updated };
}

export type PlatformSubscriptionRecord = {
  subscriptionId: string;
  customerId: string;
  planId: string;
  planCode: string;
  created: boolean;
};

/**
 * Find-or-create the platform-fee subscription for one merchant org.
 *
 * The merchant appears as a `payments.customers` row under the PLATFORM org,
 * keyed by `external_id` = their organization uuid. That is what
 * `computePlatformFeeForClose` reads back to know whose volume to meter.
 *
 * Refuses to bill the platform org itself. Without that guard krafta-studio
 * would appear in its own merchant loop, meter its own volume, and invoice
 * itself in a cycle.
 */
export async function ensurePlatformSubscription(
  supabase: SupabaseClient,
  input: {
    merchantOrgId: string;
    planCode?: string;
    now?: Date;
  },
): Promise<PlatformSubscriptionRecord> {
  const platformOrgId = await resolvePlatformOrgId(supabase);
  if (input.merchantOrgId === platformOrgId) {
    throw new Error("cannot_bill_platform_org");
  }

  // Exempt orgs are never provisioned at all — no customer row, no
  // subscription, nothing for the renewal cron to find. Refusing here rather
  // than provisioning-then-skipping means an exemption cannot be undone by
  // accident: there is no dormant subscription waiting to start charging if the
  // guard downstream is ever removed.
  if (await isPlatformBillingExempt(supabase, input.merchantOrgId)) {
    throw new Error("org_billing_exempt");
  }

  const planCode = input.planCode ?? PLATFORM_DEFAULT_PLAN_CODE;
  if (!getPlatformPlanDefinition(planCode)) {
    throw new Error("unknown_platform_plan");
  }

  const environment = platformBillingEnvironment();
  const now = input.now ?? new Date();

  const { planIdsByCode } = await ensurePlatformPlans(supabase, platformOrgId);
  const planId = planIdsByCode[planCode];
  if (!planId) throw new Error("platform_plan_not_found");

  const { customerId } = await resolveOrCreateCustomer(supabase, {
    merchantOrgId: platformOrgId,
    environment,
    // external_id ONLY, deliberately — never customer_org_id.
    //
    // The platform org already bills catalog merchants for the Krafta app, and
    // those customer rows carry `customer_org_id`, which is unique per
    // (org_id, customer_org_id). Setting it here would either collide with that
    // row (23505) or, if we reused it, merge two unrelated billing
    // relationships onto one customer. The platform-fee customer is its own
    // row, keyed by the merchant's organization uuid in `external_id` — which
    // is also what the metering path reads back.
    externalId: input.merchantOrgId,
  });

  const { data: existing, error: existingErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, plan_id, status")
    .eq("org_id", platformOrgId)
    .eq("customer_id", customerId)
    .contains("metadata", { kind: PLATFORM_SUBSCRIPTION_KIND })
    .not("status", "in", "(canceled,incomplete_expired)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing?.id) {
    return {
      subscriptionId: existing.id as string,
      customerId,
      planId: existing.plan_id as string,
      planCode,
      created: false,
    };
  }

  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .insert({
      org_id: platformOrgId,
      customer_id: customerId,
      plan_id: planId,
      // Active from the start. There is no signup charge to clear: the base fee
      // for the first period is billed at the FIRST period close, alongside
      // that period's metered usage. (`trial_days` is decorative in this repo —
      // it is written to metadata and never read — so it is not used here.)
      status: "active",
      environment,
      current_period_start: now.toISOString(),
      current_period_end: addMonths(now, 1).toISOString(),
      metadata: {
        kind: PLATFORM_SUBSCRIPTION_KIND,
        merchant_org_id: input.merchantOrgId,
        billing_anchor: now.toISOString(),
      },
    })
    .select("id")
    .single();
  if (subscriptionErr) throw subscriptionErr;

  return {
    subscriptionId: subscription.id as string,
    customerId,
    planId,
    planCode,
    created: true,
  };
}

/**
 * Read a merchant's platform-fee subscription with everything the billing page
 * needs, or null if they have never been provisioned.
 */
export async function getPlatformSubscription(
  supabase: SupabaseClient,
  merchantOrgId: string,
): Promise<{
  subscription: Record<string, unknown>;
  plan: Record<string, unknown>;
  customerId: string;
} | null> {
  const platformOrgId = await resolvePlatformOrgId(supabase);
  if (merchantOrgId === platformOrgId) return null;

  const environment = platformBillingEnvironment();

  const { data: customer, error: customerErr } = await supabase
    .schema("payments")
    .from("customers")
    .select("id")
    .eq("org_id", platformOrgId)
    .eq("environment", environment)
    .eq("external_id", merchantOrgId)
    .maybeSingle();
  if (customerErr) throw customerErr;
  if (!customer?.id) return null;

  const { data: subscription, error: subscriptionErr } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(
      "id, status, plan_id, customer_id, default_payment_method_id, current_period_start, current_period_end, cancel_at_period_end, metadata, created_at",
    )
    .eq("org_id", platformOrgId)
    .eq("customer_id", customer.id)
    .contains("metadata", { kind: PLATFORM_SUBSCRIPTION_KIND })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionErr) throw subscriptionErr;
  if (!subscription?.id) return null;

  const { data: plan, error: planErr } = await supabase
    .schema("payments")
    .from("plans")
    .select("id, code, name, amount_minor, currency, interval, interval_count, features, metadata")
    .eq("id", subscription.plan_id)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) throw new Error("platform_plan_not_found");

  return {
    subscription: subscription as Record<string, unknown>,
    plan: plan as Record<string, unknown>,
    customerId: customer.id as string,
  };
}
