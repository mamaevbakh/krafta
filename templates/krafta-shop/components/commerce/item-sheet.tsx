"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Currency, Item } from "@krafta/commerce";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-provider";
import { CloseIcon } from "./icons";
import { ModifierPicker, type ModifierPickerValue } from "./modifier-picker";
import { Price } from "./price";
import { QuantityStepper } from "./quantity-stepper";
import { useFocusTrap } from "./use-focus-trap";
import { VariationSelector } from "./variation-selector";

/**
 * Full item view for configuring a product before adding it: pick a variation,
 * fill required/optional modifiers, set a quantity, then add. The live price is
 * display-only (variation price + selected modifier deltas) × qty — the engine
 * re-prices every line server-side once it's in the cart.
 *
 * Rendered as a fixed overlay (full-screen on phones, a centered card on
 * desktop) rather than a route, so the customer never leaves the catalog.
 */
export function ItemSheet({
  item,
  currency,
  open,
  onClose,
}: {
  item: Item;
  currency: Currency;
  open: boolean;
  onClose: () => void;
}) {
  const cart = useCart();

  const defaultVariationId = useMemo(() => {
    // Prefer an in-stock variation so the sheet never opens on a disabled
    // "Sold out" selection while other variations are available.
    const inStock = item.variations.filter((v) => !v.isSoldOut);
    const pool = inStock.length > 0 ? inStock : item.variations;
    return (pool.find((v) => v.isDefault) ?? pool[0])?.id ?? "";
  }, [item.variations]);

  const [variationId, setVariationId] = useState(defaultVariationId);
  const [qty, setQty] = useState(1);
  const [mods, setMods] = useState<ModifierPickerValue>({
    selections: [],
    isValid: true,
    missingRequired: 0,
    priceDeltaCents: 0,
  });

  // Reset transient state each time the sheet opens for an item.
  useEffect(() => {
    if (open) {
      setVariationId(defaultVariationId);
      setQty(1);
    }
  }, [open, defaultVariationId]);

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onModsChange = useCallback(
    (value: ModifierPickerValue) => setMods(value),
    [],
  );

  // Modal focus: move focus into the sheet on open, trap Tab, restore on close.
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  const selectedVariation =
    item.variations.find((v) => v.id === variationId) ?? item.variations[0];
  const unitPriceCents =
    (selectedVariation?.priceCents ?? item.priceCents) + mods.priceDeltaCents;
  const totalCents = unitPriceCents * qty;
  // Block adds during the post-reload hydration window: until the persisted
  // cart finishes restoring, addLine can't compute a correct absolute target
  // and would clobber a restored line's quantity.
  const canAdd =
    mods.isValid &&
    !!variationId &&
    !selectedVariation?.isSoldOut &&
    !cart.isHydrating;

  const handleAdd = () => {
    if (!canAdd) return;
    // Build modifier display names for the optimistic hint by looking up each
    // selected modifier id in the item's modifier lists.
    const modifierHints = mods.selections.flatMap((sel) => {
      if (sel.text) return [{ name: sel.text, priceCents: 0 }];
      const list = item.modifierLists.find((l) => l.id === sel.modifierListId);
      if (!list || !sel.modifierIds) return [];
      return sel.modifierIds.flatMap((id) => {
        const mod = list.modifiers.find((m) => m.id === id);
        return mod ? [{ name: mod.name, priceCents: mod.priceCents }] : [];
      });
    });
    cart.addLine(
      { itemId: item.id, variationId, qty, modifiers: mods.selections },
      { name: item.name, priceCents: unitPriceCents, modifiers: modifierHints },
    );
    onClose();
    cart.open();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-full flex-col overflow-hidden bg-background outline-none sm:h-auto sm:max-h-[88dvh] sm:max-w-md sm:rounded-2xl sm:border sm:border-border"
      >
        {/* Image band + close button */}
        <div className="relative">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- starter keeps deps light; agent can switch to next/image
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-48 w-full object-cover sm:h-56"
            />
          ) : (
            <div className="h-20 w-full bg-muted" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full border border-border bg-background/90 text-foreground backdrop-blur transition-colors hover:bg-accent"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">{item.name}</h2>
            {item.description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            ) : null}
          </div>

          <VariationSelector
            variations={item.variations}
            value={variationId}
            onChange={setVariationId}
            currency={currency}
          />

          <ModifierPicker
            modifierLists={item.modifierLists}
            currency={currency}
            onChange={onModsChange}
          />
        </div>

        {/* Sticky footer: qty + add */}
        <div className="border-t border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="flex items-center gap-3">
            <QuantityStepper
              quantity={qty}
              itemName={item.name}
              onDecrement={() => setQty((q) => Math.max(1, q - 1))}
              onIncrement={() => setQty((q) => q + 1)}
            />
            <Button
              type="button"
              size="lg"
              className={cn("flex-1 justify-between", !canAdd && "opacity-60")}
              disabled={!canAdd}
              onClick={handleAdd}
            >
              <span>
                {selectedVariation?.isSoldOut
                  ? "Sold out"
                  : mods.missingRequired > 0
                    ? `Choose ${mods.missingRequired} option${mods.missingRequired > 1 ? "s" : ""}`
                    : "Add to cart"}
              </span>
              {canAdd ? (
                <Price cents={totalCents} currency={currency} className="font-semibold" />
              ) : null}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
