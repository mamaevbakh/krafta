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

  return currency.labelPosition === "suffix"
    ? `${number} ${label}`
    : `${label} ${number}`;
}
