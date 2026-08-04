import { NextResponse } from "next/server";

import { authenticateV1, optionalString, parseLimit, v1ErrorResponse } from "@/lib/v1";
import {
  PAYMENT_INTENT_COLUMNS,
  serializePayment,
  subscriptionIntentIds,
  type PaymentAttemptRecord,
  type PaymentIntentRecord,
} from "@/lib/v1-payments";

/**
 * List one-off payments.
 *
 * The reconciliation endpoint for plain charges, and the only read surface a
 * merchant has for them: before this, the sole way to see a payment was
 * `GET /api/checkout_sessions/{token}/status`, which is unauthenticated, keyed
 * on a token you must already hold, and returns neither `orderId` nor
 * `metadata`. A backend that missed a webhook had nothing to reconcile against.
 *
 * Filters: `status`, `orderId`, `limit`.
 */
export async function GET(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const status = optionalString(url.searchParams.get("status"));
    const orderId = optionalString(url.searchParams.get("orderId"));

    // Over-fetch, because subscription charges are removed below and the page
    // has to stay honest afterwards. Without the headroom a page of mostly
    // subscription intents would come back short of `limit` while still
    // reporting hasMore correctly — technically true, but useless to page with.
    const scanLimit = Math.min(limit * 4, 400);

    let query = supabase
      .schema("payments")
      .from("payment_intents")
      .select(PAYMENT_INTENT_COLUMNS)
      .eq("org_id", auth.merchantOrgId)
      .eq("environment", auth.environment)
      .order("created_at", { ascending: false })
      .limit(scanLimit);

    if (status) {
      const statuses = status.split(",").map((v) => v.trim()).filter(Boolean);
      query = statuses.length > 1 ? query.in("status", statuses) : query.eq("status", statuses[0]);
    }
    if (orderId) query = query.eq("order_id", orderId);

    const { data: intentRows, error } = await query;
    if (error) throw error;

    const intents = (intentRows ?? []) as unknown as PaymentIntentRecord[];
    if (intents.length === 0) {
      return NextResponse.json({ object: "list", data: [], hasMore: false });
    }

    const ids = intents.map((row) => row.id);

    const { data: invoiceRows, error: invoiceErr } = await supabase
      .schema("payments")
      .from("invoices")
      .select("payment_intent_id")
      .in("payment_intent_id", ids);
    if (invoiceErr) throw invoiceErr;

    const excluded = subscriptionIntentIds(invoiceRows);
    const oneOffs = intents.filter((row) => !excluded.has(row.id));

    // hasMore is computed AFTER the subscription filter, on the same list the
    // caller receives. Deriving it from the pre-filter row count would promise a
    // next page that does not exist.
    const page = oneOffs.slice(0, limit);
    const hasMore = oneOffs.length > limit;

    let attempts: PaymentAttemptRecord[] = [];
    if (page.length > 0) {
      const { data: attemptRows, error: attemptsErr } = await supabase
        .schema("payments")
        .from("payment_attempts")
        .select("payment_intent_id, status, provider_id, provider_payment_id, updated_at")
        .in(
          "payment_intent_id",
          page.map((row) => row.id),
        )
        .order("created_at", { ascending: false });
      if (attemptsErr) throw attemptsErr;
      attempts = (attemptRows ?? []) as unknown as PaymentAttemptRecord[];
    }

    const byIntent = new Map<string, PaymentAttemptRecord[]>();
    for (const attempt of attempts) {
      const key = String(attempt.payment_intent_id ?? "");
      if (!key) continue;
      byIntent.set(key, [...(byIntent.get(key) ?? []), attempt]);
    }

    return NextResponse.json({
      object: "list",
      data: page.map((intent) =>
        serializePayment(intent, byIntent.get(intent.id) ?? [], auth.environment === "live"),
      ),
      hasMore,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
