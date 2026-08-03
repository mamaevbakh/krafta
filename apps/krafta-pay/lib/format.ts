// Money formatting for the hosted checkout.
//
// Amounts are stored in minor units (UZS tiyin; 1 sum = 100 tiyin). Per
// DESIGN.md, UZS renders as whole sums with comma thousands separators and no
// decimal places ("50,000 UZS"), in font-mono tabular-nums wherever it appears.
export function formatMinorAmount(amountMinor: number, currency: string): string {
  const major = Math.round((amountMinor ?? 0) / 100);
  return `${major.toLocaleString("en-US")} ${currency}`;
}

/**
 * Major-unit conversion for price INPUTS.
 *
 * Every `*_minor` column stores major×100, UZS included — so a 990 sum plan is
 * 99000 in the database. That is a storage invariant, not something a merchant
 * should have to know: the old form asked for "Amount minor" and a merchant
 * typing the price they charge would have created a plan for 1/100th of it.
 */
export function minorToMajorInput(amountMinor: number | string): string {
  const minor = Number(amountMinor);
  if (!Number.isFinite(minor)) return "";
  return String(Math.round(minor) / 100);
}

export function majorInputToMinor(value: string): number {
  // Merchants type "50 000" and "50,000" as readily as "50000".
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const major = Number(normalized);
  if (!Number.isFinite(major)) return NaN;
  return Math.round(major * 100);
}
