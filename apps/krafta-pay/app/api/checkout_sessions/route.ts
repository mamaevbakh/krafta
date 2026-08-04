import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createCheckoutSession } from "@krafta/payments-core";
import { authenticateMerchantApiKey } from "@/lib/api-keys";
import {
  beginIdempotent,
  readIdempotencyKey,
  releaseIdempotencyClaim,
} from "@/lib/idempotency";
import { V1Error } from "@/lib/v1";

const ENDPOINT = "POST /api/checkout_sessions";

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

  let idempotencyKey: string | null = null;
  try {
    const body = await req.json();
    idempotencyKey = readIdempotencyKey(req);

    // Opt-in: with no Idempotency-Key header this is byte-identical to before,
    // which is what makes it safe to ship ahead of anyone using it.
    //
    // With one, the claim is taken BEFORE any work. A retry that arrives while
    // the first request is still running is answered 409 rather than allowed to
    // mint a second payment intent, a second session and a second payUrl for one
    // order — which is what a Medusa backend retrying on timeout would otherwise
    // produce, with nothing linking the two.
    const idem = await beginIdempotent<Record<string, unknown>>(supabase, {
      key: idempotencyKey,
      orgId: merchantOrgId,
      environment,
      endpoint: ENDPOINT,
      body,
    });

    if (idem.kind === "replay") {
      return NextResponse.json(idem.body as Record<string, unknown>, {
        status: idem.status,
        headers: { "Idempotent-Replay": "true" },
      });
    }

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
    const payload = { ...result, livemode: environment === "live" };
    if (idem.kind === "fresh") await idem.complete(201, payload);

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    // A claim whose handler threw must not answer 409 to the retry of something
    // that never happened.
    await releaseIdempotencyClaim(supabase, {
      key: idempotencyKey,
      orgId: merchantOrgId,
      environment,
      endpoint: ENDPOINT,
    });

    if (error instanceof V1Error) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }

    // Never echo provider/DB error internals (message/code/details/hint) to the
    // caller — they can leak schema or identifiers. Keep details server-side.
    console.error("checkout_sessions POST failed", error);
    return NextResponse.json(
      { error: "checkout_session_create_failed" },
      { status: 500 }
    );
  }
}
