import { NextResponse } from "next/server";
import { emitSubscriptionEvent } from "@krafta/payments-core";
import { hydrateSubscriptions, loadOwnedSubscription } from "@/lib/v1-subscriptions";
import { V1Error, authenticateV1, readJsonBody, v1ErrorResponse } from "@/lib/v1";

/**
 * Resume a paused subscription, or clear a scheduled cancel.
 *
 * Restores the status the subscription held when it was paused — a
 * subscription paused while `past_due` comes back `past_due` and still owes
 * that invoice. Promoting it to `active` would silently forgive a debt the
 * merchant never agreed to write off.
 *
 * `billingAnchor: "now"` shifts the next charge to a full interval from resume,
 * so a customer who paused for three months is not billed the moment they come
 * back. Default keeps the original anchor.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ subscription_id: string }> },
) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const { subscription_id } = await params;
    const body = await readJsonBody(req);
    const rebaseAnchor = body.billingAnchor === "now";

    const row = await loadOwnedSubscription(supabase, {
      subscriptionId: subscription_id,
      merchantOrgId: auth.merchantOrgId,
      environment: auth.environment,
    });

    const nowIso = new Date().toISOString();
    const metadata = { ...(row.metadata ?? {}) } as Record<string, unknown>;

    // Case 1: clear a scheduled cancel on a still-running subscription.
    if (row.status !== "paused") {
      if (!row.cancel_at_period_end) {
        throw new V1Error(
          "subscription_not_resumable",
          409,
          `A subscription in status \`${row.status}\` with no pending cancel has nothing to resume.`,
        );
      }
      if (row.status === "canceled") {
        throw new V1Error(
          "subscription_not_resumable",
          409,
          "This subscription is fully canceled. Create a new checkout instead.",
        );
      }

      const { error } = await supabase
        .schema("payments")
        .from("subscriptions")
        .update({ cancel_at_period_end: false, updated_at: nowIso })
        .eq("id", row.id)
        .eq("org_id", auth.merchantOrgId);
      if (error) throw error;

      await supabase
        .schema("payments")
        .from("subscription_events")
        .insert({
          subscription_id: row.id,
          event_type: "cancel_cleared",
          payload: { source: "merchant_api", api_key_id: auth.keyId },
        });

      const cleared = await loadOwnedSubscription(supabase, {
        subscriptionId: subscription_id,
        merchantOrgId: auth.merchantOrgId,
        environment: auth.environment,
      });
      const [serializedCleared] = await hydrateSubscriptions(supabase, [cleared]);
      return NextResponse.json(serializedCleared);
    }

    // Case 2: un-pause.
    const restoredStatus =
      typeof metadata.paused_from_status === "string" &&
      ["active", "trialing", "past_due"].includes(metadata.paused_from_status)
        ? (metadata.paused_from_status as string)
        : "active";

    delete metadata.paused_from_status;
    delete metadata.paused_at;

    const patch: Record<string, unknown> = {
      status: restoredStatus,
      metadata,
      updated_at: nowIso,
    };

    if (rebaseAnchor) {
      const { data: plan } = await supabase
        .schema("payments")
        .from("plans")
        .select("interval_count")
        .eq("id", row.plan_id)
        .maybeSingle();

      const start = new Date();
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + Math.max(1, Number(plan?.interval_count ?? 1)));
      patch.current_period_start = start.toISOString();
      patch.current_period_end = end.toISOString();
    }

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
        event_type: "resumed",
        payload: {
          source: "merchant_api",
          api_key_id: auth.keyId,
          restored_status: restoredStatus,
          rebased_anchor: rebaseAnchor,
        },
      });

    await emitSubscriptionEvent(supabase, {
      eventType: "subscription.resumed",
      subscriptionId: row.id,
      orgId: auth.merchantOrgId,
      environment: auth.environment,
      extra: { restoredStatus, rebasedAnchor: rebaseAnchor },
    });

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
