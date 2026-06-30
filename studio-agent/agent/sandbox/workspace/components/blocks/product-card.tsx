"use client";

import { useMemo, useState } from "react";

import type { Currency, Item } from "@/lib/commerce-client";

import { Price } from "@/components/commerce/price";
import { useOptionalCart } from "@/components/commerce/cart-provider";
import { ItemSheet } from "@/components/commerce/item-sheet";

// Photo card mirroring the Krafta storefront: a tall product image with an "Add"
// pill overlaid bottom-right, then name / description / price below. Fully
// editable presentation; money renders only through <Price> (engine value).
//
// Add behaviour: items with a single variation and no modifiers add in one tap;
// anything configurable (multiple variations or any modifier list) opens the
// item sheet so the customer can choose first. All cart writes go through
// @/lib/commerce-client — the engine prices every line.
export function ProductCard({
  item,
  currency,
}: {
  item: Item;
  currency: Currency;
}) {
  const cart = useOptionalCart();
  const [sheetOpen, setSheetOpen] = useState(false);

  const needsConfig = useMemo(
    () => item.variations.length > 1 || item.modifierLists.length > 0,
    [item.variations.length, item.modifierLists.length],
  );

  const defaultVariationId = useMemo(
    () =>
      item.variations.find((v) => v.isDefault)?.id ??
      item.variations[0]?.id ??
      "",
    [item.variations],
  );

  const handleAdd = () => {
    if (!cart) return;
    if (needsConfig) {
      setSheetOpen(true);
      return;
    }
    cart.addLine({ itemId: item.id, variationId: defaultVariationId, qty: 1 });
    cart.open();
  };

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
        {/* Configurable items: the whole image is the single control that opens
            the configurator (one focusable element per card — no nested
            interactive content). The "Add" pill below is then decorative. */}
        {cart && needsConfig ? (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={`Choose options for ${item.name}`}
            className="absolute inset-0 z-10 cursor-pointer"
          />
        ) : null}
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- starter keeps deps light; agent can switch to next/image
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : null}
        {cart && needsConfig ? (
          // Decorative — the image button above is the real control.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm"
          >
            Add
          </span>
        ) : null}
        {cart && !needsConfig ? (
          // Simple item: the pill is the one-tap add control.
          <button
            type="button"
            onClick={handleAdd}
            disabled={cart.isHydrating}
            aria-label={`Add ${item.name}`}
            className="absolute bottom-2 right-2 z-10 inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 pt-3">
        <h3 className="text-sm font-semibold leading-tight">{item.name}</h3>
        {item.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.description}
          </p>
        ) : null}
        <Price
          cents={item.priceCents}
          currency={currency}
          className="mt-1 text-sm font-medium"
        />
      </div>

      {/* Configurable items: the detail sheet for variations + modifiers. */}
      {needsConfig && cart ? (
        <ItemSheet
          item={item}
          currency={currency}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </article>
  );
}
