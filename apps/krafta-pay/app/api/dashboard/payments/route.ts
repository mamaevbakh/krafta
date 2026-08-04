import { NextResponse } from "next/server";

import {
  getAuthenticatedUserOrThrow,
  requireOrgMembership,
} from "@/lib/dashboard-auth";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  buildPaymentRow,
  type PaymentAttemptRow,
  type PaymentIntentRow,
} from "@/lib/payments-list";

const PAGE_SIZE = 50;

function parseOrgId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("orgId_required");
  }
  return value.trim();
}

function parseEnvironment(value: unknown): "test" | "live" {
  return value === "test" ? "test" : "live";
}

/**
 * One-off payments for the merchant's Payments page.
 *
 * ON THE DISCRIMINATOR. A one-off is an intent with no invoice. That is a
 * structural fact, not a convention: payments.invoices.subscription_id is
 * NOT NULL (baseline migration), so an invoice cannot exist without a
 * subscription behind it, and a subscription charge always writes one.
 *
 * It would have been easier to filter on `metadata.subscription_id`, and that
 * would have been wrong — payment_intents.metadata is merchant input, copied
 * verbatim from the create request. Any merchant whose backend happens to put a
 * `subscription_id` key in their own metadata would have watched their payments
 * disappear from their own list.
 */
export async function GET(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedUserOrThrow();
    const url = new URL(req.url);
    const orgId = parseOrgId(url.searchParams.get("orgId"));
    const environment = parseEnvironment(url.searchParams.get("environment"));

    await requireOrgMembership({
      supabase,
      userId: user.id,
      orgId,
      minRole: "member",
    });

    const admin = createAdminSupabase();

    // Scoped by org AND environment. Test and live are separate books; showing
    // a merchant their sandbox traffic next to real money is how a reconciliation
    // goes wrong.
    const { data: intentRows, error: intentsErr } = await admin
      .schema("payments")
      .from("payment_intents")
      .select("id, status, amount_minor, currency, description, order_id, created_at")
      .eq("org_id", orgId)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE * 3);
    if (intentsErr) throw intentsErr;

    const intents = (intentRows ?? []) as PaymentIntentRow[];
    const intentIds = intents.map((row) => row.id);

    if (intentIds.length === 0) {
      return NextResponse.json({ payments: [], environment });
    }

    // Which of these belong to a subscription. Fetched rather than joined so the
    // exclusion is explicit and testable at the boundary.
    const { data: invoiceRows, error: invoicesErr } = await admin
      .schema("payments")
      .from("invoices")
      .select("payment_intent_id")
      .in("payment_intent_id", intentIds);
    if (invoicesErr) throw invoicesErr;

    const subscriptionIntentIds = new Set(
      (invoiceRows ?? [])
        .map((row: { payment_intent_id: string | null }) => row.payment_intent_id)
        .filter((value: string | null): value is string => Boolean(value)),
    );

    const oneOffIntents = intents
      .filter((row) => !subscriptionIntentIds.has(row.id))
      .slice(0, PAGE_SIZE);

    if (oneOffIntents.length === 0) {
      return NextResponse.json({ payments: [], environment });
    }

    const oneOffIds = oneOffIntents.map((row) => row.id);

    const { data: attemptRows, error: attemptsErr } = await admin
      .schema("payments")
      .from("payment_attempts")
      .select("payment_intent_id, status, provider_id, updated_at")
      .in("payment_intent_id", oneOffIds)
      .order("created_at", { ascending: false });
    if (attemptsErr) throw attemptsErr;

    // Open sessions only. This is strictly a READ — minting a session is the
    // recovery path's job, and a dashboard refresh must never charge anything.
    const { data: sessionRows, error: sessionsErr } = await admin
      .schema("payments")
      .from("checkout_sessions")
      .select("payment_intent_id, public_token, created_at")
      .in("payment_intent_id", oneOffIds)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (sessionsErr) throw sessionsErr;

    const attemptsByIntent = new Map<string, PaymentAttemptRow[]>();
    for (const row of (attemptRows ?? []) as PaymentAttemptRow[]) {
      const key = String(row.payment_intent_id ?? "");
      if (!key) continue;
      attemptsByIntent.set(key, [...(attemptsByIntent.get(key) ?? []), row]);
    }

    // Newest open session per intent; the query is already ordered desc.
    const tokenByIntent = new Map<string, string>();
    for (const row of (sessionRows ?? []) as Array<{
      payment_intent_id: string | null;
      public_token: string | null;
    }>) {
      const key = String(row.payment_intent_id ?? "");
      const token = String(row.public_token ?? "");
      if (!key || !token || tokenByIntent.has(key)) continue;
      tokenByIntent.set(key, token);
    }

    const payBaseUrl = (process.env.PAY_BASE_URL ?? "").replace(/\/+$/, "");

    const payments = oneOffIntents.map((intent) =>
      buildPaymentRow({
        intent,
        attempts: attemptsByIntent.get(intent.id) ?? [],
        openPublicToken: tokenByIntent.get(intent.id) ?? null,
        payBaseUrl,
      }),
    );

    return NextResponse.json({ payments, environment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payments_get_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
