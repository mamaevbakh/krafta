import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import { createSubscriptionCheckout } from "@krafta/payments-core";

type InternalCheckoutBody = {
  merchantOrgId: string;
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
  catalogContext?: Record<string, unknown>;
  initiatedByUserId?: string;
};

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as InternalCheckoutBody;
    if (!body?.merchantOrgId || !body?.customerOrgId || !body?.planId) {
      return NextResponse.json(
        { error: "merchantOrgId, customerOrgId, and planId are required" },
        { status: 400 },
      );
    }

    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      return NextResponse.json({ error: "PAY_BASE_URL is not set" }, { status: 500 });
    }

    const supabase = createAdminSupabase();

    if (body.initiatedByUserId) {
      const { data: membership, error: membershipErr } = await supabase
        .from("organization_members")
        .select("id")
        .eq("org_id", body.customerOrgId)
        .eq("user_id", body.initiatedByUserId)
        .maybeSingle();
      if (membershipErr) throw membershipErr;
      if (!membership) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }

    const result = await createSubscriptionCheckout(supabase, {
      merchantOrgId: body.merchantOrgId,
      customerOrgId: body.customerOrgId,
      planId: body.planId,
      payBaseUrl,
      successUrl: body.successUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      returnUrl: body.returnUrl ?? null,
      customer: body.customerRef,
      metadata: {
        source: "krafta_internal_upgrade",
        ...(body.catalogContext ?? {}),
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "internal_checkout_failed";
    console.error("internal subscription checkout failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
