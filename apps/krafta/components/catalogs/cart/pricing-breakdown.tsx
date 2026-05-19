"use client";

import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { computePricing } from "@/lib/cart/pricing";
import type { PublicTax } from "@/lib/catalogs/types";

type Props = {
  subtotalCents: number;
  taxes: PublicTax[];
  tipCents?: number;
  currencySettings: CurrencySettings;
  /**
   * When `compact`, omits the leading "Subtotal" row — useful at the very
   * top of the cart-drawer footer where the subtotal is already implied by
   * the line stack above. Defaults to `false`.
   */
  compact?: boolean;
};

// Renders the subtotal -> fees/taxes -> tip -> total stack. Same component
// is used at the cart-list step (no tip yet) and at the checkout step
// (with the customer's chosen tip).
export function PricingBreakdown({
  subtotalCents,
  taxes,
  tipCents = 0,
  currencySettings,
  compact = false,
}: Props) {
  const pricing = computePricing({ subtotalCents, taxes, tipCents });

  return (
    <div className="space-y-1.5 text-sm">
      {!compact ? (
        <Row
          label="Subtotal"
          valueCents={subtotalCents}
          currencySettings={currencySettings}
          muted
        />
      ) : null}
      {pricing.feeLines.map((fee) => (
        <Row
          key={fee.taxId}
          label={`${fee.name}${formatPctLabel(fee.percentage)}`}
          valueCents={fee.appliedMoneyCents}
          currencySettings={currencySettings}
          muted
        />
      ))}
      {tipCents > 0 ? (
        <Row
          label="Tip"
          valueCents={tipCents}
          currencySettings={currencySettings}
          muted
        />
      ) : null}
      <div className="flex items-baseline justify-between pt-1">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-base font-semibold tabular-nums text-foreground">
          {formatPriceCents(pricing.totalCents, currencySettings)}
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  valueCents,
  currencySettings,
  muted = false,
}: {
  label: string;
  valueCents: number;
  currencySettings: CurrencySettings;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>
        {label}
      </span>
      <span className="tabular-nums text-foreground">
        {formatPriceCents(valueCents, currencySettings)}
      </span>
    </div>
  );
}

function formatPctLabel(fraction: number): string {
  // 0.12 → " (12%)" — drop trailing zeros so 0.105 shows as "(10.5%)".
  const pct = fraction * 100;
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === 0) return "";
  return ` (${rounded}%)`;
}
