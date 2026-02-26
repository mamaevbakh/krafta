import { createClient } from "@/lib/supabase/server";

export type BillingEntitlement = {
  status: "active" | "grace" | "locked";
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  subscriptionId: string | null;
  planId: string | null;
  cancelAtPeriodEnd: boolean;
};

export async function getOrgBillingEntitlement(orgId: string): Promise<BillingEntitlement> {
  const supabase = await createClient();

  const { data: subscription, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, status, plan_id, cancel_at_period_end, current_period_end, created_at, customers!inner(customer_org_id)")
    .eq("customers.customer_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !subscription) {
    return {
      status: "locked",
      subscriptionStatus: null,
      currentPeriodEnd: null,
      subscriptionId: null,
      planId: null,
      cancelAtPeriodEnd: false,
    };
  }

  const subStatus = subscription.status ?? null;
  const periodEnd = subscription.current_period_end ?? null;
  const subscriptionId = subscription.id ?? null;
  const planId = subscription.plan_id ?? null;
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

  if (subStatus === "active") {
    return {
      status: "active",
      subscriptionStatus: subStatus,
      currentPeriodEnd: periodEnd,
      subscriptionId,
      planId,
      cancelAtPeriodEnd,
    };
  }

  if (subStatus === "canceled" && periodEnd && new Date(periodEnd) > new Date()) {
    return {
      status: "grace",
      subscriptionStatus: subStatus,
      currentPeriodEnd: periodEnd,
      subscriptionId,
      planId,
      cancelAtPeriodEnd,
    };
  }

  return {
    status: "locked",
    subscriptionStatus: subStatus,
    currentPeriodEnd: periodEnd,
    subscriptionId,
    planId,
    cancelAtPeriodEnd,
  };
}
