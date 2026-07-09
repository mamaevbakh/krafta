import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import {
  assertMemberOrThrow,
  resolveOwnedSubscription,
} from "@/lib/internal-subscription";
import { writePaymentLog } from "@krafta/payments-core";

/**
 * First-party plan change (upgrade / downgrade) on the SAME subscription — no
 * duplicate subscription, unlike the old main-app "Switch" button.
 *
 * prorationBehavior:
 *  - "none"                 → swap plan_id immediately (new price applies next cycle).
 *                             The dashboard uses this for UPGRADES so the tier unlocks now.
 *  - "defer_to_period_end"  → record metadata.pending_plan_change; the renewal cron
 *                             applies it at the next cycle. The dashboard uses this for
 *                             DOWNGRADES so the merchant keeps what they paid for.
 *
 * v1 has no proration invoice (matches the hosted portal). See the portal's
 * subscriptions/[id]/update route — this is the internal-HMAC twin of it.
 */
type ChangePlanBody = {
  customerOrgId?: string;
  subscriptionId?: string;
  planId?: string;
  prorationBehavior?: "none" | "defer_to_period_end";
  initiatedByUserId?: string;
};

const CHANGEABLE_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function POST(req: Request) {
  const supabase = createAdminSupabase();
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as ChangePlanBody;
    const customerOrgId = body?.customerOrgId?.trim();
    const subscriptionId = body?.subscriptionId?.trim();
    const planId = body?.planId?.trim();
    const prorationBehavior =
      body?.prorationBehavior === "defer_to_period_end" ? "defer_to_period_end" : "none";
    if (!customerOrgId || !subscriptionId || !planId) {
      return NextResponse.json(
        { error: "customerOrgId, subscriptionId, and planId are required" },
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
    if (!CHANGEABLE_STATUSES.has(sub.status ?? "")) {
      return NextResponse.json(
        { error: "subscription_not_changeable" },
        { status: 409 },
      );
    }

    // Target plan must belong to the SAME payee org and be active.
    const { data: targetPlan, error: targetPlanErr } = await supabase
      .schema("payments")
      .from("plans")
      .select("id, code, name, amount_minor")
      .eq("id", planId)
      .eq("org_id", sub.org_id)
      .eq("is_active", true)
      .maybeSingle();
    if (targetPlanErr) throw targetPlanErr;
    if (!targetPlan) {
      return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const nextMetadata: Record<string, unknown> = { ...(sub.metadata ?? {}) };

    if (sub.plan_id === targetPlan.id && prorationBehavior === "none") {
      // Already on this plan. If a downgrade was scheduled for period end,
      // re-selecting the current plan cancels that scheduled change — the merchant
      // is choosing to keep what they have. Without this, the pending downgrade
      // would silently apply at the next renewal.
      const clearedPending = Boolean(nextMetadata.pending_plan_change);
      if (clearedPending) {
        delete nextMetadata.pending_plan_change;
        const { error: clearErr } = await supabase
          .schema("payments")
          .from("subscriptions")
          .update({ metadata: nextMetadata as any, updated_at: nowIso })
          .eq("id", sub.id);
        if (clearErr) throw clearErr;

        await supabase.schema("payments").from("subscription_events").insert({
          subscription_id: sub.id,
          event_type: "dashboard_plan_change_canceled",
          payload: { plan_id: sub.plan_id, source: "krafta_dashboard" },
        });
        await writePaymentLog(supabase, {
          type: "subscription_lifecycle",
          event: "subscription.plan_change_canceled",
          level: "info",
          orgId: sub.org_id,
          data: { subscriptionId: sub.id, customerOrgId, planId: sub.plan_id },
        });
      }
      return NextResponse.json(
        {
          ok: true,
          unchanged: true,
          pendingChangeCleared: clearedPending,
          subscriptionId: sub.id,
          planId: sub.plan_id,
        },
        { status: 200 },
      );
    }

    if (prorationBehavior === "defer_to_period_end") {
      nextMetadata.pending_plan_change = {
        plan_id: targetPlan.id,
        from_plan_id: sub.plan_id,
        requested_at: nowIso,
        effective_at: "period_end",
        proration_behavior: "defer_to_period_end",
        source: "krafta_dashboard",
      };
      const { error: updateErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .update({ metadata: nextMetadata as any, updated_at: nowIso })
        .eq("id", sub.id);
      if (updateErr) throw updateErr;

      await supabase.schema("payments").from("subscription_events").insert({
        subscription_id: sub.id,
        event_type: "dashboard_plan_change_scheduled",
        payload: {
          from_plan_id: sub.plan_id,
          to_plan_id: targetPlan.id,
          effective_at: "period_end",
          source: "krafta_dashboard",
        },
      });
      await writePaymentLog(supabase, {
        type: "subscription_lifecycle",
        event: "subscription.plan_change_scheduled",
        level: "info",
        orgId: sub.org_id,
        data: {
          subscriptionId: sub.id,
          customerOrgId,
          fromPlanId: sub.plan_id,
          toPlanId: targetPlan.id,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          scheduled: true,
          subscriptionId: sub.id,
          planId: sub.plan_id,
          pendingPlanId: targetPlan.id,
        },
        { status: 200 },
      );
    }

    // Immediate swap (upgrade). Clear any previously-scheduled downgrade.
    delete nextMetadata.pending_plan_change;
    const { error: immediateErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .update({ plan_id: targetPlan.id, metadata: nextMetadata as any, updated_at: nowIso })
      .eq("id", sub.id);
    if (immediateErr) throw immediateErr;

    await supabase.schema("payments").from("subscription_events").insert({
      subscription_id: sub.id,
      event_type: "dashboard_plan_changed",
      payload: {
        from_plan_id: sub.plan_id,
        to_plan_id: targetPlan.id,
        applied_at: nowIso,
        source: "krafta_dashboard",
      },
    });
    await writePaymentLog(supabase, {
      type: "subscription_lifecycle",
      event: "subscription.plan_changed",
      level: "info",
      orgId: sub.org_id,
      data: {
        subscriptionId: sub.id,
        customerOrgId,
        fromPlanId: sub.plan_id,
        toPlanId: targetPlan.id,
      },
    });

    return NextResponse.json(
      { ok: true, applied: true, subscriptionId: sub.id, planId: targetPlan.id },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "change_plan_failed";
    const status =
      message === "forbidden"
        ? 403
        : message.startsWith("missing_") ||
            message.startsWith("invalid_") ||
            message.startsWith("signature_")
          ? 401
          : 500;
    if (status === 500) {
      console.error("internal subscription change-plan failed", { message });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
