// Money formatting for the hosted checkout.
//
// Amounts are stored in minor units (UZS tiyin; 1 sum = 100 tiyin). Per
// DESIGN.md, UZS renders as whole sums with comma thousands separators and no
// decimal places ("50,000 UZS"), in font-mono tabular-nums wherever it appears.
export function formatMinorAmount(amountMinor: number, currency: string): string {
  const major = Math.round((amountMinor ?? 0) / 100);
  return `${major.toLocaleString("en-US")} ${currency}`;
}
