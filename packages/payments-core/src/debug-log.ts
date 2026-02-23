type PaymentDebugLogInput = {
  type?: string;
  // Backward-compatible alias for older callsites.
  scope?: string;
  event: string;
  level?: "debug" | "info" | "warn" | "error";
  providerId?: string | null;
  orgId?: string | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  paymentAttemptId?: string | null;
  publicToken?: string | null;
  data?: Record<string, unknown> | null;
};

// Best-effort logger. It must never break the payment flow.
export async function writePaymentLog(
  supabase: any,
  input: PaymentDebugLogInput,
) {
  try {
    const logType = input.type ?? input.scope;
    if (!logType) return;

    await (supabase as any)
      .schema("payments")
      .from("logs")
      .insert({
        environment: process.env.PAY_ENV ?? null,
        level: input.level ?? "info",
        type: logType,
        event: input.event,
        provider_id: input.providerId ?? null,
        org_id: input.orgId ?? null,
        checkout_session_id: input.checkoutSessionId ?? null,
        payment_intent_id: input.paymentIntentId ?? null,
        payment_attempt_id: input.paymentAttemptId ?? null,
        public_token: input.publicToken ?? null,
        data: input.data ?? {},
      });
  } catch (error) {
    console.warn("payment log insert failed", {
      type: input.type ?? input.scope,
      event: input.event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Backward-compatible export used across current code paths.
export const writePaymentDebugLog = writePaymentLog;
