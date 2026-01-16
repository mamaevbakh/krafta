import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createCheckoutSession } from "@krafta/payments-core";

export async function POST(req: Request) {
  try {
    const supabase = createAdminSupabase();
    const body = await req.json();

    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      return NextResponse.json(
        { error: "PAY_BASE_URL is not set" },
        { status: 500 }
      );
    }

    if (!body?.orgId || !body?.amountMinor || !body?.currency) {
      return NextResponse.json(
        { error: "orgId, amountMinor, and currency are required" },
        { status: 400 }
      );
    }

    const result = await createCheckoutSession(
      supabase,
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
      payBaseUrl
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const err = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const message =
      err?.message ?? (typeof error === "string" ? error : "Unknown error");
    const payload = {
      error: message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    };
    console.error("checkout_sessions POST failed", payload);
    return NextResponse.json(payload, { status: 500 });
  }
}
