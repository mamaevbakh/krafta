"use client";

import * as React from "react";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { CartLineItem } from "@/lib/cart/orders";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

import { AnimatedQty } from "./animated-qty";
import { useCart } from "./cart-provider";

type CustomisationsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fallback item name when the cart line's snapshotted name is missing
   *  (shouldn't happen post-KRA-96 but kept as safety). */
  itemName: string;
  imageUrl: string | null;
  /** All cart lines that resolve to the same catalog item. Each becomes
   *  one row in the drawer with its own per-config stepper. */
  lines: CartLineItem[];
  /** Opens the full item-detail to configure a fresh combo. Called when
   *  the customer taps "Add new customised item" at the bottom of the
   *  drawer. The drawer closes itself first so the item-detail's open
   *  animation lands cleanly. */
  onAddNew: () => void;
  currencySettings?: CurrencySettings;
};

/**
 * Bottom-sheet disambiguator for customisable items already in the cart.
 *
 * Mirrors the Careem / Kcal pattern: a single tap of "+" on a catalog-card
 * stepper for a customisable item with N existing configurations opens
 * this drawer instead of silently bumping "the most recent one." Each
 * configuration is its own row with its own per-config stepper, so the
 * customer explicitly chooses which one to add another of (or removes
 * a specific one). The bottom CTA opens the item-detail fullscreen
 * to configure a different combination.
 *
 * Avoids the "I tapped + and don't know which of my two configs got
 * bumped" trap that always hits when N > 1.
 */
export function CustomisationsDrawer({
  open,
  onOpenChange,
  itemName,
  imageUrl,
  lines,
  onAddNew,
  currencySettings = defaultCurrencySettings,
}: CustomisationsDrawerProps) {
  const { bumpQuantity } = useCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        // Auto-height (don't stretch to 92dvh like the full cart drawer);
        // this is a disambiguator, not a full surface. Tall enough to
        // show 2-3 configs comfortably + the CTA without scrolling, but
        // shrinks for the common single-config case.
        className="max-h-[80dvh]"
      >
        <DrawerHeader className="text-left">
          <DrawerTitle>{t("customisations.title")}</DrawerTitle>
        </DrawerHeader>

        {/* Plain overflow-y-auto div instead of shadcn ScrollArea. Radix's
            ScrollAreaViewport uses display:table internally to enable
            horizontal scroll, which breaks the min-w-0 chain that <p
            className="truncate"> relies on for ellipsis. Result was the
            <li> growing to its content's intrinsic width (~545px) and
            spilling off the right edge of the 358px drawer — names cut
            mid-word, price + stepper invisible. We only need vertical
            scroll here, so a plain div is the right primitive. */}
        <div className="flex-1 min-w-0 overflow-y-auto px-4">
          <ul className="space-y-3 pb-2">
            {lines.map((line) => (
              <ConfigRow
                key={line.id}
                line={line}
                fallbackName={itemName}
                imageUrl={imageUrl}
                currencySettings={currencySettings}
                onBump={bumpQuantity}
                decreaseLabel={t("aria.decrease_quantity")}
                increaseLabel={t("aria.increase_quantity")}
                removeLabel={t("aria.remove_item")}
              />
            ))}
          </ul>
        </div>

        <div className="px-4 pb-6 pt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => {
              // Close BEFORE opening the item-detail so the drawer's
              // close animation doesn't race the detail's open animation
              // (vaul + the fullscreen detail can both be transitioning
              // at once if we don't sequence).
              onOpenChange(false);
              onAddNew();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("customisations.add_new")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// Per-config row: thumbnail + name/modifiers/price stack + stepper.
// Self-contained so the parent component stays focused on layout.
function ConfigRow({
  line,
  fallbackName,
  imageUrl,
  currencySettings,
  onBump,
  decreaseLabel,
  increaseLabel,
  removeLabel,
}: {
  line: CartLineItem;
  fallbackName: string;
  imageUrl: string | null;
  currencySettings: CurrencySettings;
  onBump: (lineId: string, delta: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  removeLabel: string;
}) {
  const displayName = line.name || fallbackName;
  const isFirstQty = line.quantity <= 1;

  // Compact modifier summary: "{quantity}x {name}" per modifier, joined
  // with a thin separator. Text-mode rows render the typed value
  // instead of a count. Three rows max in the list-row layout to keep
  // each card scannable; the rest collapse to "+N more".
  const modifierLines = line.modifiers.filter(
    (m) => m.catalog_modifier_list_id !== null,
  );
  const visibleMods = modifierLines.slice(0, 3);
  const overflowCount = modifierLines.length - visibleMods.length;

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex gap-3">
        {/* Thumbnail (square, fixed size) */}
        {imageUrl ? (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-muted">
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-sm bg-muted" />
        )}

        {/* Name + modifier summary */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">
              {displayName}
            </p>
            <p className="shrink-0 font-mono text-sm font-medium tabular-nums">
              {formatPriceCents(line.total_price_cents, currencySettings)}
            </p>
          </div>

          {visibleMods.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {visibleMods.map((m) => {
                const isText = m.text_value !== null;
                if (isText) {
                  return (
                    <li key={m.id} className="truncate">
                      <span className="font-medium">{m.name}:</span>{" "}
                      <span className="italic">"{m.text_value}"</span>
                    </li>
                  );
                }
                return (
                  <li key={m.id} className="truncate">
                    {m.quantity > 1 ? `${m.quantity}x ` : ""}
                    {m.name}
                  </li>
                );
              })}
              {overflowCount > 0 ? (
                <li className="text-muted-foreground/70">+{overflowCount} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>

      {/* Per-config stepper — Careem-pattern: trash icon at qty 1, minus
          above. Same shape as the catalog-card stepper for consistency. */}
      <div className="mt-3 flex justify-end">
        <ButtonGroup
          aria-label={`Quantity for this configuration`}
          className={cn("rounded-md border border-input")}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onBump(line.id, -1)}
            aria-label={isFirstQty ? removeLabel : decreaseLabel}
            className="h-9 w-9"
          >
            {isFirstQty ? (
              <Trash2 className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
          </Button>
          <ButtonGroupText className="min-w-[2.5rem] justify-center text-center">
            <AnimatedQty value={line.quantity} className="text-sm font-semibold" />
          </ButtonGroupText>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onBump(line.id, +1)}
            aria-label={increaseLabel}
            className="h-9 w-9"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </ButtonGroup>
      </div>
    </li>
  );
}
