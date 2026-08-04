import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  getExtendedCustomerPortalSessionExpiry,
  resolveActiveCustomerPortalSession,
  writeCustomerPortalEvent,
} from "@/lib/customer-portal";
import {
  createCheckoutSession,
  selectProviderCreateAttempt,
  writePaymentLog,
} from "@krafta/payments-core";

function redirectToPortal(
  req: Request,
  rawToken: string,
  params?: Record<string, string>,
) {
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
    const requestedSubscriptionId = String(formData.get("subscriptionId") ?? "").trim() || null;

    let subscriptionId: string | null = null;
    let subscriptionEnvironment: "test" | "live" | null = null;
    if (requestedSubscriptionId) {
      const { data: subscription, error: subscriptionErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .select("id, environment")
        .eq("id", requestedSubscriptionId)
        .eq("org_id", portalSession.session.org_id)
        .eq("customer_id", portalSession.session.customer_id)
        .maybeSingle();
      if (subscriptionErr) throw subscriptionErr;
      if (!subscription) {
        return redirectToPortal(req, session_token, { error: "subscription_not_found" });
      }
      subscriptionId = subscription.id;
      subscriptionEnvironment = subscription.environment === "test" ? "test" : "live";
    }

    const payBaseUrl = process.env.PAY_BASE_URL?.replace(/\/+$/, "");
    if (!payBaseUrl) {
      return redirectToPortal(req, session_token, { error: "pay_base_url_missing" });
    }
    // From the record, never from a process global.
    //
    // This read `process.env.PAY_ENV ?? "live"` and then passed it only to
    // selectProviderCreateAttempt — createCheckoutSession below never received
    // it and fell back to defaultPayEnvironment(). So a card update for a TEST
    // subscription created a LIVE intent and a LIVE session on any production
    // deploy, and under BYOA "live" is a different set of the merchant's real
    // acquirer credentials, not a sandbox flag.
    //
    // The cast was unsound too: a PAY_ENV of anything other than test/live —
    // "production", a typo — passed straight through as a literal environment
    // value that matches no provider account and no CHECK constraint.
    //
    // A portal card update always belongs to a customer, and usually to a named
    // subscription. Both carry `environment`, so there is a real answer here.
    const { data: portalCustomer, error: portalCustomerErr } = await supabase
      .schema("payments")
      .from("customers")
      .select("environment")
      .eq("id", portalSession.session.customer_id)
      .maybeSingle();
    if (portalCustomerErr) throw portalCustomerErr;

    const environment: "test" | "live" =
      subscriptionEnvironment ??
      (portalCustomer?.environment === "test" ? "test" : "live");
    const portalBaseUrl = new URL(`/portal/${encodeURIComponent(session_token)}`, req.url);
    const successUrl = new URL(portalBaseUrl);
    successUrl.searchParams.set("success", "payment_method_updated");
    const cancelUrl = new URL(portalBaseUrl);
    cancelUrl.searchParams.set("error", "payment_method_update_canceled");

    const checkout = await createCheckoutSession(
      supabase,
      {
        orgId: portalSession.session.org_id,
        // Must match the value handed to selectProviderCreateAttempt below.
        environment,
        amountMinor: 0,
        currency: "UZS",
        description: "Customer portal payment method update",
        successUrl: successUrl.toString(),
        cancelUrl: cancelUrl.toString(),
        returnUrl: successUrl.toString(),
        customerId: portalSession.session.customer_id,
        metadata: {
          source: "customer_portal",
          customerPortal: {
            flowType: "payment_method_update",
            sessionId: portalSession.session.id,
            subscriptionId,
          },
          portalFlowType: "payment_method_update",
          portalSessionId: portalSession.session.id,
          portalSubscriptionId: subscriptionId,
        },
      },
      payBaseUrl,
    );

    const selection = await selectProviderCreateAttempt(
      supabase,
      {
        publicToken: checkout.publicToken,
        providerId: "uzum",
        viewType: "REDIRECT",
      },
      environment,
      payBaseUrl,
    );

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
        providerId: "uzum",
        checkoutPublicToken: checkout.publicToken,
        paymentIntentId: checkout.paymentIntentId,
        paymentAttemptId: selection.attemptId,
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
        providerId: "uzum",
        checkoutPublicToken: checkout.publicToken,
        paymentIntentId: checkout.paymentIntentId,
        paymentAttemptId: selection.attemptId,
      },
    });

    if (!selection.redirectUrl) {
      return redirectToPortal(req, session_token, { error: "payment_method_update_start_failed" });
    }
    return NextResponse.redirect(selection.redirectUrl, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "payment_method_update_start_failed";
    console.error("customer portal payment method update start failed", {
      message,
      error,
    });
    return redirectToPortal(req, session_token, { error: "payment_method_update_start_failed" });
  }
}

