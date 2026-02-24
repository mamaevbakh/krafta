import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { resolveActiveCustomerPortalSession, writeCustomerPortalEvent } from "@/lib/customer-portal";
import { writePaymentLog } from "@krafta/payments-core";

function redirectToPortal(req: Request, rawToken: string, params?: Record<string, string>) {
  const url = new URL(`/portal/${encodeURIComponent(rawToken)}`, req.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
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

    const { data: subscription, error: subscriptionErr } = await supabase
      .schema("payments")
      .from("subscriptions")
      .select("id, org_id, customer_id, status, cancel_at_period_end")
      .eq("id", subscription_id)
      .eq("org_id", portalSession.session.org_id)
      .eq("customer_id", portalSession.session.customer_id)
      .maybeSingle();
    if (subscriptionErr) throw subscriptionErr;
    if (!subscription) {
      return redirectToPortal(req, session_token, { error: "subscription_not_found" });
    }

    if (subscription.status === "canceled") {
      return redirectToPortal(req, session_token, { success: "already_canceled" });
    }

    if (!subscription.cancel_at_period_end) {
      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .update({
          cancel_at_period_end: true,
          updated_at: nowIso,
        })
        .eq("id", subscription.id);
      if (updateErr) throw updateErr;

      await supabase.schema("payments").from("subscription_events").insert({
        subscription_id: subscription.id,
        event_type: "customer_portal_cancel_at_period_end_requested",
        payload: {
          source: "customer_portal",
          customer_portal_session_id: portalSession.session.id,
        },
      });

      await writeCustomerPortalEvent(supabase, {
        portalSessionId: portalSession.session.id,
        orgId: portalSession.session.org_id,
        customerId: portalSession.session.customer_id,
        subscriptionId: subscription.id,
        eventType: "subscription_cancel_at_period_end_requested",
        payload: {
          source: "customer_portal",
        },
      });
    }

    await writePaymentLog(supabase, {
      type: "customer_portal",
      event: "subscription.cancel_at_period_end",
      level: "info",
      orgId: portalSession.session.org_id,
      data: {
        customerId: portalSession.session.customer_id,
        subscriptionId: subscription.id,
        portalSessionId: portalSession.session.id,
      },
    });

    return redirectToPortal(req, session_token, { success: "cancel_at_period_end_set" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "cancel_failed";
    console.error("customer portal cancel subscription failed", { message, error });
    return redirectToPortal(req, session_token, { error: "cancel_failed" });
  }
}
