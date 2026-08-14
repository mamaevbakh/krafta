import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getDashboardEnvironment } from "@/lib/dashboard-env";
import { requireOrgAccess } from "@/lib/org-access";
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
      .select("id, name, email, phone, external_id, environment, created_at")
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

/** Trim, drop blanks, and cap — a stored blank string renders as a nameless row
 *  the merchant cannot tell apart from a missing one. */
function cleanField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

/** Deliberately permissive. A merchant typing their own customer's address is
 *  not an attacker, and a regex strict enough to reject a real Uzbek mailbox
 *  costs more than the typo it catches. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Add a customer by hand.
 *
 * Until now a customer only existed once a payment created one, so a merchant
 * could rename the people who had already paid but could not write down the
 * ones who had not. Galaktika signs a student up in person on Monday and takes
 * the money on Friday; between those two days the student did not exist in
 * Krafta Pay at all.
 *
 * ENVIRONMENT COMES FROM THE COOKIE, NOT THE BODY. The merchant is already
 * standing in test or live — the sidebar switch says which — and a second
 * control could only ever disagree with it. Identity is scoped
 * (org, environment, external_id), so getting this wrong would file a live
 * customer under test and hide them from the list they were just added to.
 *
 * NAME IS REQUIRED HERE, unlike the public API. The point of this dialog is to
 * write down who someone is; a row with no name is the exact problem it exists
 * to fix. The API keeps taking nameless customers because a Telegram bot
 * genuinely may not know one.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const orgSlug = url.searchParams.get("orgSlug");
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }

  // 404 rather than 403 for a slug this user cannot reach — a 403 would confirm
  // the organisation exists, which is an enumeration oracle over the merchant
  // list.
  const org = await requireOrgAccess(orgSlug);
  const environment = await getDashboardEnvironment();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = cleanField(body.name, 200);
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const email = cleanField(body.email, 320);
  if (email && !EMAIL_SHAPE.test(email)) {
    return NextResponse.json({ error: "email_invalid" }, { status: 400 });
  }

  const phone = cleanField(body.phone, 40);
  const externalId = cleanField(body.externalId, 200);

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .schema("payments")
    .from("customers")
    .insert({
      org_id: org.orgId,
      environment,
      name,
      email,
      phone,
      external_id: externalId,
      metadata: {},
    })
    .select("id, name, email, phone, external_id, environment, created_at")
    .single();

  if (error) {
    // The partial unique index on (org_id, environment, external_id). The
    // merchant reused an id they already have — a specific, fixable mistake,
    // so it must not surface as a generic failure.
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate_external_id" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Returned already shaped like a list row so the page can show the customer
  // without a second round trip. The zero counts are not an optimistic guess:
  // a customer created one statement ago cannot have a subscription.
  return NextResponse.json({
    customer: {
      ...data,
      subscription_count: 0,
      active_count: 0,
      attention_count: 0,
      mrr_minor: null,
      mrr_currency: null,
    },
  });
}
