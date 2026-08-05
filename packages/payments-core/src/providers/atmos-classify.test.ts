import { describe, expect, it } from "vitest";

import { AtmosError, classifyAtmosFailure } from "./atmos";

const atmosError = (code: string) =>
  new AtmosError("atmos_failed", { result: { code, description: "x" } } as never);

/**
 * Telling "the bank refused the card" apart from "we do not know what happened"
 * is worth money in both directions.
 *
 * Treat a decline as unknown and the payment is left in limbo: the reconciler
 * will not touch what it cannot prove, a settled intent cannot be paid again,
 * and the customer is told "we couldn't complete the payment" when their card
 * simply had no money on it.
 *
 * Treat an unknown as a decline and we could release an intent whose money
 * actually moved, and charge someone twice.
 */
describe("classifyAtmosFailure", () => {
  it("calls insufficient funds a decline", () => {
    // STPIMS-ERR-112 — "Недостаточно средств на балансе карты". Seen in
    // production, classified as `other`, which is what stranded the payment.
    expect(classifyAtmosFailure(atmosError("STPIMS-ERR-112"))).toBe("declined");
  });

  it("matches the bare code as well as a partner-prefixed one", () => {
    expect(classifyAtmosFailure(atmosError("ERR-112"))).toBe("declined");
  });

  it("keeps a bad card number separate from a decline", () => {
    // Different remedy: re-type the card vs use a different card.
    expect(classifyAtmosFailure(atmosError("STPIMS-ERR-009"))).toBe("card_invalid");
  });

  it("keeps an Atmos glitch retryable, and never a decline", () => {
    // ERR-001 is their internal error. Blaming the customer's card for it, or
    // releasing the intent on it, would both be wrong.
    expect(classifyAtmosFailure(atmosError("STPIMS-ERR-001"))).toBe("temporary");
  });

  it("treats an unknown code as unknown, not as a decline", () => {
    // THE SAFETY DIRECTION. Only codes we positively recognise may release an
    // intent; anything else stays cautious so a real charge cannot be hidden.
    expect(classifyAtmosFailure(atmosError("STPIMS-ERR-118"))).toBe("other");
    expect(classifyAtmosFailure(atmosError("SOMETHING-NEW"))).toBe("other");
  });

  it("treats a transport failure as temporary — the gateway, never the card", () => {
    expect(classifyAtmosFailure(new Error("fetch failed"))).toBe("temporary");
    expect(classifyAtmosFailure(atmosError(""))).toBe("temporary");
  });
});
