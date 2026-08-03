import type { SupabaseClient } from "@supabase/supabase-js";
import { V1Error } from "@/lib/v1";

/**
 * Shared shaping + ownership resolution for the public subscriptions API.
 *
 * The tenancy rule: a subscription is only visible to the key whose org owns it
 * AND whose environment matches. Both filters, always — an org filter alone
 * would let a test key read live subscriptions.
 */

export type SubscriptionRecord = {
  id: string;
  org_id: string;
  status: string;
  environment: string;
  customer_id: string;
  plan_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  default_payment_method_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const SUBSCRIPTION_COLUMNS =
  "id, org_id, status, environment, customer_id, plan_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, default_payment_method_id, metadata, created_at";

export function serializeSubscription(
  row: SubscriptionRecord,
  extras: {
    plan?: Record<string, unknown> | null;
    customer?: Record<string, unknown> | null;
  } = {},
) {
  return {
    id: row.id,
    object: "subscription",
    status: row.status,
    livemode: row.environment === "live",
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at,
    created: row.created_at,
    customer: extras.customer ?? { id: row.customer_id },
    plan: extras.plan ?? { id: row.plan_id },
    metadata: row.metadata ?? {},
  };
}

export async function loadOwnedSubscription(
  supabase: SupabaseClient,
  params: { subscriptionId: string; merchantOrgId: string; environment: "test" | "live" },
): Promise<SubscriptionRecord> {
  const { data, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("id", params.subscriptionId)
    .eq("org_id", params.merchantOrgId)
    .eq("environment", params.environment)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // Deliberately does not distinguish "does not exist" from "belongs to
    // someone else" — that difference is an enumeration oracle.
    throw new V1Error(
      "resource_missing",
      404,
      `No subscription with id \`${params.subscriptionId}\`.`,
    );
  }
  return data as SubscriptionRecord;
}

/** Load plan + customer for a batch of subscriptions in two queries, not 2N. */
export async function hydrateSubscriptions(
  supabase: SupabaseClient,
  rows: SubscriptionRecord[],
) {
  if (rows.length === 0) return [] as ReturnType<typeof serializeSubscription>[];

  const planIds = Array.from(new Set(rows.map((row) => row.plan_id).filter(Boolean)));
  const customerIds = Array.from(new Set(rows.map((row) => row.customer_id).filter(Boolean)));

  const [{ data: plans }, { data: customers }] = await Promise.all([
    supabase
      .schema("payments")
      .from("plans")
      .select("id, code, name, amount_minor, currency, interval, interval_count")
      .in("id", planIds.length > 0 ? planIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .schema("payments")
      .from("customers")
      .select("id, external_id, email, phone")
      .in("id", customerIds.length > 0 ? customerIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const planById = new Map(
    (plans ?? []).map((plan) => [
      (plan as { id: string }).id,
      {
        id: (plan as { id: string }).id,
        code: (plan as { code?: string }).code ?? null,
        name: (plan as { name?: string }).name ?? null,
        amountMinor: (plan as { amount_minor?: number }).amount_minor ?? null,
        currency: (plan as { currency?: string }).currency ?? null,
        interval: (plan as { interval?: string }).interval ?? null,
        intervalCount: (plan as { interval_count?: number }).interval_count ?? null,
      },
    ]),
  );

  const customerById = new Map(
    (customers ?? []).map((customer) => [
      (customer as { id: string }).id,
      {
        id: (customer as { id: string }).id,
        externalId: (customer as { external_id?: string | null }).external_id ?? null,
        email: (customer as { email?: string | null }).email ?? null,
        phone: (customer as { phone?: string | null }).phone ?? null,
      },
    ]),
  );

  return rows.map((row) =>
    serializeSubscription(row, {
      plan: planById.get(row.plan_id) ?? { id: row.plan_id },
      customer: customerById.get(row.customer_id) ?? { id: row.customer_id },
    }),
  );
}
