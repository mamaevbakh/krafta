"use client";

import type { Currency, PricingBreakdown } from "@/lib/commerce-client";

import { cn } from "@/lib/utils";
import { Price } from "./price";

/**
 * Renders an engine `PricingBreakdown` — subtotal → fees → delivery → tip →
 * total. Every number is server-authoritative; this component only lays them
 * out. Included fees (e.g. VAT baked into the price) render muted and are NOT
 * re-added — the customer sees them for transparency, not as an extra charge.
 */
export function PricingSummary({
  pricing,
  showTotal = true,
  className,
}: {
  pricing: PricingBreakdown;
  showTotal?: boolean;
  className?: string;
}) {
  const currency: Currency = pricing.currency;
  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      <Row label="Subtotal" cents={pricing.subtotalCents} currency={currency} muted />

      {pricing.feeLines.map((fee, i) => (
        <Row
          key={`${fee.name}-${i}`}
          label={`${fee.name}${formatPct(fee.percentage, fee.inclusionType)}`}
          cents={fee.amountCents}
          currency={currency}
          muted
        />
      ))}

      {pricing.deliveryFeeCents > 0 ? (
        <Row
          label="Delivery"
          cents={pricing.deliveryFeeCents}
          currency={currency}
          muted
        />
      ) : null}

      {pricing.tipCents > 0 ? (
        <Row label="Tip" cents={pricing.tipCents} currency={currency} muted />
      ) : null}

      {showTotal ? (
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-medium text-foreground">Total</span>
          <Price
            cents={pricing.totalCents}
            currency={currency}
            className="text-base font-semibold tabular-nums"
          />
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  cents,
  currency,
  muted,
}: {
  label: string;
  cents: number;
  currency: Currency;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>
        {label}
      </span>
      <Price
        cents={cents}
        currency={currency}
        className="tabular-nums text-foreground"
      />
    </div>
  );
}

function formatPct(
  fraction: number,
  inclusionType: "additive" | "included",
): string {
  const pct = Math.round(fraction * 100 * 100) / 100;
  if (pct === 0) return "";
  return inclusionType === "included" ? ` (${pct}% included)` : ` (${pct}%)`;
}
