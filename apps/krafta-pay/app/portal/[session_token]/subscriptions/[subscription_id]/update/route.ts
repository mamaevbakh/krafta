import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { resolveActiveCustomerPortalSession, writeCustomerPortalEvent } from "@/lib/customer-portal";
import { writePaymentLog } from "@krafta/payments-core";

type ProrationBehavior = "none" | "defer_to_period_end";

function redirectToPortal(req: Request, rawToken: string, params?: Record<string, string>) {
  const url = new URL(`/portal/${encodeURIComponent(rawToken)}`, req.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
}

function isProrationBehavior(value: string): value is ProrationBehavior {
  return value === "none" || value === "defer_to_period_end";
}

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ session_token: string; subscription_id: string }>;
  },
) {
  const { session_token, subscription_id } = await params;
  const supabase = createAdminSupabase();

  try {
    const portalSession = await resolveActiveCustomerPortalSession(supabase, session_token);
    if (!portalSession.ok) {
      return redirectToPortal(req, session_token, { error: portalSession.reason });
    }

    const formData = await req.formData();
    const planId = String(formData.get("planId") ?? "").trim();
    const prorationBehaviorRaw = String(formData.get("prorationBehavior") ?? "").trim();
    const prorationBehavior = isProrationBehavior(prorationBehaviorRaw)
      ? prorationBehaviorRaw
      : null;

    if (!planId || !prorationBehavior) {
      return redirectToPortal(req, session_token, { error: "invalid_plan_update_request" });
    }

    const { data: subscription, error: subscriptionErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .select("id, org_id, customer_id, plan_id, status, current_period_end, metadata")
      .eq("id", subscription_id)
      .eq("org_id", portalSession.session.org_id)
      .eq("customer_id", portalSession.session.customer_id)
      .maybeSingle();
    if (subscriptionErr) throw subscriptionErr;
    if (!subscription) {
      return redirectToPortal(req, session_token, { error: "subscription_not_found" });
    }

    const { data: targetPlan, error: targetPlanErr } = await supabase
      .schema("payments")
      .from("plans")
      .select("id, name, amount_minor, currency, interval_count, is_active")
      .eq("id", planId)
      .eq("org_id", portalSession.session.org_id)
      .eq("is_active", true)
      .maybeSingle();
    if (targetPlanErr) throw targetPlanErr;
    if (!targetPlan) {
      return redirectToPortal(req, session_token, { error: "plan_not_found" });
    }

    const nowIso = new Date().toISOString();
    const nextMetadata =
      subscription.metadata && typeof subscription.metadata === "object"
        ? ({ ...(subscription.metadata as Record<string, unknown>) } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    if (subscription.plan_id === targetPlan.id && prorationBehavior === "none") {
      // Re-selecting the current plan cancels any scheduled (deferred) downgrade —
      // otherwise it would silently apply at the next renewal.
      if (nextMetadata.pending_plan_change) {
        delete nextMetadata.pending_plan_change;
        const { error: clearErr } = await supabase
          .schema("payments")
          .from("subscriptions")
          .update({ metadata: nextMetadata as any, updated_at: nowIso })
          .eq("id", subscription.id);
        if (clearErr) throw clearErr;

        await supabase.schema("payments").from("subscription_events").insert({
          subscription_id: subscription.id,
          event_type: "customer_portal_plan_change_canceled",
          payload: {
            plan_id: subscription.plan_id,
            customer_portal_session_id: portalSession.session.id,
          },
        });
      }
      return redirectToPortal(req, session_token, { success: "plan_unchanged" });
    }

    if (prorationBehavior === "defer_to_period_end") {
      nextMetadata.pending_plan_change = {
        plan_id: targetPlan.id,
        from_plan_id: subscription.plan_id,
        requested_at: nowIso,
        effective_at: "period_end",
        proration_behavior: "defer_to_period_end",
        source: "customer_portal",
        customer_portal_session_id: portalSession.session.id,
      };
      const { error: updateErr } = await supabase
        .schema("payments")
        .from("subscriptions")
      .update({
          metadata: nextMetadata as any,
          updated_at: nowIso,
        })
        .eq("id", subscription.id);
      if (updateErr) throw updateErr;

      await supabase.schema("payments").from("subscription_events").insert({
        subscription_id: subscription.id,
        event_type: "customer_portal_plan_change_scheduled",
        payload: {
          from_plan_id: subscription.plan_id,
          to_plan_id: targetPlan.id,
          proration_behavior: prorationBehavior,
          effective_at: "period_end",
          customer_portal_session_id: portalSession.session.id,
        },
      });

      await writeCustomerPortalEvent(supabase, {
        portalSessionId: portalSession.session.id,
        orgId: portalSession.session.org_id,
        customerId: portalSession.session.customer_id,
        subscriptionId: subscription.id,
        eventType: "subscription_plan_update_scheduled",
        payload: {
          fromPlanId: subscription.plan_id,
          toPlanId: targetPlan.id,
          prorationBehavior: prorationBehavior,
          effectiveAt: "period_end",
        },
      });

      await writePaymentLog(supabase, {
        type: "customer_portal",
        event: "subscription.plan_update_scheduled",
        level: "info",
        orgId: portalSession.session.org_id,
        data: {
          portalSessionId: portalSession.session.id,
          customerId: portalSession.session.customer_id,
          subscriptionId: subscription.id,
          fromPlanId: subscription.plan_id,
          toPlanId: targetPlan.id,
          prorationBehavior,
        },
      });

      return redirectToPortal(req, session_token, { success: "plan_update_scheduled" });
    }

    delete nextMetadata.pending_plan_change;
    const { error: immediateUpdateErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .update({
        plan_id: targetPlan.id,
        metadata: nextMetadata as any,
        updated_at: nowIso,
      })
      .eq("id", subscription.id);
    if (immediateUpdateErr) throw immediateUpdateErr;

    await supabase.schema("payments").from("subscription_events").insert({
      subscription_id: subscription.id,
      event_type: "customer_portal_plan_changed",
      payload: {
        from_plan_id: subscription.plan_id,
        to_plan_id: targetPlan.id,
        proration_behavior: "none",
        applied_at: nowIso,
        customer_portal_session_id: portalSession.session.id,
      },
    });

    await writeCustomerPortalEvent(supabase, {
      portalSessionId: portalSession.session.id,
      orgId: portalSession.session.org_id,
      customerId: portalSession.session.customer_id,
      subscriptionId: subscription.id,
      eventType: "subscription_plan_updated",
      payload: {
        fromPlanId: subscription.plan_id,
        toPlanId: targetPlan.id,
        prorationBehavior: "none",
      },
    });

    await writePaymentLog(supabase, {
      type: "customer_portal",
      event: "subscription.plan_updated",
      level: "info",
      orgId: portalSession.session.org_id,
      data: {
        portalSessionId: portalSession.session.id,
        customerId: portalSession.session.customer_id,
        subscriptionId: subscription.id,
        fromPlanId: subscription.plan_id,
        toPlanId: targetPlan.id,
        prorationBehavior: "none",
      },
    });

    return redirectToPortal(req, session_token, { success: "plan_updated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "subscription_update_failed";
    console.error("customer portal subscription update failed", { message, error });
    return redirectToPortal(req, session_token, { error: "subscription_update_failed" });
  }
}
