import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { authenticateMerchantApiKey } from "@/lib/api-keys";
import { createSubscriptionCheckout } from "@krafta/payments-core";

type CheckoutBody = {
  customerOrgId: string;
  planId: string;
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
  customerRef?: {
    email?: string;
    phone?: string;
    customerUserRef?: string;
  };
  metadata?: Record<string, unknown>;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "api_checkout_failed";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutBody;
    if (!body?.customerOrgId || !body?.planId) {
      return NextResponse.json(
        { error: "customerOrgId and planId are required" },
        { status: 400 },
      );
    }

    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      return NextResponse.json({ error: "PAY_BASE_URL is not set" }, { status: 500 });
    }

    const supabase = createAdminSupabase();
    const auth = await authenticateMerchantApiKey({
      supabase,
      authorizationHeader: req.headers.get("authorization"),
    });

    const result = await createSubscriptionCheckout(supabase, {
      merchantOrgId: auth.merchantOrgId,
      customerOrgId: body.customerOrgId,
      planId: body.planId,
      payBaseUrl,
      successUrl: body.successUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      returnUrl: body.returnUrl ?? null,
      customer: body.customerRef,
      metadata: {
        source: "merchant_api",
        api_key_id: auth.keyId,
        api_key_name: auth.name,
        ...(body.metadata ?? {}),
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = getErrorMessage(error);
    const status =
      message === "missing_api_key" ||
      message === "invalid_api_key" ||
      message === "invalid_api_key_format" ||
      message === "invalid_api_key_environment"
        ? 401
        : 500;

    console.error("v1 subscriptions checkout failed", { message, error });
    return NextResponse.json({ error: message }, { status });
  }
}
