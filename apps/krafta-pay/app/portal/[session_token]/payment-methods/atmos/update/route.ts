import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getExtendedCustomerPortalSessionExpiry,
  resolveActiveCustomerPortalSession,
  writeCustomerPortalEvent,
} from "@/lib/customer-portal";
import { createCardSetupSession } from "@/lib/card-setup";
import { writePaymentLog } from "@krafta/payments-core";

// Provider-correct card update for the hosted customer portal. Subscriptions
// bill through Atmos (inline card + off-session renewals), so changing the card
// mints a zero-amount `card_update` setup session and sends the customer to the
// hosted Atmos card form (`/pay/<token>`). On OTP confirm, the apply route binds
// the new card as the subscription's renewal default — no charge. This is the
// portal twin of the main app's internal `/subscriptions/change-card` flow.

function redirectToPortal(req: Request, rawToken: string, params?: Record<string, string>) {
  const url = new URL(`/portal/${encodeURIComponent(rawToken)}`, req.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ session_token: string }> },
) {
  const { session_token } = await params;
  const supabase = createAdminSupabase();

  try {
    const portalSession = await resolveActiveCustomerPortalSession(supabase, session_token);
    if (!portalSession.ok) {
      return redirectToPortal(req, session_token, { error: portalSession.reason });
    }

    const formData = await req.formData();
    const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
    if (!subscriptionId) {
      // The Atmos card_update flow binds the card to a specific subscription.
      return redirectToPortal(req, session_token, { error: "subscription_not_found" });
    }

    const payBaseUrl = process.env.PAY_BASE_URL?.replace(/\/+$/, "");
    if (!payBaseUrl) {
      return redirectToPortal(req, session_token, { error: "pay_base_url_missing" });
    }

    const successUrl = new URL(`/portal/${encodeURIComponent(session_token)}`, req.url);
    successUrl.searchParams.set("success", "payment_method_updated");

    const setup = await createCardSetupSession(supabase, {
      subscriptionId,
      customerId: portalSession.session.customer_id,
      merchantOrgId: portalSession.session.org_id,
      payBaseUrl,
      returnUrl: successUrl.toString(),
    });
    if (!setup.ok) {
      const error =
        setup.error === "subscription_not_found"
          ? "subscription_not_found"
          : "payment_method_update_start_failed";
      return redirectToPortal(req, session_token, { error });
    }

    // Keep the portal session alive for the return trip after the card form.
    await supabase
      .schema("payments")
      .from("customer_portal_sessions")
      .update({
        expires_at: getExtendedCustomerPortalSessionExpiry(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", portalSession.session.id);

    await writeCustomerPortalEvent(supabase, {
      portalSessionId: portalSession.session.id,
      orgId: portalSession.session.org_id,
      customerId: portalSession.session.customer_id,
      subscriptionId,
      eventType: "payment_method_update_started",
      payload: {
        providerId: "atmos",
        checkoutPublicToken: setup.publicToken,
        paymentIntentId: setup.paymentIntentId,
      },
    });

    await writePaymentLog(supabase, {
      type: "customer_portal",
      event: "payment_method.update_started",
      level: "info",
      orgId: portalSession.session.org_id,
      data: {
        portalSessionId: portalSession.session.id,
        customerId: portalSession.session.customer_id,
        subscriptionId,
        providerId: "atmos",
        checkoutPublicToken: setup.publicToken,
        paymentIntentId: setup.paymentIntentId,
      },
    });

    return NextResponse.redirect(setup.payUrl, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_method_update_start_failed";
    console.error("customer portal atmos card update start failed", { message, error });
    return redirectToPortal(req, session_token, { error: "payment_method_update_start_failed" });
  }
}
