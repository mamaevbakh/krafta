import { createClient } from "@/lib/supabase/server";

export type BillingEntitlement = {
  status: "active" | "grace" | "locked";
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
};

export async function getOrgBillingEntitlement(orgId: string): Promise<BillingEntitlement> {
  const supabase = await createClient();

  const { data: subscription, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("status, current_period_end, created_at, customers!inner(customer_org_id)")
    .eq("customers.customer_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !subscription) {
    return {
      status: "locked",
      subscriptionStatus: null,
      currentPeriodEnd: null,
    };
  }

  const subStatus = subscription.status ?? null;
  const periodEnd = subscription.current_period_end ?? null;

  if (subStatus === "active") {
    return { status: "active", subscriptionStatus: subStatus, currentPeriodEnd: periodEnd };
  }

  if (subStatus === "canceled" && periodEnd && new Date(periodEnd) > new Date()) {
    return { status: "grace", subscriptionStatus: subStatus, currentPeriodEnd: periodEnd };
  }

  return {
    status: "locked",
    subscriptionStatus: subStatus,
    currentPeriodEnd: periodEnd,
  };
}
