import { NextResponse } from "next/server";
import { emitSubscriptionEvent } from "@krafta/payments-core";
import { hydrateSubscriptions, loadOwnedSubscription } from "@/lib/v1-subscriptions";
import { V1Error, authenticateV1, v1ErrorResponse } from "@/lib/v1";

const PAUSABLE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Pause billing while keeping the subscription and its saved card.
 *
 * The alternative merchants reach for otherwise is cancel-and-resubscribe,
 * which throws away the card token — so the customer has to re-enter card
 * details and pass OTP again to come back. That is the single most expensive
 * step in the funnel to make someone repeat, and gyms, schools, and seasonal
 * businesses hit it constantly.
 *
 * The renewal runner selects on `active` / `past_due`, so `paused` is skipped
 * by construction — no extra guard needed in the cron.
 */
export async function POST(
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

    if (row.status === "paused") {
      const [already] = await hydrateSubscriptions(supabase, [row]);
      return NextResponse.json(already);
    }
    if (!PAUSABLE_STATUSES.has(row.status)) {
      throw new V1Error(
        "subscription_not_pausable",
        409,
        `A subscription in status \`${row.status}\` cannot be paused.`,
      );
    }

    const nowIso = new Date().toISOString();
    const metadata = { ...(row.metadata ?? {}) } as Record<string, unknown>;
    // Remember what it was, so resume restores the real state rather than
    // blanket-promoting a past_due subscription to active and skipping the
    // collection it still owes.
    metadata.paused_from_status = row.status;
    metadata.paused_at = nowIso;

    const { error } = await supabase
      .schema("payments")
      .from("subscriptions")
      .update({ status: "paused", metadata: metadata as Record<string, never>, updated_at: nowIso })
      .eq("id", row.id)
      .eq("org_id", auth.merchantOrgId);
    if (error) throw error;

    await supabase
      .schema("payments")
      .from("subscription_events")
      .insert({
        subscription_id: row.id,
        event_type: "paused",
        payload: { source: "merchant_api", api_key_id: auth.keyId, from_status: row.status },
      });

    await emitSubscriptionEvent(supabase, {
      eventType: "subscription.paused",
      subscriptionId: row.id,
      orgId: auth.merchantOrgId,
      environment: auth.environment,
      extra: { pausedFromStatus: row.status },
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
