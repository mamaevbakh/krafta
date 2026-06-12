import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import {
  loadAtmosCredentials,
  atmosBindInit,
  writePaymentDebugLog,
  AtmosError,
} from "@krafta/payments-core";

// Step 1 of the Atmos inline flow: take the card on pay.krafta.uz and start a
// card binding, which makes Atmos SMS a one-time code to the cardholder. We keep
// only the resulting bind transaction id on the attempt — never the PAN.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ public_token: string }> },
) {
  const supabase = createAdminSupabase();
  const { public_token } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const cardNumber = String(body.cardNumber ?? "").replace(/\D/g, "");
    const expiryDigits = String(body.expiry ?? "").replace(/\D/g, ""); // MMYY from the form

    if (cardNumber.length < 13 || cardNumber.length > 19 || expiryDigits.length !== 4) {
      return NextResponse.json({ error: "atmos_card_invalid" }, { status: 400 });
    }
    // Atmos expects expiry as YYmm; the form collects MM/YY.
    const atmosExpiry = `${expiryDigits.slice(2, 4)}${expiryDigits.slice(0, 2)}`;

    const { data: session, error: sessionErr } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .select("id, status, selected_provider_id, selected_attempt_id, payment_intent_id")
      .eq("public_token", public_token)
      .maybeSingle();
    if (sessionErr) throw sessionErr;
    if (!session) {
      return NextResponse.json({ error: "checkout_session_not_found" }, { status: 404 });
    }
    if (session.status !== "open") {
      return NextResponse.json({ error: "checkout_session_not_open" }, { status: 409 });
    }
    if (session.selected_provider_id !== "atmos" || !session.selected_attempt_id) {
      return NextResponse.json({ error: "atmos_not_selected" }, { status: 409 });
    }

    const { data: attempt, error: attemptErr } = await supabase
      .schema("payments")
      .from("payment_attempts")
      .select("id, org_provider_account_id, raw_init_response")
      .eq("id", session.selected_attempt_id)
      .maybeSingle();
    if (attemptErr) throw attemptErr;
    if (!attempt) {
      return NextResponse.json({ error: "payment_attempt_not_found" }, { status: 404 });
    }

    const creds = await loadAtmosCredentials(supabase, attempt.org_provider_account_id);
    const bind = await atmosBindInit(creds, { cardNumber, expiry: atmosExpiry });

    // Persist ONLY the bind transaction id (+ masked phone). No card data.
    await supabase
      .schema("payments")
      .from("payment_attempts")
      .update({
        status: "requires_action",
        raw_init_response: {
          attemptKind: "atmos_bind_init",
          bindTransactionId: bind.transactionId,
          phone: bind.phone ?? null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id);

    await writePaymentDebugLog(supabase, {
      scope: "atmos",
      event: "bind_init",
      providerId: "atmos",
      publicToken: public_token,
      paymentIntentId: session.payment_intent_id,
      paymentAttemptId: attempt.id,
      data: { otpSent: true },
    });

    return NextResponse.json({ otp_sent: true, phone: bind.phone ?? null });
  } catch (error) {
    const code =
      error instanceof AtmosError ? "atmos_card_invalid" : "atmos_pre_apply_failed";
    try {
      await writePaymentDebugLog(supabase, {
        scope: "atmos",
        event: "bind_init.error",
        level: "error",
        providerId: "atmos",
        publicToken: public_token,
        data: { error: code },
      });
    } catch {}
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
