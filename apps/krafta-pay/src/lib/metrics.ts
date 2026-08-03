import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Billing metrics for the merchant dashboard.
 *
 * The headline number here is RECOVERED REVENUE, not MRR. That is a product
 * decision, not a layout one.
 *
 * A merchant technical enough to integrate our API in an afternoon is also
 * technical enough to call Atmos' recurring endpoint directly in a week. What
 * they cannot build in a week is the dunning state machine, the retry schedule,
 * the reconciliation of charges that settled but never got written back, and
 * the recovery of a subscription whose card died. MRR they already know from
 * their own database. "We got back 2.3M UZS you would otherwise have lost this
 * month" is the number that justifies the bill — so it goes first.
 */

export type BillingMetrics = {
  environment: "test" | "live";
  currency: string;
  /** Sum of successful recurring charges, normalized to a monthly figure. */
  mrrMinor: number;
  activeSubscribers: number;
  pastDueSubscribers: number;
  /** Subscribers who canceled in the window, over subscribers at its start. */
  churnRatePercent: number | null;
  recovery: {
    /**
     * Money collected on invoices that had already failed at least once. Would
     * have been lost without dunning.
     */
    recoveredMinor: number;
    recoveredCount: number;
    /** Invoices that failed at least once and are still unpaid. */
    stillFailingCount: number;
    /** recovered / (recovered + still failing). null when nothing failed. */
    recoveryRatePercent: number | null;
  };
  windowDays: number;
};

type PlanRow = {
  id: string;
  amount_minor: number;
  currency: string;
  interval: string;
  interval_count: number;
};

/**
 * Normalize a plan's price to a per-month figure so quarterly and annual plans
 * do not distort MRR. Approximate by design — MRR is a trend line, not an
 * accounting statement, and a merchant comparing it against a ledger is using
 * the wrong number.
 */
function monthlyAmountMinor(plan: PlanRow): number {
  const count = Math.max(1, plan.interval_count ?? 1);
  const amount = plan.amount_minor ?? 0;

  switch (plan.interval) {
    case "year":
      return Math.round(amount / (12 * count));
    case "week":
      return Math.round((amount * 52) / (12 * count));
    case "day":
      return Math.round((amount * 365) / (12 * count));
    case "month":
    default:
      return Math.round(amount / count);
  }
}

export async function loadBillingMetrics(
  admin: SupabaseClient,
  params: { orgId: string; environment: "test" | "live"; windowDays?: number },
): Promise<BillingMetrics> {
  const windowDays = params.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: subscriptions }, { data: plans }, { data: invoices }] = await Promise.all([
    admin
      .schema("payments")
      .from("subscriptions")
      .select("id, status, plan_id, canceled_at, created_at")
      .eq("org_id", params.orgId)
      .eq("environment", params.environment),
    admin
      .schema("payments")
      .from("plans")
      .select("id, amount_minor, currency, interval, interval_count")
      .eq("org_id", params.orgId),
    // attempt_count > 1 means the invoice needed more than one try — the
    // population dunning exists to rescue.
    admin
      .schema("payments")
      .from("invoices")
      .select("id, amount_due_minor, currency, status, attempt_count, paid_at, created_at")
      .eq("org_id", params.orgId)
      .gte("created_at", since)
      .gt("attempt_count", 1),
  ]);

  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan as PlanRow]));
  const currency = (plans ?? [])[0]?.currency ?? "UZS";

  const subs = subscriptions ?? [];
  const activeSubscribers = subs.filter(
    (sub) => sub.status === "active" || sub.status === "trialing",
  ).length;
  const pastDueSubscribers = subs.filter(
    (sub) => sub.status === "past_due" || sub.status === "unpaid",
  ).length;

  const mrrMinor = subs
    .filter((sub) => sub.status === "active" || sub.status === "trialing")
    .reduce((total, sub) => {
      const plan = planById.get(sub.plan_id);
      return plan ? total + monthlyAmountMinor(plan) : total;
    }, 0);

  const canceledInWindow = subs.filter(
    (sub) => sub.canceled_at && sub.canceled_at >= since,
  ).length;
  // Denominator is everyone who was billable at the start of the window:
  // still-active today, plus those who left during it.
  const atRiskAtWindowStart = activeSubscribers + pastDueSubscribers + canceledInWindow;
  const churnRatePercent =
    atRiskAtWindowStart > 0
      ? Number(((canceledInWindow / atRiskAtWindowStart) * 100).toFixed(1))
      : null;

  const retriedInvoices = invoices ?? [];
  const recovered = retriedInvoices.filter((invoice) => invoice.status === "paid");
  const stillFailing = retriedInvoices.filter(
    (invoice) => invoice.status === "open" || invoice.status === "uncollectible",
  );
  const recoveredMinor = recovered.reduce(
    (total, invoice) => total + (invoice.amount_due_minor ?? 0),
    0,
  );
  const decided = recovered.length + stillFailing.length;

  return {
    environment: params.environment,
    currency,
    mrrMinor,
    activeSubscribers,
    pastDueSubscribers,
    churnRatePercent,
    recovery: {
      recoveredMinor,
      recoveredCount: recovered.length,
      stillFailingCount: stillFailing.length,
      recoveryRatePercent:
        decided > 0 ? Number(((recovered.length / decided) * 100).toFixed(1)) : null,
    },
    windowDays,
  };
}
