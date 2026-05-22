import { describe, expect, it } from "vitest";

import { formatPriceCents } from "./pricing";
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
