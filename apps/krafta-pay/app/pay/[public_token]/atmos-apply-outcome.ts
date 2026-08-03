// Pure decision + copy helpers for the Atmos inline card form, split out of the
// client component so the money-critical "did the charge actually succeed?"
// logic is unit-testable without a DOM/React runtime (mirrors the narrow vitest
// carve-out in apps/krafta — the one bug class that's damaging if shipped wrong).

// The apply() seam result the OTP-confirm step acts on.
export type ApplyResult = { ok: boolean; status?: string; error?: string };

export type ApplyOutcome =
  | { kind: "success" }
  | { kind: "error"; code: string };

// Decide what the OTP-confirm step does from the apply() result.
//
// CRITICAL (P1): a first subscription charge that Atmos DECLINES comes back as
// { ok: true, status: "failed" } — HTTP 200, no transport error, but nothing
// was collected and the subscription stays incomplete. Success must be shown
// ONLY for an explicit "succeeded"; every other status (a decline, or a missing
// status) is a decline. Reading only `ok` here was the bug that rendered
// "Your subscription is active" on a declined charge.
export function resolveApplyOutcome(result: ApplyResult): ApplyOutcome {
  if (!result.ok) {
    return { kind: "error", code: result.error ?? "atmos_apply_failed" };
  }
  if (result.status === "succeeded") {
    return { kind: "success" };
  }
  return { kind: "error", code: "atmos_charge_declined" };
}

// Map provider/transport error codes to concrete, actionable copy (DESIGN.md:
// "Generic 'Invalid input' violates this system").
export function errorMessage(code?: string) {
  switch (code) {
    case "network_error":
      return "Connection problem. Check your internet and try again.";
    case "atmos_temporary_error":
      return "Something went wrong on the payment network. Please try again.";
    case "atmos_card_invalid":
    case "invalid_card":
      return "That card number or expiry doesn't look right. Please re-check it.";
    case "atmos_otp_invalid":
    case "invalid_otp":
      return "That code didn't match. Re-enter the code from the SMS.";
    case "atmos_insufficient_funds":
      return "The payment was declined for insufficient funds.";
    case "atmos_charge_declined":
      return "Your card was declined. No payment was taken — please try another card.";
    default:
      return "We couldn't complete the payment. Please try again.";
  }
}
