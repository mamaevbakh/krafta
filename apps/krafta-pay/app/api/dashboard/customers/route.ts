import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("orgId_required");
  }
  return value.trim();
}

/**
 * Customers for the dashboard index.
 *
 * A customer's value to a merchant is almost entirely "what are they paying
 * me", so the bare row is close to useless on its own. We fold each
 * customer's subscriptions in here rather than in the client, so the list can
 * show live/past-due counts and MRR without N+1 fetches per row.
 */
export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));
    const environment = url.searchParams.get("environment");

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "member",
    });

    const admin = createAdminSupabase();

    let customerQuery = admin
      .schema("payments")
      .from("customers")
      .select("id, email, phone, external_id, environment, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    // Test-mode customers must not bleed into a live list, and vice versa.
    if (environment === "test" || environment === "live") {
      customerQuery = customerQuery.eq("environment", environment);
    }

    const { data: customerRows, error: customersErr } = await customerQuery;
    if (customersErr) throw customersErr;

    const customers = (customerRows ?? []) as Array<Record<string, any>>;
    const customerIds = customers.map((row) => row.id).filter(Boolean);

    let subscriptions: Array<Record<string, any>> = [];
    if (customerIds.length > 0) {
      const { data: subRows, error: subsErr } = await admin
        .schema("payments")
        .from("subscriptions")
        .select(
          "id, customer_id, status, current_period_end, cancel_at_period_end, plans:plan_id(name, amount_minor, currency, interval, interval_count)",
        )
        .eq("org_id", orgId)
        .in("customer_id", customerIds);
      if (subsErr) throw subsErr;
      subscriptions = subRows ?? [];
    }

    const byCustomerId = new Map<string, Array<Record<string, any>>>();
    for (const sub of subscriptions) {
      const key = String(sub.customer_id ?? "");
      if (!key) continue;
      const list = byCustomerId.get(key) ?? [];
      list.push(sub);
      byCustomerId.set(key, list);
    }

    const enriched = customers.map((row) => {
      const subs = byCustomerId.get(String(row.id)) ?? [];

      // "Active" is what the merchant is actually being paid for. Trialing
      // counts as live for headcount but contributes nothing to MRR yet.
      const activeCount = subs.filter(
        (s) => s.status === "active" || s.status === "trialing",
      ).length;
      const attentionCount = subs.filter(
        (s) => s.status === "past_due" || s.status === "incomplete",
      ).length;

      // Normalised to a monthly figure so a yearly plan doesn't read as 12x a
      // monthly one in the same column. Mixed currencies are left unsummed —
      // adding UZS to USD would be a wrong number stated confidently.
      let mrrMinor = 0;
      let mrrCurrency: string | null = null;
      let mixedCurrency = false;
      for (const s of subs) {
        if (s.status !== "active") continue;
        const plan = s.plans as Record<string, any> | null;
        if (!plan?.amount_minor) continue;
        const currency = String(plan.currency ?? "UZS");
        if (mrrCurrency && currency !== mrrCurrency) {
          mixedCurrency = true;
          continue;
        }
        mrrCurrency = currency;
        const count = Number(plan.interval_count ?? 1) || 1;
        const interval = String(plan.interval ?? "month");
        const perMonth =
          interval === "year"
            ? Math.round(Number(plan.amount_minor) / (12 * count))
            : Math.round(Number(plan.amount_minor) / count);
        mrrMinor += perMonth;
      }

      return {
        ...row,
        subscription_count: subs.length,
        active_count: activeCount,
        attention_count: attentionCount,
        mrr_minor: mixedCurrency ? null : mrrMinor,
        mrr_currency: mixedCurrency ? null : mrrCurrency,
      };
    });

    return NextResponse.json({ customers: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : "customers_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
