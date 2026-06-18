/**
 * demo-shared.ts — helpers shared by the landing's product mocks (the hero
 * counter demo and the features merchant-orders mock). Keeps currency
 * formatting in one place so every figure matches DESIGN.md §Currency:
 * UZS, comma thousands, no decimals, rendered in font-mono tabular-nums.
 */

/** UZS: comma thousands, no decimals (e.g. 1250000 -> "1,250,000"). */
export function formatSum(value: number): string {
  return value.toLocaleString("en-US");
}
