export type CurrencyLabelPosition = "prefix" | "suffix";

export type ThousandSeparator = "," | "." | " ";

export type DecimalSeparator = "." | ",";

export type CurrencySettings = {
  defaultCurrency: string;
  label: string;
  thousandSeparator: ThousandSeparator;
  decimalSeparator: DecimalSeparator;
  showDecimals: boolean;
  labelPosition: CurrencyLabelPosition;
};

export const defaultCurrencySettings: CurrencySettings = {
  defaultCurrency: "USD",
  label: "$",
  thousandSeparator: ",",
  decimalSeparator: ".",
  showDecimals: true,
  labelPosition: "prefix",
};

function normalizeSeparator(
  raw: unknown,
  fallback: ThousandSeparator,
): ThousandSeparator {
  if (raw === "," || raw === "." || raw === " ") return raw;
  return fallback;
}

function normalizeDecimalSeparator(
  raw: unknown,
  fallback: DecimalSeparator,
): DecimalSeparator {
  if (raw === "." || raw === ",") return raw;
  return fallback;
}

function normalizeLabelPosition(
  raw: unknown,
  fallback: CurrencyLabelPosition,
): CurrencyLabelPosition {
  if (raw === "prefix" || raw === "suffix") return raw;
  return fallback;
}

function normalizeLabel(raw: unknown, fallback: string): string {
  if (typeof raw === "string") return raw;
  return fallback;
}

export function normalizeCurrencySettings(
  raw: Partial<CurrencySettings> | Record<string, unknown> = {},
): CurrencySettings {
  const typed = raw as Partial<CurrencySettings>;
  const defaultCurrency =
    typeof typed.defaultCurrency === "string" && typed.defaultCurrency.trim()
      ? typed.defaultCurrency
      : defaultCurrencySettings.defaultCurrency;

  return {
    defaultCurrency,
    label: normalizeLabel(typed.label, defaultCurrencySettings.label),
    thousandSeparator: normalizeSeparator(
      typed.thousandSeparator,
      defaultCurrencySettings.thousandSeparator,
    ),
    decimalSeparator: normalizeDecimalSeparator(
      typed.decimalSeparator,
      defaultCurrencySettings.decimalSeparator,
    ),
    showDecimals:
      typeof typed.showDecimals === "boolean"
        ? typed.showDecimals
        : defaultCurrencySettings.showDecimals,
    labelPosition: normalizeLabelPosition(
      typed.labelPosition,
      defaultCurrencySettings.labelPosition,
    ),
  };
}
