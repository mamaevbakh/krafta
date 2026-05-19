// Shared cart pricing math. Pure, no I/O. Used by the client (preview) and
// the server (place-order persistence) to keep both halves in lockstep.
//
// v1 supports the simplest tax shape only: additive (added on top of price),
// calculated on the subtotal (post-modifiers), applies_to='all_items'. The
// fetcher in lib/catalogs/data.ts filters to this shape so this util never
// has to branch on calculation_phase / inclusion_type / applies_to.

import type { PublicTax } from "@/lib/catalogs/types";

export type FeeLine = {
  taxId: string;
  name: string;
  kind: "tax" | "service_fee";
  // The catalog-level percentage as a fraction (0.12 = 12%). Snapshot to
  // commerce.order_taxes.percentage at place-time so historical orders
  // survive merchant edits.
  percentage: number;
  // Final cents charged for this fee. Rounded once at the order level; we
  // distribute pro-rata across lines without re-rounding.
  appliedMoneyCents: number;
};

export type PricingResult = {
  feeLines: FeeLine[];
  totalFeesCents: number;
  totalCents: number;
};

// Banker's rounding would be more accurate over the long run, but Math.round
// matches how most consumer-facing receipts compute totals. Pick one and
// apply it consistently in client + server.
function roundCents(value: number): number {
  return Math.round(value);
}

export function computePricing(input: {
  subtotalCents: number;
  taxes: PublicTax[];
  tipCents: number;
}): PricingResult {
  const { subtotalCents, taxes, tipCents } = input;
  const feeLines: FeeLine[] = taxes.map((tax) => ({
    taxId: tax.id,
    name: tax.name,
    kind: tax.kind,
    percentage: tax.percentage,
    appliedMoneyCents: roundCents(subtotalCents * tax.percentage),
  }));
  const totalFeesCents = feeLines.reduce(
    (sum, line) => sum + line.appliedMoneyCents,
    0,
  );
  const totalCents = subtotalCents + totalFeesCents + tipCents;
  return { feeLines, totalFeesCents, totalCents };
}

// Distribute a single tax's appliedMoneyCents across the order's lines
// proportional to line.total_price_cents / subtotalCents. Floor each share;
// give the last line the remainder so the sum exactly equals the input
// amount (zero rounding loss). Returns a Map keyed by line id.
export function distributeProRata(input: {
  lines: Array<{ id: string; total_price_cents: number }>;
  totalCents: number;
  subtotalCents: number;
}): Map<string, number> {
  const { lines, totalCents, subtotalCents } = input;
  const out = new Map<string, number>();
  if (lines.length === 0 || totalCents === 0 || subtotalCents === 0) {
    for (const line of lines) out.set(line.id, 0);
    return out;
  }
  let distributed = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const share = Math.floor((line.total_price_cents / subtotalCents) * totalCents);
    out.set(line.id, share);
    distributed += share;
  }
  // Remainder to the last line so the sum is exact.
  const last = lines[lines.length - 1];
  out.set(last.id, totalCents - distributed);
  return out;
}
