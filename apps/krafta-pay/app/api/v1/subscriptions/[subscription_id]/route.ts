import { NextResponse } from "next/server";
import { hydrateSubscriptions, loadOwnedSubscription } from "@/lib/v1-subscriptions";
import { authenticateV1, v1ErrorResponse } from "@/lib/v1";

/** Retrieve one subscription, with its plan and customer inlined. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ subscription_id: string }> },
) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const { subscription_id } = await params;

    const row = await loadOwnedSubscription(supabase, {
      subscriptionId: subscription_id,
      merchantOrgId: auth.merchantOrgId,
      environment: auth.environment,
    });

    const [serialized] = await hydrateSubscriptions(supabase, [row]);

    const { data: invoices } = await supabase
      .schema("payments")
      .from("invoices")
      .select("id, amount_due_minor, currency, status, attempt_count, due_at, paid_at, billing_period_start, billing_period_end")
      .eq("subscription_id", row.id)
      .order("created_at", { ascending: false })
      .limit(12);

    return NextResponse.json({
      ...serialized,
      invoices: (invoices ?? []).map((invoice) => ({
        id: invoice.id,
        amountDueMinor: invoice.amount_due_minor,
        currency: invoice.currency,
        status: invoice.status,
        attemptCount: invoice.attempt_count,
        dueAt: invoice.due_at,
        paidAt: invoice.paid_at,
        periodStart: invoice.billing_period_start,
        periodEnd: invoice.billing_period_end,
      })),
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
