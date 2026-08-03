import { NextResponse } from "next/server";
import { emitSubscriptionEvent } from "@krafta/payments-core";
import { hydrateSubscriptions, loadOwnedSubscription } from "@/lib/v1-subscriptions";
import { V1Error, authenticateV1, readJsonBody, v1ErrorResponse } from "@/lib/v1";

/**
 * Cancel a subscription.
 *
 * Default is at period end — the customer already paid for the current period
 * and taking it away on the spot is a refund request waiting to happen. Pass
 * `{"immediately": true}` for the cases where instant is right (fraud, a
 * duplicate signup, a customer support call).
 *
 * `cancel_at_period_end` is honored by the renewal cron, which flips status to
 * `canceled` when the period actually elapses.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ subscription_id: string }> },
) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const { subscription_id } = await params;
    const body = await readJsonBody(req);
    const immediately = body.immediately === true;

    const row = await loadOwnedSubscription(supabase, {
      subscriptionId: subscription_id,
      merchantOrgId: auth.merchantOrgId,
      environment: auth.environment,
    });

    if (row.status === "canceled") {
      throw new V1Error(
        "subscription_already_canceled",
        409,
        "This subscription is already canceled.",
      );
    }

    const nowIso = new Date().toISOString();
    const patch = immediately
      ? { status: "canceled", canceled_at: nowIso, cancel_at_period_end: false, updated_at: nowIso }
      : { cancel_at_period_end: true, updated_at: nowIso };

    const { error } = await supabase
      .schema("payments")
      .from("subscriptions")
      .update(patch)
      .eq("id", row.id)
      .eq("org_id", auth.merchantOrgId);
    if (error) throw error;

    await supabase
      .schema("payments")
      .from("subscription_events")
      .insert({
        subscription_id: row.id,
        event_type: immediately ? "canceled" : "cancel_scheduled",
        payload: { source: "merchant_api", api_key_id: auth.keyId },
      });

    // Only fire on an actual cancellation. A scheduled cancel is not a
    // cancellation yet — the customer keeps access, and a merchant who revoked
    // it on this event would be cutting off someone who has paid through the
    // end of the period. The renewal cron emits the real one when it lands.
    if (immediately) {
      await emitSubscriptionEvent(supabase, {
        eventType: "subscription.canceled",
        subscriptionId: row.id,
        orgId: auth.merchantOrgId,
        environment: auth.environment,
        extra: { immediate: true, source: "merchant_api" },
      });
    }

    const fresh = await loadOwnedSubscription(supabase, {
      subscriptionId: subscription_id,
      merchantOrgId: auth.merchantOrgId,
      environment: auth.environment,
    });
    const [serialized] = await hydrateSubscriptions(supabase, [fresh]);
    return NextResponse.json(serialized);
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
