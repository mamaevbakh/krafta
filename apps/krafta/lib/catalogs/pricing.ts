import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";

function applyThousandsSeparator(value: string, separator: string): string {
  if (!separator) return value;

  const isNegative = value.startsWith("-");
  const digits = isNegative ? value.slice(1) : value;
  const parts: string[] = [];

  for (let i = digits.length; i > 0; i -= 3) {
    const start = Math.max(i - 3, 0);
    parts.unshift(digits.slice(start, i));
  }

  return `${isNegative ? "-" : ""}${parts.join(separator)}`;
}

export function formatPriceCents(
  amountCents: number,
  settings?: CurrencySettings,
): string {
  const currency = settings ?? defaultCurrencySettings;
  const decimals = currency.showDecimals ? 2 : 0;
  const value = amountCents / 100;
  const rounded =
    decimals === 0 ? Math.round(value) : value;
  const fixed = rounded.toFixed(decimals);
  const [rawInteger, rawFraction] = fixed.split(".");

  const integer = applyThousandsSeparator(
    rawInteger,
    currency.thousandSeparator,
  );
  const number = currency.showDecimals
    ? `${integer}${currency.decimalSeparator}${rawFraction ?? "00"}`
    : integer;

  const label = currency.label ?? "";
  if (!label) return number;

  // F-8 (storefront audit): drop the space between symbol and number for
  // single-character symbol labels in prefix position. `$1,234.00` and
  // `€1,234.00` are the conventional Latin formats; `$ 1,234.00` reads
  // as a typo. Word-like labels ("USD", "сум", "leke") still get a
  // space — those need to breathe regardless of position. Suffix labels
  // always get a space ("1234 сум", "1234 ₽") since both word and
  // symbol forms read better with separation when trailing.
  const labelIsSymbol = /^[^\p{L}\p{N}]/u.test(label);
  const joiner =
    currency.labelPosition === "prefix" && labelIsSymbol ? "" : " ";

  return currency.labelPosition === "suffix"
    ? `${number}${joiner}${label}`
    : `${label}${joiner}${number}`;
}

/**
 * formatPriceInputValue — value to display INSIDE a price input field while
 * the merchant types. Returns just the number (no currency label, no
 * surrounding chrome) per the catalog's currency settings.
 *
 *   - showDecimals=true,  USD  → "15.00"   (1500 cents)
 *   - showDecimals=false, UZS  → "15000"   (1_500_000 cents)
 *
 * IMPORTANT — the `*_cents` columns store major units × 100 for EVERY
 * currency, including no-decimal ones like UZS (25 000 sum → 2 500 000
 * cents). This mirrors the onboarding wizard (`parseSum(sum) * 100` on
 * submit) and the read-only formatter (`formatPriceCents`, which divides
 * by 100 unconditionally). So this input value ALWAYS divides by 100 —
 * the only difference between currencies is whether we keep the two
 * decimal places (USD) or round to a whole number (UZS).
 *
 * The earlier version skipped the /100 for no-decimal currencies, which
 * made the editor show a UZS item's price 100× too large ("2800000" for
 * a 28 000 sum item) and persist new prices 100× too small. That's the
 * bug this repairs.
 *
 * Thousand separators are NOT applied here — this is the bare value for
 * the focused/typing state. For the grouped unfocused display use
 * formatPriceInputDisplay; for a fully labelled read-only render use
 * formatPriceCents.
 */
export function formatPriceInputValue(
  amountCents: number,
  settings?: CurrencySettings,
): string {
  const currency = settings ?? defaultCurrencySettings;
  if (!Number.isFinite(amountCents)) return "0";
  const major = amountCents / 100;
  if (currency.showDecimals) {
    return major.toFixed(2);
  }
  return String(Math.round(major));
}

/**
 * formatPriceInputDisplay — like formatPriceInputValue but with the
 * catalog's thousand separator applied, for the UNFOCUSED display of a
 * price input (matches the wizard's "28 000" UX). The focused/typing
 * state should stay on the bare formatPriceInputValue so separators don't
 * reflow under the caret mid-keystroke.
 */
export function formatPriceInputDisplay(
  amountCents: number,
  settings?: CurrencySettings,
): string {
  const currency = settings ?? defaultCurrencySettings;
  const bare = formatPriceInputValue(amountCents, currency);
  if (!bare) return bare;
  // formatPriceInputValue always emits "." as the decimal separator
  // (toFixed), so split on it to group only the integer portion.
  const [intPart, fracPart] = bare.split(".");
  const grouped = applyThousandsSeparator(
    intPart,
    currency.thousandSeparator,
  );
  if (currency.showDecimals && fracPart != null) {
    return `${grouped}${currency.decimalSeparator}${fracPart}`;
  }
  return grouped;
}

/**
 * parsePriceInput — currency-aware parser. Takes a merchant-typed string
 * and returns integer cents (the schema's source of truth).
 *
 * Accepts:
 *   - "15.00", "15.5", "15" with showDecimals=true USD (decimal=".") → 1500, 1550, 1500
 *   - "15,00", "15,5", "15" with showDecimals=true EUR (decimal=",") → 1500, 1550, 1500
 *   - "15", "1 500" with showDecimals=false UZS → 1500, 150000
 *
 * Note the UZS examples: the merchant types major units (sums) and we
 * persist sums × 100, the same scale formatPriceCents reads back and the
 * onboarding wizard writes. "15" sum → 1500 cents, "1 500" sum → 150 000
 * cents.
 *
 * Returns null on invalid input so the caller can ignore the keystroke
 * (e.g. letters typed into a numeric field).
 */
export function parsePriceInput(
  raw: string,
  settings?: CurrencySettings,
): number | null {
  if (raw == null) return null;
  const currency = settings ?? defaultCurrencySettings;
  const trimmed = String(raw).trim();
  if (!trimmed.length) return 0;

  // Strip the currency label if the merchant pasted it in.
  let cleaned = trimmed;
  if (currency.label) {
    // Tolerant of leading/trailing label position; case-insensitive for
    // alpha labels (e.g. "сум"). The label can be a $ or another single
    // char — we don't escape regex special chars since the typical
    // configured labels are alphabetic / $.
    cleaned = cleaned.replaceAll(currency.label, "").trim();
  }

  // Strip thousand separators. We accept the canonical separator AND a few
  // common merchant-typed alternatives so paste-from-Excel-style values
  // don't reject the keystroke.
  const thousandsRe = /[\s,'`]/g; // generous: whitespace, comma, apostrophes
  const decimalSep = currency.decimalSeparator;

  if (currency.showDecimals) {
    // Allow either the configured decimal separator OR `.` (most common
    // fallback when keyboards differ). Normalize to `.` for parseFloat.
    const replaced = cleaned
      .replaceAll(thousandsRe, "") // first remove thousand-like noise
      .replace(decimalSep, ".");   // then normalize decimal to `.`
    if (!/^-?\d*\.?\d*$/.test(replaced)) return null;
    if (replaced === "" || replaced === "." || replaced === "-") return 0;
    const num = Number.parseFloat(replaced);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100);
  }

  // No-decimal currencies (UZS). Strip everything that isn't a digit;
  // a stray decimal-style character is a paste-from-other-catalog typo,
  // we drop it. The merchant types whole sums; we persist sums × 100 so
  // the cents column stays on the same scale as decimal currencies and
  // the wizard (which also multiplies by 100 on submit).
  const digitsOnly = cleaned.replaceAll(/[^\d-]/g, "");
  if (!digitsOnly.length || digitsOnly === "-") return 0;
  if (!/^-?\d+$/.test(digitsOnly)) return null;
  const parsed = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed * 100;
}
