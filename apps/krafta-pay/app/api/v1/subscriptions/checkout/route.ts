import { NextResponse } from "next/server";
import { createSubscriptionCheckout } from "@krafta/payments-core";
import {
  V1Error,
  authenticateV1,
  optionalString,
  readJsonBody,
  requireString,
  v1ErrorResponse,
} from "@/lib/v1";

/**
 * Create (or resume) a subscription checkout and return a hosted pay URL.
 *
 * Customer identity accepts either shape:
 *
 *   `customer.externalId`  — the merchant's own id for the subscriber. What
 *                            every merchant other than Krafta uses.
 *   `customerOrgId`        — a Krafta organization uuid. Krafta's own billing
 *                            integration; predates the external-id model and
 *                            keeps working unchanged.
 *
 * Exactly one is required. `customerOrgId` used to be mandatory, which made the
 * whole API unusable for a merchant whose subscribers are not Krafta orgs. The
 * documented escape hatch (omit it) silently created a duplicate customer and a
 * duplicate subscription on every call, so in practice there was no escape.
 */

type CheckoutBody = {
  customerOrgId?: string;
  /** Per-catalog billing scope. Krafta-specific; stored on the subscription. */
  catalogId?: string;
  planId?: string;
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
  customer?: {
    externalId?: string;
    email?: string;
    phone?: string;
    customerUserRef?: string;
  };
  metadata?: Record<string, unknown>;
};

export async function POST(req: Request) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const body = (await readJsonBody(req)) as CheckoutBody;

    const planId = requireString(body.planId, "planId");
    const customerOrgId = optionalString(body.customerOrgId);
    const customerExternalId = optionalString(body.customer?.externalId);

    if (!customerOrgId && !customerExternalId) {
      throw new V1Error(
        "parameter_missing",
        400,
        "Provide `customer.externalId` (your own id for this subscriber) or `customerOrgId`.",
      );
    }

    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      throw new V1Error("configuration_error", 500, "PAY_BASE_URL is not configured.");
    }

    const result = await createSubscriptionCheckout(supabase, {
      merchantOrgId: auth.merchantOrgId,
      customerOrgId,
      customerExternalId,
      planId,
      payBaseUrl,
      environment: auth.environment,
      successUrl: optionalString(body.successUrl),
      cancelUrl: optionalString(body.cancelUrl),
      returnUrl: optionalString(body.returnUrl),
      customer: body.customer,
      metadata: {
        source: "merchant_api",
        api_key_id: auth.keyId,
        api_key_name: auth.name,
        ...(optionalString(body.catalogId) ? { catalog_id: body.catalogId } : {}),
        ...(body.metadata ?? {}),
      },
    });

    return NextResponse.json({ ...result, livemode: auth.environment === "live" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    // Domain errors thrown from payments-core carry a stable code but no HTTP
    // status. Map the ones a merchant can act on, so they see "that plan is
    // inactive" instead of an opaque 500.
    if (message === "plan_not_found") {
      return NextResponse.json(
        {
          error: {
            type: "not_found_error",
            code: "plan_not_found",
            message: "No plan with that id exists on your account.",
          },
        },
        { status: 404 },
      );
    }
    if (message === "plan_inactive") {
      return NextResponse.json(
        {
          error: {
            type: "invalid_request_error",
            code: "plan_inactive",
            message: "That plan is archived and cannot accept new subscriptions.",
          },
        },
        { status: 400 },
      );
    }

    return v1ErrorResponse(error);
  }
}
