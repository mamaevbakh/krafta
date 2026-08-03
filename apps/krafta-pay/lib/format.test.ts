import { describe, it, expect } from "vitest";
import { formatMinorAmount, majorInputToMinor, minorToMajorInput } from "./format";

describe("price input conversion", () => {
  // The form used to ask for "Amount minor". A merchant typing the price they
  // actually charge would have created a plan for 1/100th of it — a silent
  // undercharge that only shows up on the first invoice.
  it("round-trips a stored amount back to what the merchant typed", () => {
    for (const minor of [99000, 5000000, 25000000, 100, 1]) {
      expect(majorInputToMinor(minorToMajorInput(minor))).toBe(minor);
    }
  });

  it("reads a plan the merchant priced at 990 sum as 990, not 99000", () => {
    expect(minorToMajorInput(99000)).toBe("990");
    expect(majorInputToMinor("990")).toBe(99000);
  });

  // UZS has no circulating subunit, but the column still stores major×100 —
  // so the conversion must hold for every currency, not just decimal ones.
  it("keeps the major×100 invariant for UZS", () => {
    expect(majorInputToMinor("50000")).toBe(5000000);
    expect(formatMinorAmount(5000000, "UZS")).toBe("50,000 UZS");
  });

  it("accepts the separators merchants actually type", () => {
    expect(majorInputToMinor("50 000")).toBe(5000000);
    expect(majorInputToMinor("50000")).toBe(5000000);
    expect(majorInputToMinor("990.50")).toBe(99050);
    expect(majorInputToMinor("990,50")).toBe(99050);
  });

  it("reports garbage as NaN rather than silently pricing something at 0", () => {
    expect(Number.isNaN(majorInputToMinor("abc"))).toBe(true);
    expect(Number.isNaN(majorInputToMinor(""))).toBe(false); // "" is 0, an explicit free plan
  });

  it("does not lose a half-tiyin to floating point", () => {
    // 0.1 * 100 is 10.000000000000002 in IEEE754; rounding is not optional.
    expect(majorInputToMinor("0.1")).toBe(10);
    expect(majorInputToMinor("19.99")).toBe(1999);
  });
});
