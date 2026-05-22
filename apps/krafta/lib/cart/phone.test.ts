import { describe, expect, it } from "vitest";

import { isValidUzPhone, normalizeUzPhone } from "./phone";

// These cases pin S7 behavior: the storefront pins "+998" as a locked
// addon, so the typical input is just the 9-digit local part. The
// helper also tolerates customers who paste the full international
// form (with or without the leading "+"), and ignores formatting
// characters (spaces, dashes, parentheses) so paste-from-anywhere works.
describe("normalizeUzPhone", () => {
  it("accepts the bare 9-digit local part", () => {
    expect(normalizeUzPhone("901234567")).toBe("+998901234567");
  });

  it("accepts the 9-digit local part with spaces and dashes", () => {
    expect(normalizeUzPhone("90 123 45 67")).toBe("+998901234567");
    expect(normalizeUzPhone("90-123-45-67")).toBe("+998901234567");
  });

  it("accepts +998 + 9 digits", () => {
    expect(normalizeUzPhone("+998901234567")).toBe("+998901234567");
  });

  it("accepts 998 + 9 digits without the plus", () => {
    expect(normalizeUzPhone("998901234567")).toBe("+998901234567");
  });

  it("strips parentheses and other punctuation", () => {
    expect(normalizeUzPhone("+998 (90) 123-45-67")).toBe("+998901234567");
  });

  it("rejects too-short numbers", () => {
    expect(normalizeUzPhone("12345678")).toBeNull();
  });

  it("rejects too-long numbers", () => {
    expect(normalizeUzPhone("123456789012345")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalizeUzPhone("")).toBeNull();
    expect(normalizeUzPhone("   ")).toBeNull();
  });

  it("rejects non-998 international numbers", () => {
    // 12 digits, but doesn't start with 998 — could be a US, EU, RU
    // number. We're +998-only for v1 so this is expected.
    expect(normalizeUzPhone("971234567890")).toBeNull();
  });
});

describe("isValidUzPhone", () => {
  it("matches normalizeUzPhone() != null", () => {
    expect(isValidUzPhone("901234567")).toBe(true);
    expect(isValidUzPhone("+998901234567")).toBe(true);
    expect(isValidUzPhone("12345")).toBe(false);
  });
});
