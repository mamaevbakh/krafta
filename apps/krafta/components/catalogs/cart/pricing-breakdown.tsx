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
  /**
   * When false, omits the bold "Total" row — for surfaces that render the
   * total elsewhere (e.g. the checkout step's sticky footer) and only need
   * the line-item breakdown here. Defaults to `true`.
   */
  showTotal?: boolean;
};

// Renders the subtotal -> fees -> tip -> total stack.
//
// Two fee shapes:
//   - additive: shown as a normal row, contributes to total.
//   - included (e.g., UZ VAT baked into the menu price): shown muted with
//     "(N% included)" label, recorded for compliance, NOT added to total.
//     The customer sees the breakdown but isn't charged twice.
export function PricingBreakdown({
  subtotalCents,
  taxes,
  tipCents = 0,
  currencySettings,
  compact = false,
  showTotal = true,
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
          label={`${fee.name}${formatPctLabel(fee.percentage, fee.inclusionType)}`}
          valueCents={fee.appliedMoneyCents}
          currencySettings={currencySettings}
          // Included fees are informational — render in muted text and
          // skip the additive sign so the customer reads them as "of which",
          // not "plus".
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
      {showTotal ? (
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatPriceCents(pricing.totalCents, currencySettings)}
          </span>
        </div>
      ) : null}
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
      <span className="font-mono tabular-nums text-foreground">
        {formatPriceCents(valueCents, currencySettings)}
      </span>
    </div>
  );
}

function formatPctLabel(
  fraction: number,
  inclusionType: "additive" | "included",
): string {
  // 0.12 → " (12%)" for additive; " (12% included)" for included.
  const pct = fraction * 100;
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === 0) return "";
  if (inclusionType === "included") return ` (${rounded}% included)`;
  return ` (${rounded}%)`;
}
