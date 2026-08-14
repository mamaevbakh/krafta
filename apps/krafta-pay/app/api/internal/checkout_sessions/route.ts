import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import { createCheckoutSession } from "@krafta/payments-core";
import {
  fallbackPayEnvironment,
  readRequestEnvironment,
} from "@/lib/checkout-environment";

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
  customer?: { name?: string; email?: string; phone?: string; customerUserRef?: string };
  metadata?: Record<string, unknown>;
  /**
   * Which set of the merchant's acquirer credentials to charge. The caller knows
   * this per merchant; we can only guess it from a deployment-wide variable.
   */
  environment?: "test" | "live";
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

    // ONE value, used for both the pre-flight and the session.
    //
    // This route used to resolve the provider account with resolvePayEnvironment()
    // — `PAY_ENV === "live" ? "live" : "test"` — and then omit `environment` from
    // createCheckoutSession entirely, letting it fall back to
    // defaultPayEnvironment(), which is the INVERSE: `PAY_ENV === "test" ? "test"
    // : "live"`. On any deploy where PAY_ENV is not exactly "live" the pre-flight
    // checked the merchant's TEST account and the session was then stamped LIVE.
    //
    // That is not a mismatched label. Under BYOA a row marked `test` holds the
    // merchant's own real Atmos credentials, so the two environments are two real
    // acquirer accounts — the pay page resolves the session's, and the customer is
    // charged through an account nobody checked was connected.
    //
    // The caller wins where it states one, because it knows which environment a
    // given merchant is on and we do not.
    const environment =
      readRequestEnvironment(body.environment) ?? fallbackPayEnvironment();

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
        // A storefront order — a one-off by construction. See the public
        // route for why this is hardcoded rather than taken from the body.
        cardBinding: "none",
        // Must be the same value the pre-flight above used. Omitting it is the
        // original bug.
        environment,
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
