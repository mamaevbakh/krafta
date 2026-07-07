import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import { createCheckoutSession } from "@krafta/payments-core";
import { resolvePayEnvironment } from "@/lib/providers/atmos-connect";

// Internal (HMAC-signed) one-off payment. The main Krafta app calls this to
// collect a storefront ORDER by card, on behalf of the merchant org. Unlike the
// public POST /api/checkout_sessions (which derives orgId from the caller's API
// key, always the caller's own org), this takes an explicit merchant `orgId` so
// one trusted server can create payments for many merchants — the BYOA model.

type Body = {
  orgId: string;
  amountMinor: number;
  currency: string;
  orderId?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
  customer?: { email?: string; phone?: string; customerUserRef?: string };
  metadata?: Record<string, unknown>;
};

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as Body;
    if (!body?.orgId || !body?.amountMinor || !body?.currency) {
      return NextResponse.json(
        { error: "orgId, amountMinor and currency are required" },
        { status: 400 },
      );
    }

    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      return NextResponse.json({ error: "PAY_BASE_URL is not set" }, { status: 500 });
    }

    const admin = createAdminSupabase();
    const environment = resolvePayEnvironment();

    // Fail fast if the merchant has not connected an active provider for this
    // environment — otherwise the customer would be redirected to a pay page
    // that can only report `provider_not_configured`.
    const { data: providerAccount, error: providerErr } = await admin
      .schema("payments")
      .from("org_provider_accounts")
      .select("id")
      .eq("org_id", body.orgId)
      .eq("provider_id", "atmos")
      .eq("environment", environment)
      .eq("status", "active")
      .maybeSingle();
    if (providerErr) throw providerErr;
    if (!providerAccount) {
      return NextResponse.json(
        { error: "provider_not_configured" },
        { status: 409 },
      );
    }

    const result = await createCheckoutSession(
      admin,
      {
        orgId: body.orgId,
        amountMinor: body.amountMinor,
        currency: body.currency,
        description: body.description,
        orderId: body.orderId,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
        returnUrl: body.returnUrl,
        customer: body.customer,
        metadata: body.metadata,
      },
      payBaseUrl,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("internal checkout_sessions POST failed", error);
    return NextResponse.json(
      { error: "checkout_session_create_failed" },
      { status: 500 },
    );
  }
}
