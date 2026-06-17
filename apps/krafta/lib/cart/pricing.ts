// Shared cart pricing math. Pure, no I/O. Used by the client (preview) and
// the server (place-order persistence) to keep both halves in lockstep.
//
// v1 supports applies_to='all_items' + calculation_phase='subtotal'. The
// `inclusion_type` discriminator drives both math + UI:
//   - additive: amount = subtotal * pct, added to the customer's total.
//   - included: amount = subtotal * pct / (1 + pct). The menu price already
//     bakes in this tax (common pattern for UZ VAT); we surface the
//     implicit portion for the receipt but do NOT add it to the total.

import type { PublicTax } from "@/lib/catalogs/types";

export type FeeLine = {
  taxId: string;
  name: string;
  kind: "tax" | "service_fee";
  inclusionType: "additive" | "included";
  // The catalog-level percentage as a fraction (0.12 = 12%). Snapshot to
  // commerce.order_taxes.percentage at place-time so historical orders
  // survive merchant edits.
  percentage: number;
  // Final cents charged for this fee. For additive, this is what gets added
  // to the total. For included, this is the implicit portion baked into the
  // subtotal — recorded for compliance / displayed as "(included)", but NOT
  // added to the total.
  appliedMoneyCents: number;
};

export type PricingResult = {
  feeLines: FeeLine[];
  // Sum of additive fees only. This is what gets added to the customer's
  // total alongside subtotal + tip.
  additiveFeesCents: number;
  // Sum of included fees. Informational; never added to the total.
  includedFeesCents: number;
  // Flat delivery fee added to delivery orders (customer pays). 0 for other
  // modes / when no fee is configured. Distinct from taxes so receipts and
  // refunds can isolate it.
  deliveryFeeCents: number;
  // Subtotal + additiveFees + deliveryFee + tip. Excludes includedFees
  // (already in subtotal).
  totalCents: number;
};

function roundCents(value: number): number {
  return Math.round(value);
}

export function computePricing(input: {
  subtotalCents: number;
  taxes: PublicTax[];
  tipCents: number;
  deliveryFeeCents?: number;
}): PricingResult {
  const { subtotalCents, taxes, tipCents } = input;
  const deliveryFeeCents = Math.max(0, Math.floor(input.deliveryFeeCents ?? 0));
  const feeLines: FeeLine[] = taxes.map((tax) => {
    const appliedMoneyCents =
      tax.inclusion_type === "included"
        ? // Extract the implicit portion of the tax from a tax-inclusive
          // subtotal: implicit = subtotal * pct / (1 + pct).
          roundCents((subtotalCents * tax.percentage) / (1 + tax.percentage))
        : roundCents(subtotalCents * tax.percentage);
    return {
      taxId: tax.id,
      name: tax.name,
      kind: tax.kind,
      inclusionType: tax.inclusion_type,
      percentage: tax.percentage,
      appliedMoneyCents,
    };
  });
  const additiveFeesCents = feeLines
    .filter((line) => line.inclusionType === "additive")
    .reduce((sum, line) => sum + line.appliedMoneyCents, 0);
  const includedFeesCents = feeLines
    .filter((line) => line.inclusionType === "included")
    .reduce((sum, line) => sum + line.appliedMoneyCents, 0);
  const totalCents =
    subtotalCents + additiveFeesCents + deliveryFeeCents + tipCents;
  return {
    feeLines,
    additiveFeesCents,
    includedFeesCents,
    deliveryFeeCents,
    totalCents,
  };
}

// Distribute a single tax's appliedMoneyCents across the order's lines
// proportional to line.total_price_cents / subtotalCents. Floor each share;
// give the last line the remainder so the sum exactly equals the input
// amount (zero rounding loss). Works for both inclusion types — the per-line
// breakdown is needed for compliance / refunds regardless of whether the
// tax was added to the total or already baked into the price.
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
