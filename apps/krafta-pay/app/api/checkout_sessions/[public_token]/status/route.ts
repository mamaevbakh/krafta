import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ public_token: string }> }
) {
  try {
    const supabase = createAdminSupabase();
    const { public_token } = await params;

    const { data, error } = await supabase
      .schema("payments")
      .from("checkout_sessions")
      .select(
        [
          "id",
          "public_token",
          "status",
          "selected_provider_id",
          "selected_attempt_id",
          "payment_intent_id",
          "success_url",
          "cancel_url",
          "return_url",
          "updated_at",
          "payment_intents:payment_intent_id(status, amount_minor, currency, description, updated_at)",
          "payment_attempts:selected_attempt_id(status, provider_id, updated_at)",
        ].join(",")
      )
      .eq("public_token", public_token)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const session = data as any;

    const intent = (session as any).payment_intents as
      | {
          status: string;
          amount_minor: number;
          currency: string;
          description: string | null;
          updated_at: string;
        }
      | null
      | undefined;

    const attempt = (session as any).payment_attempts as
      | { status: string; provider_id: string; updated_at: string }
      | null
      | undefined;

    return NextResponse.json({
      checkoutSession: {
        id: session.id,
        publicToken: session.public_token,
        status: session.status,
        selectedProviderId: session.selected_provider_id,
        selectedAttemptId: session.selected_attempt_id,
        successUrl: session.success_url,
        cancelUrl: session.cancel_url,
        returnUrl: session.return_url,
        updatedAt: session.updated_at,
      },
      paymentIntent: intent
        ? {
            status: intent.status,
            amountMinor: intent.amount_minor,
            currency: intent.currency,
            description: intent.description,
            updatedAt: intent.updated_at,
          }
        : null,
      selectedAttempt: attempt
        ? {
            status: attempt.status,
            providerId: attempt.provider_id,
            updatedAt: attempt.updated_at,
          }
        : null,
    });
  } catch (error) {
    const err = error as { message?: string; code?: string; details?: string; hint?: string };
    const message = err?.message ?? (typeof error === "string" ? error : "Unknown error");
    console.error("checkout_session status GET failed", {
      error: message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
