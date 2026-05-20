"use client";

/**
 * card-default-editable.tsx — Library Canvas mode of the default item card (KRA-35 PR1 / ER2, DR3).
 *
 * Client companion to `card-default.tsx`. Renders the SAME visual markup as
 * CustomerItemCard (via the shared CardMarkup export from the RSC file)
 * plus selection + in-place edit affordances per DR3:
 *
 *   - Click anywhere on the card → onSelect(item.id) fires (canvas-level
 *     useState wrapper holds the selected id per ER3 / D4)
 *   - Selected state → subtle --ring border tint (no AI-slop colored
 *     left-border, no scale transform; just the focus ring color)
 *   - Name field → <InlineText> wired to saveName callback
 *   - Price field → <InlineCurrency> wired to savePrice callback (price
 *     lives on the default item_variations row per KRA-54)
 *   - Description field → <InlineText> with placeholder hint when empty,
 *     wired to saveDescription
 *
 * No consumer in PR 1 — this is foundation. PR 2 wires this into the
 * Library Canvas (`<CanvasWithSelection>` + per-category section render).
 * Shipping it now per D12 so the load-bearing visual parity is tested
 * isolated before stacking the canvas on top.
 *
 * Visual lockstep: CardMarkup is the single source of truth. To change
 * card appearance, edit card-default.tsx — both customer and editable
 * pick it up. The selected-state styling lives here because it only
 * applies to the editable view.
 *
 * RSC/client boundary: this file is `"use client"`. CardMarkup is exported
 * from the RSC file but contains no client features, so it renders
 * correctly inside this client component. Importing this file from the
 * customer catalog would pull editor code into the customer bundle —
 * don't.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ItemCardProps } from "@/lib/catalogs/layout-registry";
import { InlineText, type InlineTextStatus } from "@/components/ui/inline-text";
import { InlineCurrency } from "@/components/ui/inline-currency";
import Image from "next/image";

export type EditableItemCardProps = ItemCardProps & {
  /** Whether this card is the currently-selected one in the canvas. The
   *  parent (canvas wrapper) tracks selection via useState and passes the
   *  flag down. */
  selected?: boolean;
  /** Fires when the merchant clicks the card chrome (not when they click
   *  inside an inline field — those bubble up but the parent should not
   *  treat them as a re-select). Parent updates its selection state. */
  onSelect?: (itemId: string) => void;
  /** Autosave for the item's default-locale name. Throws → InlineText
   *  re-enters edit with error chip. */
  saveName: (next: string) => Promise<void> | void;
  /** Autosave for the item's default-locale description. */
  saveDescription: (next: string) => Promise<void> | void;
  /** Autosave for the item's default-variation price (integer cents). */
  savePrice: (nextCents: number) => Promise<void> | void;
  /** Optional callback for status changes on ANY of the three fields.
   *  The parent can hoist this to render a per-card "saving…" / "error"
   *  indicator outside the card chrome (e.g. a chip in the corner). */
  onFieldStatusChange?: (
    field: "name" | "description" | "price",
    status: InlineTextStatus,
  ) => void;
};

/**
 * EditableItemCard — client version of the default card with in-place
 * edit affordances. See file docstring for the behavior spec.
 *
 * The outer chrome (border, padding, radius) matches the customer card
 * exactly so when the merchant compares to the customer view (Open shop
 * sidebar action), it's the same shape. Inside, the text fields are
 * InlineText / InlineCurrency primitives so the merchant can edit in
 * place. The photo block uses the SAME JSX as CustomerItemCard's photo
 * (same h-16 w-16, same rounded-xs, same sizes) — we can't pull it
 * directly from CardMarkup because we need to swap the text region
 * inside the outer flex container.
 */
export function EditableItemCard({
  item,
  imageUrl,
  // currencySettings is part of ItemCardProps for type compatibility with
  // CustomerItemCard but EditableItemCard uses InlineCurrency (UZS-specific,
  // see inline-currency.tsx) so the registry-driven currency formatter
  // isn't called here. Caller can still pass it; it's a no-op for now.
  selected = false,
  onSelect,
  saveName,
  saveDescription,
  savePrice,
  onFieldStatusChange,
}: EditableItemCardProps) {
  const onNameStatus = React.useCallback(
    (status: InlineTextStatus) => onFieldStatusChange?.("name", status),
    [onFieldStatusChange],
  );
  const onDescriptionStatus = React.useCallback(
    (status: InlineTextStatus) => onFieldStatusChange?.("description", status),
    [onFieldStatusChange],
  );
  const onPriceStatus = React.useCallback(
    (status: InlineTextStatus) => onFieldStatusChange?.("price", status),
    [onFieldStatusChange],
  );

  // Click on chrome (not on an inline field) selects the card. Inline
  // fields have their own handlers; selection is idempotent so re-select
  // is a no-op for the parent.
  const handleChromeClick = () => {
    onSelect?.(item.id);
  };

  return (
    <div
      onClick={handleChromeClick}
      data-slot="editable-item-card"
      data-item-id={item.id}
      data-selected={selected || undefined}
      className={cn(
        // Customer card chrome — keep identical to CardMarkup's container
        // in card-default.tsx (same border, padding, radius).
        "flex gap-3 rounded-xs border px-3 py-3",
        // Selection visual per DR3: subtle ring color. No bold left-border
        // (AI-slop), no bg fill (preserves customer-view parity except
        // for the ring on the focused card).
        selected && "ring-2 ring-ring/40 ring-offset-0",
        // Whole card is clickable to select; inline fields override the
        // cursor to text-caret on hover (see InlineText).
        "cursor-default",
      )}
    >
      {/* Photo — read-only in this PR. PR2 inspector handles upload. */}
      {imageUrl && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xs bg-muted">
          <Image
            src={imageUrl}
            alt={item.image_alt ?? item.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>
      )}

      {/* Text + price — in-place editable. */}
      <div className="flex flex-1 items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <InlineText
            value={item.name}
            save={saveName}
            onStatusChange={onNameStatus}
            placeholder="Item name"
            // line-clamp-2 from CardMarkup is dropped here — the input
            // can't be line-clamped; long names will wrap via CSS overflow
            // in the parent if needed. Visual drift from customer view on
            // very long names is acceptable in edit mode.
            className="text-sm font-medium"
          />

          <InlineText
            value={item.description ?? ""}
            save={saveDescription}
            onStatusChange={onDescriptionStatus}
            placeholder="Add description…"
            className="mt-1 text-xs text-muted-foreground"
          />
        </div>

        <div className="ml-1 flex shrink-0 flex-col items-end">
          <InlineCurrency
            value={item.price_cents}
            save={savePrice}
            onStatusChange={onPriceStatus}
            // InlineCurrency uses font-mono tabular-nums by default. The
            // customer card doesn't (see ER2 note), so this is a deliberate
            // edit-mode-only typographic shift. Cafe merchants editing
            // prices want column-aligned mono numerals; customer-side keeps
            // the legacy proportional look until a separate visual update.
            className="leading-none"
          />
        </div>
      </div>
    </div>
  );
}
