import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createCheckoutSession } from "@krafta/payments-core";
import { authenticateMerchantApiKey } from "@/lib/api-keys";

export async function POST(req: Request) {
  const supabase = createAdminSupabase();

  // Require a merchant API key. orgId is derived from the authenticated key, so a
  // caller can never create checkout sessions (or capture card data, once Atmos
  // inline lands) under another merchant's organization.
  //
  // `environment` is derived from the key for the same reason, and it is the more
  // dangerous of the two to get wrong. This route used to drop it and let
  // createCheckoutSession fall back to defaultPayEnvironment(), which reads a
  // process-wide PAY_ENV — "live" in production. A merchant integrating with a
  // krp_test_ key therefore created a LIVE session and charged a real card
  // against their live acquirer while believing they were in test mode.
  let merchantOrgId: string;
  let environment: "test" | "live";
  try {
    const auth = await authenticateMerchantApiKey({
      supabase,
      authorizationHeader: req.headers.get("authorization"),
    });
    merchantOrgId = auth.merchantOrgId;
    environment = auth.environment;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      return NextResponse.json({ error: "configuration_error" }, { status: 500 });
    }

    if (!body?.amountMinor || !body?.currency) {
      return NextResponse.json(
        { error: "amountMinor and currency are required" },
        { status: 400 }
      );
    }

    const result = await createCheckoutSession(
      supabase,
      {
        orgId: merchantOrgId,
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
      payBaseUrl
    );

    // Echo the resolved environment, as the v1 subscription endpoint does. A
    // merchant who believes they are testing can check one field instead of
    // discovering the answer on their card statement.
    return NextResponse.json(
      { ...result, livemode: environment === "live" },
      { status: 201 },
    );
  } catch (error) {
    // Never echo provider/DB error internals (message/code/details/hint) to the
    // caller — they can leak schema or identifiers. Keep details server-side.
    console.error("checkout_sessions POST failed", error);
    return NextResponse.json(
      { error: "checkout_session_create_failed" },
      { status: 500 }
    );
  }
}
