/**
 * Shared money formatting for the billing surface. Plan amounts are stored in
 * minor units (major × 100 for every currency, incl. UZS — see the price-cents
 * invariant), so render with Intl currency formatting and drop the fraction
 * when the amount lands on a whole major unit (e.g. "UZS 250,000").
 */
export function formatMoney(amountMinor: number, currency: string) {
  try {
    const hasNoCents = amountMinor % 100 === 0;
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: hasNoCents ? 0 : 2,
      maximumFractionDigits: hasNoCents ? 0 : 2,
    }).format(amountMinor / 100);
  } catch {
    return `${amountMinor} ${currency.toUpperCase()}`;
  }
}
