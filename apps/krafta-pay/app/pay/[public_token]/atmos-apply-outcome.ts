// Pure decision + copy helpers for the Atmos inline card form, split out of the
// client component so the money-critical "did the charge actually succeed?"
// logic is unit-testable without a DOM/React runtime (mirrors the narrow vitest
// carve-out in apps/krafta — the one bug class that's damaging if shipped wrong).

import type { PayMessageKey } from "@/lib/locales/catalog";

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
//
// Returns a catalog KEY, not a sentence. These are read by a customer standing
// at a checkout, and this product's default language is Russian — an English
// decline message is no more useful to them than no message. Returning the key
// keeps this function pure and testable while the wording, and its Russian and
// Uzbek, live with every other string in the catalog.
export function errorMessageKey(code?: string): PayMessageKey {
  switch (code) {
    case "network_error":
      return "checkout.error.network";
    case "atmos_temporary_error":
      return "checkout.error.temporary";
    case "atmos_card_invalid":
    case "invalid_card":
      return "checkout.error.cardInvalid";
    case "atmos_otp_invalid":
    case "invalid_otp":
      return "checkout.error.otpInvalid";
    case "atmos_insufficient_funds":
      return "checkout.error.insufficientFunds";
    case "atmos_charge_declined":
      return "checkout.error.declined";
    default:
      // Anything we have not seen before is still a failed payment, and the
      // customer is still owed a next step.
      return "checkout.error.generic";
  }
}
