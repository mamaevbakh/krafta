import { NextResponse } from "next/server";
import {
  V1Error,
  authenticateV1,
  optionalString,
  readJsonBody,
  v1ErrorResponse,
} from "@/lib/v1";
import {
  generateCustomerPortalSessionToken,
  getCustomerPortalSessionExpiry,
  hashCustomerPortalSessionToken,
  normalizeCustomerPortalReturnUrl,
  writeCustomerPortalEvent,
} from "@/lib/customer-portal";
import { writePaymentLog } from "@krafta/payments-core";

/**
 * Mint a hosted portal session for one of the merchant's customers.
 *
 * The portal is where a card gets changed and a subscription gets cancelled, so
 * who this route is willing to open one for is a security decision, not a
 * lookup.
 *
 * IT USED TO FILTER `org_id` AND NOT `environment`. That is the whole bug: a
 * `krp_test_` key could name a LIVE customer and receive a working portal URL
 * for them. Test keys are the ones merchants paste into shared docs, staging
 * config and support threads — they are meant to be the harmless half — and
 * this route turned one into a way to reach a paying customer's real
 * subscription. Every read below now goes through the v1 wrapper's `auth`,
 * which carries the environment the key was minted for.
 */

type PortalFlowType =
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update";

function isSupportedFlowType(value: unknown): value is PortalFlowType {
  return (
    value === "payment_method_update" ||
    value === "subscription_cancel" ||
    value === "subscription_update"
  );
}

type CustomerRow = {
  id: string;
  org_id: string;
  customer_org_id: string | null;
  customer_user_ref: string | null;
  email: string | null;
};

export async function POST(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const body = await readJsonBody(req);

    const payBaseUrl = process.env.PAY_BASE_URL;
    // Our misconfiguration, not the merchant's mistake — so it becomes an
    // opaque 500 through the wrapper rather than naming an env var on their
    // terminal.
    if (!payBaseUrl) throw new Error("PAY_BASE_URL is not set");

    const customerId = optionalString(body.customerId);
    const customerOrgId = optionalString(body.customerOrgId);
    const customerUserRef = optionalString(body.customerUserRef);

    if (!customerId && !customerOrgId) {
      throw new V1Error(
        "parameter_missing",
        400,
        "`customerId` or `customerOrgId` is required.",
      );
    }

    const flowData = (body.flowData ?? {}) as {
      type?: unknown;
      subscriptionId?: unknown;
    };
    const flowType = flowData.type;
    if (flowType !== undefined && !isSupportedFlowType(flowType)) {
      throw new V1Error(
        "unsupported_flow_type",
        400,
        "`flowData.type` must be payment_method_update, subscription_cancel or subscription_update.",
      );
    }
    const subscriptionId = optionalString(flowData.subscriptionId);

    let customerQuery = supabase
      .schema("payments")
      .from("customers")
      .select("id, org_id, customer_org_id, customer_user_ref, email")
      .eq("org_id", auth.merchantOrgId)
      // THE FIX. Without this a test key resolves live customers.
      .eq("environment", auth.environment);

    if (customerId) {
      customerQuery = customerQuery.eq("id", customerId);
    } else {
      customerQuery = customerQuery.eq("customer_org_id", customerOrgId as string);
      if (customerUserRef) {
        customerQuery = customerQuery.eq("customer_user_ref", customerUserRef);
      }
    }

    const { data: customers, error: customerErr } = await customerQuery
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);
    if (customerErr) throw customerErr;

    const customer = ((customers ?? [])[0] ?? null) as CustomerRow | null;
    /*
      A live customer addressed with a test key lands here, and it says exactly
      what a customer id that never existed says. That is deliberate and it is
      the house rule everywhere in Krafta: a distinct "wrong environment" error
      would confirm the customer exists, which turns this endpoint into an
      oracle over the merchant's real customer list.
    */
    if (!customer) {
      throw new V1Error("customer_not_found", 404, "No such customer.");
    }

    if (isSupportedFlowType(flowType) && subscriptionId) {
      const { data: subCheck, error: subCheckErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .select("id")
        .eq("id", subscriptionId)
        .eq("org_id", auth.merchantOrgId)
        .eq("environment", auth.environment)
        .eq("customer_id", customer.id)
        .maybeSingle();
      if (subCheckErr) throw subCheckErr;
      if (!subCheck) {
        throw new V1Error(
          "subscription_not_found",
          404,
          "No such subscription for this customer.",
        );
      }
    }

    const rawToken = generateCustomerPortalSessionToken();
    const tokenHash = hashCustomerPortalSessionToken(rawToken);
    const expiresAt = getCustomerPortalSessionExpiry();
    const returnUrl = normalizeCustomerPortalReturnUrl(
      optionalString(body.returnUrl),
    );

    const { data: session, error: sessionErr } = await (
      supabase.schema("payments") as any
    )
      .from("customer_portal_sessions")
      .insert({
        org_id: auth.merchantOrgId,
        customer_id: customer.id,
        token_hash: tokenHash,
        status: "created",
        return_url: returnUrl,
        flow_type: isSupportedFlowType(flowType) ? flowType : null,
        flow_data: body.flowData ?? {},
        metadata: {
          source: "merchant_api",
          api_key_id: auth.keyId,
          api_key_name: auth.name,
          // `customer_portal_sessions` has no environment column. Recording it
          // here means a support thread about a portal session can answer
          // "which key opened this" without re-reading the customer.
          environment: auth.environment,
          customer_org_id: customer.customer_org_id,
          ...((body.metadata as Record<string, unknown> | undefined) ?? {}),
        },
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (sessionErr) throw sessionErr;

    const portalUrl = `${payBaseUrl.replace(/\/+$/, "")}/portal/${encodeURIComponent(rawToken)}`;

    await writePaymentLog(supabase, {
      type: "customer_portal",
      event: "session.created",
      level: "info",
      orgId: auth.merchantOrgId,
      data: {
        customerId: customer.id,
        customerOrgId: customer.customer_org_id ?? null,
        environment: auth.environment,
        flowType: isSupportedFlowType(flowType) ? flowType : null,
        subscriptionId,
        portalSessionId: session.id,
        expiresAt: session.expires_at,
      },
    });

    await writeCustomerPortalEvent(supabase, {
      portalSessionId: session.id,
      orgId: auth.merchantOrgId,
      customerId: customer.id,
      subscriptionId,
      eventType: "session_created",
      payload: {
        flowType: isSupportedFlowType(flowType) ? flowType : null,
        environment: auth.environment,
        customerOrgId: customer.customer_org_id ?? null,
        customerUserRef: customer.customer_user_ref ?? null,
        apiKeyId: auth.keyId,
      },
    });

    return NextResponse.json(
      {
        id: session.id,
        object: "customer_portal.session",
        url: portalUrl,
        livemode: auth.environment === "live",
        expiresAt: session.expires_at,
      },
      { status: 201 },
    );
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
