"use client";

/**
 * variation-selector.tsx — customer-facing variation picker.
 *
 * Renders a chip-group above the modifier picker in the item-detail view
 * for items with multiple active variations:
 *
 *   [ Small · $4.00 ] [ Medium · $5.50 ] [ Large · $7.00 ]
 *
 * Single-variation items skip rendering entirely (`return null`) — the
 * default variation is used silently by the item-detail's add-to-cart
 * path. The catalog-grid card always uses the default; if the customer
 * wants a non-default they tap into the detail.
 *
 * Selection is a controlled prop pair (`value` + `onChange`). The parent
 * item-detail view owns the state because the variation also drives the
 * reactive price in the bottom CTA, the modifier-delta math, and the
 * variationId passed to cart.addItem.
 *
 * Sold-out variations: render the chip in a muted/strikethrough state
 * and disable the button so the customer can't pick a variation the
 * merchant has flagged as 86'd. The label still shows the price so the
 * variation isn't invisible — just unavailable.
 *
 * No i18n on variation names yet — the merchant workbench (KRA-94)
 * stores variation translations, but the public storefront fetch
 * doesn't yet thread them through (see data.ts TODO). For Krafta's
 * cafe MVP that means "Small / Medium / Large" stays English even on
 * RU / UZ storefronts; merchant can override by naming the variation
 * in the localized text directly.
 */

import * as React from "react";

import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type { PublicItemVariation } from "@/lib/catalogs/types";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

type VariationSelectorProps = {
  variations: PublicItemVariation[];
  value: string;
  onChange: (variationId: string) => void;
  currencySettings?: CurrencySettings;
  className?: string;
};

export function VariationSelector({
  variations,
  value,
  onChange,
  currencySettings,
  className,
}: VariationSelectorProps) {
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (key: Parameters<typeof getStorefrontMessage>[0]) =>
    getStorefrontMessage(key, { activeLocale, defaultLocale });

  if (variations.length < 2) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("variation.label")}
      </p>
      {/* Wrapping flex group so 3+ chips break across rows on narrow
          phones instead of overflowing horizontally. Gap of 2 (8px) keeps
          touch targets distinct without crowding. role=radiogroup +
          aria-checked on each chip gives screen readers the right
          semantics for "pick one of these". */}
      <div
        role="radiogroup"
        aria-label={t("variation.label")}
        className="flex flex-wrap gap-2"
      >
        {variations.map((variation) => {
          const selected = variation.id === value;
          const disabled = variation.is_sold_out;
          const price = formatPriceCents(
            variation.price_cents,
            currencySettings,
          );
          return (
            <button
              key={variation.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onChange(variation.id);
              }}
              className={cn(
                // Chip baseline: outline + muted on idle, primary fill
                // on select. Min-height 44px is the iOS Human Interface
                // Guidelines hit-target floor — keeps cafe customers
                // from misfiring on neighboring chips while standing
                // in a queue holding the phone one-handed.
                "inline-flex min-h-[44px] flex-col items-start gap-0.5 rounded-md border px-3 py-1.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted/60",
                disabled &&
                  "cursor-not-allowed opacity-50 hover:bg-background",
              )}
            >
              <span
                className={cn(
                  "text-sm font-medium leading-tight",
                  disabled && "line-through",
                )}
              >
                {variation.name}
              </span>
              <span
                className={cn(
                  "font-mono text-xs tabular-nums leading-tight",
                  selected ? "text-primary-foreground/80" : "text-muted-foreground",
                  disabled && "line-through",
                )}
              >
                {disabled ? t("variation.sold_out") : price}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
