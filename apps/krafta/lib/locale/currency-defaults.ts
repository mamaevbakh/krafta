// Sensible CurrencySettings defaults for a given ISO-4217 code.
//
// When a merchant picks a currency in onboarding (or the Studio), we pre-fill
// the formatting so they rarely need to touch the styler: the symbol, whether
// to show decimals, and prefix/suffix placement come from Intl.NumberFormat
// (which knows each currency's minor units + symbol). A small OVERRIDES map
// captures the cases where real-world convention diverges from Intl's output —
// notably the Central-Asian currencies, which are written suffix, space-grouped,
// no decimals (Intl reports UZS with 2 minor units, but nobody prices сум that
// way). Everything else falls back to the Intl-derived values.

import {
  defaultCurrencySettings,
  type CurrencySettings,
} from "@/lib/catalogs/settings/currency";

// Surfaced at the top of the onboarding currency picker. Krafta's home market
// first (UZS), then the adjacent regional + most common global currencies.
export const RECOMMENDED_CURRENCY_CODES = [
  "UZS",
  "RUB",
  "KZT",
  "KGS",
  "TJS",
  "USD",
  "EUR",
  "TRY",
  "AED",
  "CNY",
] as const;

// Real-world conventions that beat Intl's locale-agnostic output. Partial —
// only the fields that differ from the Intl-derived base are listed.
const OVERRIDES: Record<string, Partial<CurrencySettings>> = {
  UZS: { label: "сум", labelPosition: "suffix", thousandSeparator: " ", decimalSeparator: ",", showDecimals: false },
  RUB: { label: "₽", labelPosition: "suffix", thousandSeparator: " ", decimalSeparator: ",", showDecimals: false },
  KZT: { label: "₸", labelPosition: "suffix", thousandSeparator: " ", decimalSeparator: ",", showDecimals: false },
  KGS: { label: "сом", labelPosition: "suffix", thousandSeparator: " ", decimalSeparator: ",", showDecimals: false },
  TJS: { label: "сомонӣ", labelPosition: "suffix", thousandSeparator: " ", decimalSeparator: ",", showDecimals: false },
  UAH: { label: "₴", labelPosition: "suffix", thousandSeparator: " ", decimalSeparator: ",", showDecimals: false },
  EUR: { label: "€", labelPosition: "prefix", thousandSeparator: " ", decimalSeparator: ",", showDecimals: true },
};

function fromIntl(code: string): CurrencySettings {
  const upper = code.toUpperCase();
  try {
    const fmt = new Intl.NumberFormat("en", {
      style: "currency",
      currency: upper,
      currencyDisplay: "narrowSymbol",
    });
    const parts = fmt.formatToParts(1234.5);
    const symbol = parts.find((p) => p.type === "currency")?.value ?? upper;
    // Prefix vs suffix: is the currency part emitted before the number?
    const currencyIdx = parts.findIndex((p) => p.type === "currency");
    const numberIdx = parts.findIndex(
      (p) => p.type === "integer" || p.type === "decimal",
    );
    const labelPosition =
      currencyIdx >= 0 && numberIdx >= 0 && currencyIdx > numberIdx
        ? "suffix"
        : "prefix";
    const maxFraction = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    return {
      defaultCurrency: upper,
      label: symbol,
      labelPosition,
      thousandSeparator: ",",
      decimalSeparator: ".",
      showDecimals: maxFraction > 0,
    };
  } catch {
    return { ...defaultCurrencySettings, defaultCurrency: upper, label: upper };
  }
}

/**
 * Best-effort default formatting for a currency code. Intl-derived, with a
 * curated override for currencies whose real-world style differs. Always
 * returns a complete, valid CurrencySettings.
 */
export function getCurrencyDefaults(code: string): CurrencySettings {
  const base = fromIntl(code);
  const override = OVERRIDES[code.toUpperCase()];
  return override ? { ...base, ...override } : base;
}
