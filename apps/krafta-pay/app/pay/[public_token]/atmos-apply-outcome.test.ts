import { describe, it, expect } from "vitest";
import { resolveApplyOutcome, errorMessageKey } from "./atmos-apply-outcome";
import { PAY_MESSAGES } from "@/lib/locales/catalog";

describe("resolveApplyOutcome", () => {
  // The P1 regression: a DECLINED first subscription charge comes back from the
  // apply route as HTTP 200 { ok: true, status: "failed" } — no transport error,
  // nothing collected. The OTP step must NOT render the success screen for it.
  it("treats a declined charge (ok:true, status:'failed') as a decline error", () => {
    const outcome = resolveApplyOutcome({ ok: true, status: "failed" });
    expect(outcome).toEqual({ kind: "error", code: "atmos_charge_declined" });
  });

  it("shows success ONLY for an explicit succeeded status", () => {
    expect(resolveApplyOutcome({ ok: true, status: "succeeded" })).toEqual({
      kind: "success",
    });
  });

  // Any non-succeeded status is a decline — never a false success. "processing"
  // shouldn't occur for the synchronous inline flow, but if it ever did we still
  // must not claim the money was collected.
  it("does not claim success for a missing or unexpected status", () => {
    expect(resolveApplyOutcome({ ok: true }).kind).toBe("error");
    expect(resolveApplyOutcome({ ok: true, status: "processing" }).kind).toBe("error");
  });

  it("surfaces a transport/route error code (ok:false) for the OTP step", () => {
    expect(resolveApplyOutcome({ ok: false, error: "network_error" })).toEqual({
      kind: "error",
      code: "network_error",
    });
    // A hardened route may return { ok:false, error:"atmos_charge_declined" }.
    expect(resolveApplyOutcome({ ok: false, error: "atmos_charge_declined" })).toEqual({
      kind: "error",
      code: "atmos_charge_declined",
    });
  });

  it("falls back to a generic apply-failed code when ok:false carries no error", () => {
    expect(resolveApplyOutcome({ ok: false })).toEqual({
      kind: "error",
      code: "atmos_apply_failed",
    });
  });
});

describe("errorMessageKey", () => {
  it("gives declined charges honest, actionable copy — not the generic fallback", () => {
    const declined = errorMessageKey("atmos_charge_declined");
    expect(declined).not.toBe(errorMessageKey("some_unknown_code"));
  });

  it("names insufficient funds specifically, so the customer knows to use another card", () => {
    expect(errorMessageKey("atmos_insufficient_funds")).toBe(
      "checkout.error.insufficientFunds",
    );
  });

  it("falls back to a generic failure for a code we have never seen", () => {
    // A new provider code must still leave the customer with a next step,
    // never a blank error.
    expect(errorMessageKey("brand_new_code")).toBe("checkout.error.generic");
    expect(errorMessageKey(undefined)).toBe("checkout.error.generic");
  });

  it("has real copy in every language for every code it can return", () => {
    // The whole point of returning a key: a Russian-speaking customer at a
    // checkout must not be handed an English decline. This fails if any locale
    // is missing a key or left it as the English string.
    const codes = [
      "network_error",
      "atmos_temporary_error",
      "atmos_card_invalid",
      "atmos_otp_invalid",
      "atmos_insufficient_funds",
      "atmos_charge_declined",
      "anything_unknown",
    ];
    for (const code of codes) {
      const key = errorMessageKey(code);
      const en = PAY_MESSAGES.en[key];
      const ru = PAY_MESSAGES.ru[key];
      const uz = PAY_MESSAGES["uz-Latn"][key];
      for (const value of [en, ru, uz]) {
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
      }
      expect(ru).not.toBe(en);
      expect(uz).not.toBe(en);
      // Cyrillic in the Russian copy — catches a key quietly left in English.
      expect(ru).toMatch(/[\u0400-\u04FF]/);
    }
  });
});
