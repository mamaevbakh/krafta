import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { authenticateMerchantApiKey } from "@/lib/api-keys";
import {
  generateCustomerPortalSessionToken,
  getCustomerPortalSessionExpiry,
  hashCustomerPortalSessionToken,
  normalizeCustomerPortalReturnUrl,
  writeCustomerPortalEvent,
} from "@/lib/customer-portal";
import { writePaymentLog } from "@krafta/payments-core";

type PortalFlowType =
  | "payment_method_update"
  | "subscription_cancel"
  | "subscription_update";

type CreatePortalSessionBody = {
  customerId?: string;
  customerOrgId?: string;
  customerUserRef?: string;
  returnUrl?: string;
  flowData?: {
    type?: PortalFlowType;
    subscriptionId?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "customer_portal_session_create_failed";
}

function isSupportedFlowType(value: unknown): value is PortalFlowType {
  return (
    value === "payment_method_update" ||
    value === "subscription_cancel" ||
    value === "subscription_update"
  );
}

export async function POST(req: Request) {
  const supabase = createAdminSupabase();
  try {
    const body = (await req.json()) as CreatePortalSessionBody;
    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      return NextResponse.json({ error: "PAY_BASE_URL is not set" }, { status: 500 });
    }

    const auth = await authenticateMerchantApiKey({
      supabase,
      authorizationHeader: req.headers.get("authorization"),
    });

    const customerOrgId = body?.customerOrgId ?? null;

    if (!body?.customerId && !customerOrgId) {
      return NextResponse.json(
        { error: "customerId or customerOrgId is required" },
        { status: 400 },
      );
    }

    const flowType = body.flowData?.type;
    if (flowType && !isSupportedFlowType(flowType)) {
      return NextResponse.json({ error: "unsupported_flow_type" }, { status: 400 });
    }

    let customerQuery = supabase
      .schema("payments")
      .from("customers")
      .select("id, org_id, customer_org_id, customer_user_ref, email")
      .eq("org_id", auth.merchantOrgId);

    if (body.customerId) {
      customerQuery = customerQuery.eq("id", body.customerId);
    } else {
      customerQuery = customerQuery.eq("customer_org_id", customerOrgId as string);
      if (body.customerUserRef) {
        customerQuery = customerQuery.eq("customer_user_ref", body.customerUserRef);
      }
    }

    const { data: customers, error: customerErr } = await customerQuery
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);
    if (customerErr) throw customerErr;
    const customer = (customers ?? [])[0] ?? null;
    if (!customer) {
      return NextResponse.json({ error: "customer_not_found" }, { status: 404 });
    }

    if (flowType && body.flowData?.subscriptionId) {
      const { data: subCheck, error: subCheckErr } = await supabase
        .schema("payments")
        .from("subscriptions")
        .select("id")
        .eq("id", body.flowData.subscriptionId)
        .eq("org_id", auth.merchantOrgId)
        .eq("customer_id", customer.id)
        .maybeSingle();
      if (subCheckErr) throw subCheckErr;
      if (!subCheck) {
        return NextResponse.json(
          { error: "subscription_not_found_for_customer" },
          { status: 404 },
        );
      }
    }

    const rawToken = generateCustomerPortalSessionToken();
    const tokenHash = hashCustomerPortalSessionToken(rawToken);
    const expiresAt = getCustomerPortalSessionExpiry();
    const returnUrl = normalizeCustomerPortalReturnUrl(body.returnUrl ?? null);

    const { data: session, error: sessionErr } = await (supabase.schema("payments") as any)
      .from("customer_portal_sessions")
      .insert({
        org_id: auth.merchantOrgId,
        customer_id: customer.id,
        token_hash: tokenHash,
        status: "created",
        return_url: returnUrl,
        flow_type: flowType ?? null,
        flow_data: body.flowData ?? {},
        metadata: {
          source: "merchant_api",
          api_key_id: auth.keyId,
          api_key_name: auth.name,
          customer_org_id: customer.customer_org_id,
          ...(body.metadata ?? {}),
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
        flowType: flowType ?? null,
        subscriptionId: body.flowData?.subscriptionId ?? null,
        portalSessionId: session.id,
        expiresAt: session.expires_at,
      },
    });

    await writeCustomerPortalEvent(supabase, {
      portalSessionId: session.id,
      orgId: auth.merchantOrgId,
      customerId: customer.id,
      subscriptionId: body.flowData?.subscriptionId ?? null,
      eventType: "session_created",
      payload: {
        flowType: flowType ?? null,
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
        expiresAt: session.expires_at,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = errorMessage(error);
    const status =
      message === "missing_api_key" ||
      message === "invalid_api_key" ||
      message === "invalid_api_key_format" ||
      message === "invalid_api_key_environment"
        ? 401
        : 500;
    console.error("v1 customer portal session create failed", { message, error });
    return NextResponse.json({ error: message }, { status });
  }
}
