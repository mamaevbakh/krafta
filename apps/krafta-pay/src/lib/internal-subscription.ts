/**
 * internal-subscription.ts — shared authorization + audit for the first-party
 * subscription-lifecycle endpoints (cancel/resume/change-plan/change-card) the
 * Krafta dashboard drives over the internal HMAC channel.
 *
 * The critical invariant: a caller may only act on a subscription that belongs
 * to a customer whose `customer_org_id` matches the `customerOrgId` they signed
 * for. Never trust the subscriptionId alone.
 */

export type OwnedSubscription = {
  id: string;
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  plan_id: string | null;
  org_id: string;
  customer_id: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Resolve a subscription only if it is owned by `customerOrgId` (the subscriber
 * org). Returns null when it doesn't exist or belongs to someone else — callers
 * map that to a 404 and never leak which case it was.
 */
export async function resolveOwnedSubscription(
  supabase: any,
  input: { subscriptionId: string; customerOrgId: string },
): Promise<OwnedSubscription | null> {
  const { data, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select(
      "id, status, cancel_at_period_end, current_period_end, plan_id, org_id, customer_id, metadata, customers!inner(customer_org_id)",
    )
    .eq("id", input.subscriptionId)
    .eq("customers.customer_org_id", input.customerOrgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    status: (data.status as string | null) ?? null,
    cancel_at_period_end: Boolean(data.cancel_at_period_end),
    current_period_end: (data.current_period_end as string | null) ?? null,
    plan_id: (data.plan_id as string | null) ?? null,
    org_id: data.org_id as string,
    customer_id: data.customer_id as string,
    metadata:
      data.metadata && typeof data.metadata === "object"
        ? (data.metadata as Record<string, unknown>)
        : null,
  };
}

/**
 * Optional defense-in-depth: when the dashboard passes the acting user, verify
 * they are a member of the subscriber org. The internal HMAC secret already
 * authenticates the caller; this narrows to org-scoped intent.
 */
export async function assertMemberOrThrow(
  supabase: any,
  input: { orgId: string; userId: string | null | undefined },
): Promise<void> {
  if (!input.userId) return;
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("forbidden");
}

export function summarizeSubscription(sub: OwnedSubscription) {
  return {
    subscriptionId: sub.id,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: sub.current_period_end,
    planId: sub.plan_id,
  };
}
