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

export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "member",
    });

    const admin = createAdminSupabase();
    const adminAny = admin as any;
    const { data, error } = await admin
      .schema("payments")
      .from("subscriptions")
      .select(
        "id, status, cancel_at_period_end, canceled_at, current_period_start, current_period_end, created_at, updated_at, plan_id, customer_id, default_payment_method_id, plans:plan_id(id, name, code, amount_minor, currency), customers:customer_id(email, phone)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const subscriptions = (data ?? []) as Array<Record<string, any>>;
    const subscriptionIds = subscriptions.map((row) => row.id).filter(Boolean);

    let invoices: Array<Record<string, any>> = [];
    let attempts: Array<Record<string, any>> = [];
    let openSessions: Array<Record<string, any>> = [];
    if (subscriptionIds.length > 0) {
      const { data: invoiceRows, error: invoicesErr } = await adminAny
        .schema("payments")
        .from("invoices")
        .select(
          "id, subscription_id, status, amount_due_minor, currency, due_at, paid_at, attempt_count, billing_period_start, billing_period_end, payment_intent_id, created_at, updated_at",
        )
        .in("subscription_id", subscriptionIds)
        .order("created_at", { ascending: false });
      if (invoicesErr) throw invoicesErr;
      invoices = invoiceRows ?? [];

      const paymentIntentIds = invoices
        .map((invoice) => invoice.payment_intent_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);

      if (paymentIntentIds.length > 0) {
        const { data: attemptRows, error: attemptsErr } = await adminAny
          .schema("payments")
          .from("payment_attempts")
          .select(
            "id, payment_intent_id, provider_id, provider_payment_id, status, checkout_url, created_at, updated_at",
          )
          .in("payment_intent_id", paymentIntentIds)
          .order("created_at", { ascending: false });
        if (attemptsErr) throw attemptsErr;
        attempts = attemptRows ?? [];

        // Open checkout sessions, so an unpaid subscription can hand back its
        // pay link at any time. Krafta Pay sends no email: the link surfaced
        // once on the create form was the only copy of it, and navigating away
        // lost it for good. Strictly a READ — the recovery path is the only
        // thing allowed to mint sessions, and a dashboard refresh must not.
        const { data: sessionRows, error: sessionsErr } = await adminAny
          .schema("payments")
          .from("checkout_sessions")
          .select("payment_intent_id, public_token, created_at")
          .in("payment_intent_id", paymentIntentIds)
          .eq("status", "open")
          .order("created_at", { ascending: false });
        if (sessionsErr) throw sessionsErr;
        openSessions = sessionRows ?? [];
      }
    }

    const attemptsByIntentId = new Map<string, Array<Record<string, any>>>();
    for (const attempt of attempts) {
      const key = String(attempt.payment_intent_id ?? "");
      if (!key) continue;
      const list = attemptsByIntentId.get(key) ?? [];
      list.push(attempt);
      attemptsByIntentId.set(key, list);
    }

    const invoicesBySubscriptionId = new Map<string, Array<Record<string, any>>>();
    for (const invoice of invoices) {
      const key = String(invoice.subscription_id ?? "");
      if (!key) continue;
      const list = invoicesBySubscriptionId.get(key) ?? [];
      list.push({
        ...invoice,
        payment_attempts: attemptsByIntentId.get(String(invoice.payment_intent_id ?? "")) ?? [],
      });
      invoicesBySubscriptionId.set(key, list);
    }

    // Newest open session per intent (the query is already ordered desc).
    const openTokenByIntentId = new Map<string, string>();
    for (const session of openSessions) {
      const key = String(session.payment_intent_id ?? "");
      const token = String(session.public_token ?? "");
      if (!key || !token || openTokenByIntentId.has(key)) continue;
      openTokenByIntentId.set(key, token);
    }

    const payBaseUrl = (process.env.PAY_BASE_URL ?? "").replace(/\/+$/, "");

    const enrichedSubscriptions = subscriptions.map((row) => {
      const subInvoices = invoicesBySubscriptionId.get(String(row.id)) ?? [];
      // Invoices come back newest-first, so the first unpaid one carrying an
      // open session is the invoice the customer is actually being asked to
      // pay right now.
      // Only where the customer actually owes. A canceled or paused
      // subscription can still carry an unpaid invoice, and handing out a link
      // that charges for a subscription nobody is on is worse than no link.
      const owesPayment = row.status === "incomplete" || row.status === "past_due";

      let payUrl: string | null = null;
      if (payBaseUrl && owesPayment) {
        for (const invoice of subInvoices) {
          if (invoice.status === "paid" || invoice.status === "void") continue;
          const token = openTokenByIntentId.get(String(invoice.payment_intent_id ?? ""));
          if (token) {
            payUrl = `${payBaseUrl}/pay/${token}`;
            break;
          }
        }
      }
      return { ...row, invoices: subInvoices, pay_url: payUrl };
    });

    return NextResponse.json({ subscriptions: enrichedSubscriptions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "subscriptions_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
