"use client";

import type { Currency, Variation } from "@/lib/commerce-client";

import { cn } from "@/lib/utils";
import { Price } from "./price";

/**
 * Chip group for picking a variation (Small / Medium / Large …). Renders
 * nothing for single-variation items — the lone default is used silently.
 * Sold-out variations show struck-through and disabled.
 *
 * Controlled: the parent item sheet owns the selected id because the variation
 * also drives the live unit price and the `variationId` sent to the cart.
 */
export function VariationSelector({
  variations,
  value,
  onChange,
  currency,
}: {
  variations: Variation[];
  value: string;
  onChange: (variationId: string) => void;
  currency: Currency;
}) {
  if (variations.length < 2) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Options
      </p>
      <div role="radiogroup" aria-label="Options" className="flex flex-wrap gap-2">
        {variations.map((variation) => {
          const selected = variation.id === value;
          const disabled = variation.isSoldOut;
          return (
            <button
              key={variation.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => !disabled && onChange(variation.id)}
              className={cn(
                "inline-flex min-h-11 flex-col items-start gap-0.5 rounded-md border px-3 py-1.5 text-left transition-colors",
                selected && !disabled
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-accent",
                disabled && "cursor-not-allowed opacity-50 hover:bg-background",
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
              {disabled ? (
                <span className="text-xs leading-tight">Sold out</span>
              ) : (
                <Price
                  cents={variation.priceCents}
                  currency={currency}
                  className={cn(
                    "text-xs tabular-nums leading-tight",
                    selected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
