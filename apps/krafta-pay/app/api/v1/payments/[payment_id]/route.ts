import { NextResponse } from "next/server";

import { V1Error, authenticateV1, v1ErrorResponse } from "@/lib/v1";
import {
  PAYMENT_INTENT_COLUMNS,
  serializePayment,
  type PaymentAttemptRecord,
  type PaymentIntentRecord,
} from "@/lib/v1-payments";

/**
 * Retrieve one payment.
 *
 * `payment_id` is the `paymentIntentId` returned by
 * `POST /api/checkout_sessions` — the id a merchant already stored at create
 * time, so this needs nothing new persisted on their side.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ payment_id: string }> },
) {
  try {
    const { supabase, auth } = await authenticateV1(req);
    const { payment_id: paymentId } = await params;

    const { data: intent, error } = await supabase
      .schema("payments")
      .from("payment_intents")
      .select(PAYMENT_INTENT_COLUMNS)
      .eq("id", paymentId)
      // Scoped, not filtered afterwards. A payment belonging to another merchant
      // must be indistinguishable from one that does not exist — anything else
      // turns this into an oracle over other merchants' ids.
      .eq("org_id", auth.merchantOrgId)
      .eq("environment", auth.environment)
      .maybeSingle();
    if (error) throw error;
    if (!intent) {
      throw new V1Error("payment_not_found", 404, "No payment with that id.");
    }

    // A subscription charge is not a `payment` object. It is reachable through
    // /api/v1/subscriptions, which carries the invoice and period context this
    // shape has nowhere to put.
    const { data: invoice, error: invoiceErr } = await supabase
      .schema("payments")
      .from("invoices")
      .select("id")
      .eq("payment_intent_id", paymentId)
      .maybeSingle();
    if (invoiceErr) throw invoiceErr;
    if (invoice) {
      throw new V1Error(
        "payment_not_found",
        404,
        "That id belongs to a subscription charge. Use /v1/subscriptions.",
      );
    }

    const { data: attemptRows, error: attemptsErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("payment_intent_id, status, provider_id, provider_payment_id, updated_at")
      .eq("payment_intent_id", paymentId)
      .order("created_at", { ascending: false });
    if (attemptsErr) throw attemptsErr;

    return NextResponse.json(
      serializePayment(
        intent as unknown as PaymentIntentRecord,
        (attemptRows ?? []) as unknown as PaymentAttemptRecord[],
        auth.environment === "live",
      ),
    );
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
