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

  // Returns the numbers, not a sentence: the same rule renders inline on the
  // client in the merchant's language and as a JSON code on the server, so
  // English prose from here would be wrong in both places.
  it("reports what was expected and what arrived, not prose", () => {
    const result = validateTaxIdentity("305123456", "self_employed");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("length");
      expect(result.label).toBe("ПИНФЛ");
      expect(result.expected).toBe(14);
      expect(result.actual).toBe(9);
    }
  });

  it("distinguishes an empty field from a wrong-length one", () => {
    const empty = validateTaxIdentity("", "legal_entity");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("required");
  });

  it("rejects an empty value rather than passing it to the server", () => {
    expect(validateTaxIdentity("", "legal_entity").ok).toBe(false);
    expect(validateTaxIdentity("   ", "legal_entity").ok).toBe(false);
  });

  // Every key must exist in all three languages, or a merchant hits an English
  // string mid-sentence — the failure that makes i18n look broken.
  it("has no missing translations", async () => {
    const { PAY_MESSAGES } = await import("@/lib/locales/catalog");
    const englishKeys = Object.keys(PAY_MESSAGES.en);
    for (const locale of ["ru", "uz-Latn"] as const) {
      const missing = englishKeys.filter((key) => !PAY_MESSAGES[locale][key as never]);
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
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

describe("path alias resolution", () => {
  // Regression guard for the vitest config: modules live in BOTH ./src/lib and
  // ./lib, and an alias that only covers one silently breaks the other with an
  // error that reads like a missing npm package.
  it("resolves @/ imports from src and from the app root", async () => {
    const fromSrc = await import("@/lib/locales/catalog");
    const fromRoot = await import("@/lib/format");
    expect(Object.keys(fromSrc.PAY_MESSAGES)).toContain("ru");
    expect(typeof fromRoot.formatMinorAmount).toBe("function");
  });
});
