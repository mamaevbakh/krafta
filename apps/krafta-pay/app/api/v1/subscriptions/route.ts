import { NextResponse } from "next/server";
import {
  SUBSCRIPTION_COLUMNS,
  hydrateSubscriptions,
  type SubscriptionRecord,
} from "@/lib/v1-subscriptions";
import { authenticateV1, optionalString, parseLimit, v1ErrorResponse } from "@/lib/v1";

/**
 * List subscriptions.
 *
 * The reconciliation endpoint: a merchant whose webhook handler was down for an
 * afternoon uses this to work out who should still have access. Without it,
 * outbound webhooks are a single point of failure for entitlement state.
 *
 * Filters: `status`, `customerExternalId`, `planId`, `limit`.
 */
export async function GET(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const status = optionalString(url.searchParams.get("status"));
    const planId = optionalString(url.searchParams.get("planId"));
    const customerExternalId = optionalString(url.searchParams.get("customerExternalId"));

    let query = supabase
      .schema("payments")
      .from("subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("org_id", auth.merchantOrgId)
      .eq("environment", auth.environment)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      // Comma-separated so "who is in trouble" is one call:
      //   ?status=past_due,unpaid
      const statuses = status.split(",").map((value) => value.trim()).filter(Boolean);
      query = statuses.length > 1 ? query.in("status", statuses) : query.eq("status", statuses[0]);
    }
    if (planId) query = query.eq("plan_id", planId);

    if (customerExternalId) {
      const { data: customer, error: customerErr } = await supabase
        .schema("payments")
        .from("customers")
        .select("id")
        .eq("org_id", auth.merchantOrgId)
        .eq("environment", auth.environment)
        .eq("external_id", customerExternalId)
        .maybeSingle();
      if (customerErr) throw customerErr;
      // An unknown external id is an empty list, not an error — the caller is
      // asking "does this user have a subscription?" and "no" is a fine answer.
      if (!customer) {
        return NextResponse.json({ object: "list", data: [], hasMore: false });
      }
      query = query.eq("customer_id", customer.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as SubscriptionRecord[];
    return NextResponse.json({
      object: "list",
      data: await hydrateSubscriptions(supabase, rows),
      hasMore: rows.length === limit,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
