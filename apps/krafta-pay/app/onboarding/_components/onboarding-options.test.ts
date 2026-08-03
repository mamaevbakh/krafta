import { describe, it, expect } from "vitest";
import {
  BUSINESS_TYPE_KEYS,
  LEGAL_FORMS,
  normalizeTaxIdentity,
  validateTaxIdentity,
} from "./onboarding-options";

describe("tax identity", () => {
  it("strips the spaces and dashes merchants actually paste", () => {
    expect(normalizeTaxIdentity(" 305-123 456 ")).toBe("305123456");
    expect(normalizeTaxIdentity("305 1234 5678 901")).toBe("30512345678901");
  });

  // Legal form decides the identifier, and getting this backwards would write a
  // PINFL into a TIN field — which fiscalization rejects at charge time, long
  // after the merchant could connect it to anything they did.
  it("wants 9 digits from a legal entity and an individual entrepreneur", () => {
    for (const form of ["legal_entity", "individual_entrepreneur"] as const) {
      expect(LEGAL_FORMS[form].identityType).toBe("TIN");
      expect(validateTaxIdentity("305123456", form).ok).toBe(true);
      expect(validateTaxIdentity("30512345678901", form).ok).toBe(false);
    }
  });

  it("wants 14 digits from a self-employed person", () => {
    expect(LEGAL_FORMS.self_employed.identityType).toBe("PINFL");
    expect(validateTaxIdentity("30512345678901", "self_employed").ok).toBe(true);
    expect(validateTaxIdentity("305123456", "self_employed").ok).toBe(false);
  });

  it("says what is wrong AND what right looks like", () => {
    const result = validateTaxIdentity("305123456", "self_employed");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("14");
      expect(result.message).toContain("9");
    }
  });

  it("rejects an empty value rather than passing it to the server", () => {
    expect(validateTaxIdentity("", "legal_entity").ok).toBe(false);
    expect(validateTaxIdentity("   ", "legal_entity").ok).toBe(false);
  });

  // The keys are mirrored in a CHECK constraint on payments.org_profiles, so a
  // drift here is a runtime insert failure, not a type error.
  it("keeps the business type keys the database accepts", () => {
    expect(BUSINESS_TYPE_KEYS).toEqual([
      "telegram",
      "edtech",
      "saas",
      "fitness",
      "media",
      "services",
      "other",
    ]);
  });
});
