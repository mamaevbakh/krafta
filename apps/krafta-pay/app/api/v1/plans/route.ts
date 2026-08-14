import { NextResponse } from "next/server";
import { authenticateV1, v1ErrorResponse } from "@/lib/v1";

/**
 * The merchant's active plans.
 *
 * NO ENVIRONMENT FILTER, and that is a finding rather than an oversight:
 * `payments.plans` has no `environment` column at all. A plan is a price list
 * — a name, an amount, an interval — not customer data, and both halves of a
 * merchant's account quote the same prices. Adding a column so this line could
 * exist would split every merchant's catalogue in two and make a test
 * subscription unable to name the plan it is testing.
 *
 * `customers` and `subscriptions` DO carry `environment`, and every route
 * touching them filters on it. If plans ever gain per-environment pricing this
 * is the first line to add.
 *
 * What did change: the route now reports through the v1 wrapper, so a bad key
 * produces the documented `{error:{type,code,message}}` envelope instead of
 * `{error:"invalid_api_key"}`. A merchant writing one error handler for our API
 * should not need a second one for this endpoint.
 */

type PlanRow = {
  id: string;
  name: string;
  code: string | null;
  amount_minor: number;
  currency: string;
  interval_count: number | null;
  trial_days: number | null;
  is_active: boolean;
};

export async function GET(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);

    const { data, error } = await supabase
      .schema("payments")
      .from("plans")
      .select(
        "id, name, code, amount_minor, currency, interval_count, trial_days, is_active",
      )
      .eq("org_id", auth.merchantOrgId)
      .eq("is_active", true)
      .order("amount_minor", { ascending: true });
    if (error) throw error;

    return NextResponse.json({
      object: "list",
      // `plans` was the shape before the wrapper landed and merchants are
      // reading it today. Kept alongside `data` so the envelope can converge on
      // the house shape without breaking anyone mid-integration.
      plans: (data ?? []) as PlanRow[],
      data: (data ?? []) as PlanRow[],
      hasMore: false,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
