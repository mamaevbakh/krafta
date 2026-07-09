import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyInternalRequest } from "@/lib/internal-auth";
import { assertMemberOrThrow } from "@/lib/internal-subscription";
import { createCardSetupSession } from "@/lib/card-setup";

/**
 * Start an Atmos card-change for a subscription. Returns a pay.krafta.uz URL
 * hosting the inline Atmos card form in card_update ("setup") mode — the
 * cardholder enters a new card + one OTP, and the apply route binds it and sets
 * it as the renewal default WITHOUT charging. This is the Atmos twin of the
 * portal's (Uzum-only) payment-method update.
 */
type ChangeCardBody = {
  customerOrgId?: string;
  subscriptionId?: string;
  returnUrl?: string;
  initiatedByUserId?: string;
};

export async function POST(req: Request) {
  const supabase = createAdminSupabase();
  try {
    const rawBody = await req.text();
    verifyInternalRequest({
      rawBody,
      timestampHeader: req.headers.get("x-krafta-timestamp"),
      signatureHeader: req.headers.get("x-krafta-signature"),
    });

    const body = JSON.parse(rawBody) as ChangeCardBody;
    const customerOrgId = body?.customerOrgId?.trim();
    const subscriptionId = body?.subscriptionId?.trim();
    if (!customerOrgId || !subscriptionId) {
      return NextResponse.json(
        { error: "customerOrgId and subscriptionId are required" },
        { status: 400 },
      );
    }

    const payBaseUrl = process.env.PAY_BASE_URL;
    if (!payBaseUrl) {
      return NextResponse.json({ error: "PAY_BASE_URL is not set" }, { status: 500 });
    }

    await assertMemberOrThrow(supabase, {
      orgId: customerOrgId,
      userId: body.initiatedByUserId,
    });

    const result = await createCardSetupSession(supabase, {
      subscriptionId,
      customerOrgId,
      payBaseUrl,
      returnUrl: body.returnUrl ?? null,
    });
    if (!result.ok) {
      const status = result.error === "subscription_not_found" ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(
      { ok: true, payUrl: result.payUrl, publicToken: result.publicToken },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "change_card_failed";
    const status =
      message === "forbidden"
        ? 403
        : message.startsWith("missing_") ||
            message.startsWith("invalid_") ||
            message.startsWith("signature_")
          ? 401
          : 500;
    if (status === 500) {
      console.error("internal subscription change-card failed", { message });
    }
    return NextResponse.json({ error: message }, { status });
  }
}
