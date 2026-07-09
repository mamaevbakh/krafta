import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import {
  assertMemberOrThrow,
  resolveOwnedSubscription,
  summarizeSubscription,
} from "@/lib/internal-subscription";
import { writePaymentLog } from "@krafta/payments-core";

/**
 * First-party cancel / resume for a Krafta subscription, driven from the Krafta
 * dashboard (not the hosted portal). Cancel = schedule at period end
 * (`cancel_at_period_end = true`); the merchant keeps access until the period
 * ends, then the renewal cron flips status → canceled and entitlement drops to
 * Free. Resume clears a pending cancel while the subscription is still active.
 */
type CancelBody = {
  customerOrgId?: string;
  subscriptionId?: string;
  /** true = schedule cancel at period end; false = resume (clear pending cancel). */
  cancelAtPeriodEnd?: boolean;
  initiatedByUserId?: string;
};

const RESUMABLE_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function POST(req: Request) {
  const supabase = createAdminSupabase();
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as CancelBody;
    const customerOrgId = body?.customerOrgId?.trim();
    const subscriptionId = body?.subscriptionId?.trim();
    const cancelAtPeriodEnd = Boolean(body?.cancelAtPeriodEnd);
    if (!customerOrgId || !subscriptionId) {
      return NextResponse.json(
        { error: "customerOrgId and subscriptionId are required" },
        { status: 400 },
      );
    }

    await assertMemberOrThrow(supabase, {
      orgId: customerOrgId,
      userId: body.initiatedByUserId,
    });

    const sub = await resolveOwnedSubscription(supabase, { subscriptionId, customerOrgId });
    if (!sub) {
      return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
    }

    // A fully-canceled subscription can't be toggled — the merchant must re-subscribe.
    if (sub.status === "canceled") {
      return NextResponse.json(
        { error: "subscription_canceled", ...summarizeSubscription(sub) },
        { status: 409 },
      );
    }
    if (!cancelAtPeriodEnd && !RESUMABLE_STATUSES.has(sub.status ?? "")) {
      return NextResponse.json(
        { error: "subscription_not_resumable", ...summarizeSubscription(sub) },
        { status: 409 },
      );
    }

    if (sub.cancel_at_period_end !== cancelAtPeriodEnd) {
      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .update({ cancel_at_period_end: cancelAtPeriodEnd, updated_at: nowIso })
        .eq("id", sub.id);
      if (updateErr) throw updateErr;

      await supabase
        .schema("payments")
        .from("subscription_events")
        .insert({
          subscription_id: sub.id,
          event_type: cancelAtPeriodEnd
            ? "dashboard_cancel_at_period_end_requested"
            : "dashboard_cancel_resumed",
          payload: {
            source: "krafta_dashboard",
            customer_org_id: customerOrgId,
            initiated_by_user_id: body.initiatedByUserId ?? null,
          },
        });

      await writePaymentLog(supabase, {
        type: "subscription_lifecycle",
        event: cancelAtPeriodEnd
          ? "subscription.cancel_at_period_end"
          : "subscription.resume",
        level: "info",
        orgId: sub.org_id,
        data: {
          subscriptionId: sub.id,
          customerOrgId,
          initiatedByUserId: body.initiatedByUserId ?? null,
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        ...summarizeSubscription({ ...sub, cancel_at_period_end: cancelAtPeriodEnd }),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "cancel_failed";
    const status =
      message === "forbidden"
        ? 403
        : message.startsWith("missing_") ||
            message.startsWith("invalid_") ||
            message.startsWith("signature_")
          ? 401
          : 500;
    if (status === 500) {
      console.error("internal subscription cancel failed", { message });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
