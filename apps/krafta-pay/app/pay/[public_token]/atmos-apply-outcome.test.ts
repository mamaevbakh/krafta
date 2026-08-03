import { describe, it, expect } from "vitest";
import { resolveApplyOutcome, errorMessage } from "./atmos-apply-outcome";

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

describe("errorMessage", () => {
  it("gives declined charges honest, actionable copy — not the generic fallback", () => {
    const declined = errorMessage("atmos_charge_declined");
    expect(declined).not.toBe(errorMessage("some_unknown_code"));
    expect(declined.toLowerCase()).toContain("declined");
  });
});
