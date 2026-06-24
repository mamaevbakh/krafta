import { describe, expect, it } from "vitest";

import {
  formatPriceCents,
  formatPriceInputDisplay,
  formatPriceInputValue,
  parsePriceInput,
} from "./pricing";
import type { CurrencySettings } from "./settings/currency";

/**
 * Currency rendering rules — the part of the design system that lives
 * inside `formatPriceCents`. This file pins the label-spacing behaviour
 * that the storefront audit flagged (F-8): single-character symbols
 * snug against the number in prefix position, word-like labels get a
 * space, suffix labels always get a space.
 *
 * Add tests when adding new label conventions; do not loosen these
 * without an explicit design review.
 */

function makeCurrency(overrides: Partial<CurrencySettings>): CurrencySettings {
  return {
    defaultCurrency: "USD",
    label: "$",
    showDecimals: true,
    decimalSeparator: ".",
    thousandSeparator: ",",
    labelPosition: "prefix",
    ...overrides,
  };
}

describe("formatPriceCents — label spacing", () => {
  it("$ in prefix renders without space ($1,234.00)", () => {
    expect(formatPriceCents(123400, makeCurrency({ label: "$" }))).toBe(
      "$1,234.00",
    );
  });

  it("€ in prefix renders without space (€1.234,00 with EU separators)", () => {
    expect(
      formatPriceCents(
        123400,
        makeCurrency({
          label: "€",
          decimalSeparator: ",",
          thousandSeparator: ".",
        }),
      ),
    ).toBe("€1.234,00");
  });

  it("USD (word-like label) in prefix keeps the space", () => {
    expect(formatPriceCents(123400, makeCurrency({ label: "USD" }))).toBe(
      "USD 1,234.00",
    );
  });

  it("сум (Cyrillic word) in suffix keeps the space", () => {
    expect(
      formatPriceCents(
        123400,
        makeCurrency({
          label: "сум",
          labelPosition: "suffix",
          showDecimals: false,
        }),
      ),
    ).toBe("1,234 сум");
  });

  it("₽ symbol in suffix still gets a space (trailing symbols read better with separation)", () => {
    expect(
      formatPriceCents(
        123400,
        makeCurrency({
          label: "₽",
          labelPosition: "suffix",
          showDecimals: false,
        }),
      ),
    ).toBe("1,234 ₽");
  });

  it("empty label renders just the number, no leading/trailing space", () => {
    expect(formatPriceCents(123400, makeCurrency({ label: "" }))).toBe(
      "1,234.00",
    );
  });

  it("integers (showDecimals: false) skip the decimal portion", () => {
    expect(
      formatPriceCents(
        250000,
        makeCurrency({ label: "$", showDecimals: false }),
      ),
    ).toBe("$2,500");
  });
});

/**
 * The price-input helpers and the read-only formatter MUST agree on the
 * "cents = major × 100" invariant for EVERY currency. The editor used to
 * skip the ×100 for no-decimal currencies (UZS), so a 25 000 sum item
 * (2 500 000 cents) showed as "2500000" in the editor and new edits were
 * persisted 100× too small. These tests pin the round-trip both ways.
 */
const UZS = (): CurrencySettings => ({
  defaultCurrency: "UZS",
  label: "сум",
  showDecimals: false,
  decimalSeparator: ".",
  thousandSeparator: " ",
  labelPosition: "suffix",
});

const USD = (): CurrencySettings => ({
  defaultCurrency: "USD",
  label: "$",
  showDecimals: true,
  decimalSeparator: ".",
  thousandSeparator: ",",
  labelPosition: "prefix",
});

describe("formatPriceInputValue — major units, no separators", () => {
  it("UZS divides by 100 and rounds (2 500 000 cents → '25000')", () => {
    expect(formatPriceInputValue(2_500_000, UZS())).toBe("25000");
  });

  it("USD keeps two decimals (1050 cents → '10.50')", () => {
    expect(formatPriceInputValue(1050, USD())).toBe("10.50");
  });

  it("zero renders as a plain integer for UZS", () => {
    expect(formatPriceInputValue(0, UZS())).toBe("0");
  });
});

describe("formatPriceInputDisplay — grouped unfocused display", () => {
  it("UZS groups with the catalog separator (2 500 000 → '25 000')", () => {
    expect(formatPriceInputDisplay(2_500_000, UZS())).toBe("25 000");
  });

  it("USD groups the integer part and keeps the decimals", () => {
    expect(formatPriceInputDisplay(123_456, USD())).toBe("1,234.56");
  });
});

describe("parsePriceInput — major units in, cents out", () => {
  it("UZS multiplies by 100 ('25000' sum → 2 500 000 cents)", () => {
    expect(parsePriceInput("25000", UZS())).toBe(2_500_000);
  });

  it("UZS tolerates the merchant's thousands separators ('25 000' → 2 500 000)", () => {
    expect(parsePriceInput("25 000", UZS())).toBe(2_500_000);
  });

  it("UZS strips a pasted label ('28 000 сум' → 2 800 000)", () => {
    expect(parsePriceInput("28 000 сум", UZS())).toBe(2_800_000);
  });

  it("USD parses decimals to cents ('10.50' → 1050)", () => {
    expect(parsePriceInput("10.50", USD())).toBe(1050);
  });

  it("empty string is zero; pure letters strip to zero for UZS", () => {
    // The no-decimal branch strips every non-digit, so a junk string of
    // letters collapses to "" → 0 (the merchant just sees the field stay
    // empty). The decimal branch rejects letters with null instead.
    expect(parsePriceInput("", UZS())).toBe(0);
    expect(parsePriceInput("abc", UZS())).toBe(0);
    expect(parsePriceInput("abc", USD())).toBeNull();
  });
});

describe("round-trip: input value ↔ parse stays stable", () => {
  it("UZS: cents → input → cents is identity for whole sums", () => {
    const settings = UZS();
    for (const cents of [0, 100, 2_500_000, 99_400_00]) {
      const shown = formatPriceInputValue(cents, settings);
      expect(parsePriceInput(shown, settings)).toBe(cents);
    }
  });

  it("USD: cents → input → cents is identity", () => {
    const settings = USD();
    for (const cents of [0, 5, 1050, 123_456]) {
      const shown = formatPriceInputValue(cents, settings);
      expect(parsePriceInput(shown, settings)).toBe(cents);
    }
  });

  it("the editor agrees with the storefront formatter for UZS", () => {
    // What the merchant types ("28000") must round-trip to the same
    // cents the storefront renders as "28 000 сум".
    const settings = UZS();
    const cents = parsePriceInput("28000", settings);
    expect(cents).toBe(2_800_000);
    expect(formatPriceCents(cents!, settings)).toBe("28 000 сум");
  });
});
