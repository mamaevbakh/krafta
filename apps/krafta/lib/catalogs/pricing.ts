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
 *   - showDecimals=true,  USD  → "15.00"
 *   - showDecimals=false, UZS  → "15000"
 *
 * Thousand separators are NOT applied here — the input is for typing, not
 * presentation. Display-formatted value (with separators + label) is for
 * read-only renderings via formatPriceCents.
 */
export function formatPriceInputValue(
  amountCents: number,
  settings?: CurrencySettings,
): string {
  const currency = settings ?? defaultCurrencySettings;
  if (!Number.isFinite(amountCents)) return "0";
  if (currency.showDecimals) {
    return (amountCents / 100).toFixed(2);
  }
  return String(Math.trunc(amountCents));
}

/**
 * parsePriceInput — currency-aware parser. Takes a merchant-typed string
 * and returns integer cents (the schema's source of truth).
 *
 * Accepts:
 *   - "15.00", "15.5", "15" with showDecimals=true USD (decimal=".") → 1500, 1550, 1500
 *   - "15,00", "15,5", "15" with showDecimals=true EUR (decimal=",") → 1500, 1550, 1500
 *   - "15", "1,500" with showDecimals=false UZS → 15, 1500
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
  // we drop it.
  const digitsOnly = cleaned.replaceAll(/[^\d-]/g, "");
  if (!digitsOnly.length || digitsOnly === "-") return 0;
  if (!/^-?\d+$/.test(digitsOnly)) return null;
  const parsed = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
