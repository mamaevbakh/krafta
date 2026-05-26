"use client";

import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";

import { AnimatedQty } from "./animated-qty";
import { useOptionalCart } from "./cart-provider";
import { useItemSheet } from "../items/item-detail-controller";

type CartActionsProps = {
  itemId: string;
  itemSlug: string;
  categorySlug: string | null;
  itemName: string;
  basePriceCents: number;
  /** True when the item has at least one modifier list (forces the
   *  customer through the configuration sheet on first Add). */
  hasModifiers: boolean;
  /** Visual position. "floating" = absolute bottom-right pill overlapping
   *  the card photo (Careem big-photo pattern). Use "inline" inside
   *  list-row cards where a floating overlay looks wrong. */
  position?: "floating" | "inline";
};

/**
 * Catalog-card cart action surface — renders one of two states using the
 * shadcn `ButtonGroup` primitive for cohesive composition.
 *
 *   1. **Not in cart** — single "Add" pill. Tap adds (simple items) or
 *      opens the item detail to configure (customisable items).
 *
 *   2. **In cart** — `[🗑/− N +]` 3-button group. + bumps the
 *      most-recently-added matching cart line; − decrements; at qty=1
 *      the − slot becomes a trash icon that removes the line entirely.
 *
 * Cart context is optional: when the catalog has cart disabled
 * (`settings_behavior.enableCart=false`), `useOptionalCart` returns null
 * and this component renders nothing — the catalog page shows zero
 * cart UI.
 *
 * Click suppression: every interactive surface here is marked with
 * `data-cart-action` so the parent `ItemSheetTrigger` skips opening
 * the item detail when a stepper/Add tap bubbles up.
 */
export function CartActions({
  itemId,
  itemSlug,
  categorySlug,
  itemName,
  basePriceCents,
  hasModifiers,
  position = "floating",
}: CartActionsProps) {
  const cart = useOptionalCart();
  const sheet = useItemSheet();

  // hasMounted flips true after first commit. Gates the stepper branch so the
  // server-rendered tree (always sees empty cart — no localStorage access)
  // matches the first client render byte-for-byte. Without this, when
  // localStorage has a cached cart containing this item, server renders the
  // Add pill while client renders the stepper → React hydration mismatch →
  // tear-down + re-render of the whole cart tree → visible flicker.
  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  // Match cart lines for this item id, regardless of variation or
  // modifier signature. Multiple lines for the same item (different
  // configs) all roll up to the catalog card's stepper.
  const matchingLines = React.useMemo(() => {
    if (!cart) return [];
    return cart.summary.lineItems.filter(
      (line) => line.catalog_item_id === itemId,
    );
  }, [cart, itemId]);

  const totalQty = matchingLines.reduce((sum, l) => sum + l.quantity, 0);

  // "Most recent" = last in cart-provider's lineItems array (the array
  // is sorted ASC by created_at; optimistic placeholders are appended).
  const lastLine = matchingLines.at(-1);

  if (!cart) return null;

  const handleAdd = () => {
    if (hasModifiers) {
      // Customisable: route through the item detail so the customer can
      // pick required mods. The detail's bottom CTA does the actual add.
      sheet.openItem(itemSlug, categorySlug);
      return;
    }
    void cart.addItem({
      itemId,
      name: itemName,
      basePriceCents,
    });
  };

  const handleIncrement = () => {
    if (!lastLine) return;
    // Bump qty via addItem (NOT updateQuantity) so this stepper shares the
    // same debounce key as the item-detail's "+" — both surfaces feed
    // pendingAddTimers keyed by (itemId, variationId, modifierSig). Without
    // this, rapid taps across the catalog card AND the open item detail
    // race two distinct debounce timers and one response gets discarded.
    //
    // Echo the existing line's variation + modifiers so the dedup key
    // matches and the cart-provider merges into the same line instead of
    // creating a parallel placeholder. For items with no modifiers this is
    // an empty array; for customisable items it mirrors the most-recently
    // added config — tapping "+" on a card with 2 configs in cart bumps
    // the most recent one (Careem behavior).
    void cart.addItem({
      itemId,
      name: itemName,
      basePriceCents,
      variationId: lastLine.catalog_variation_id ?? undefined,
      variationName: lastLine.variation_name ?? null,
      modifiers: lastLine.modifiers
        .filter((m) => m.catalog_modifier_list_id !== null)
        .map((m) => ({
          modifierListId: m.catalog_modifier_list_id as string,
          modifierId: m.catalog_modifier_id,
          quantity: m.quantity,
          name: m.name,
          basePriceCentsDelta: m.base_price_cents_delta,
          text_value: m.text_value,
        })),
    });
  };

  const handleDecrement = () => {
    if (!lastLine) return;
    // Delta-based bump reads latest qty from cart-provider's summaryRef
    // (NOT the render-stale lastLine.quantity), so rapid taps don't all
    // compute the same target. bumpQuantity routes to removeItem internally
    // when next ≤ 0, swapping the icon back to Trash on the next render.
    cart.bumpQuantity(lastLine.id, -1);
  };

  // ── Not in cart: default Button ──────────────────────────────────
  // Stock shadcn Button — no color/border/shadow overrides. Position
  // class is the only addition (float over photo when inside a relative
  // card container).
  //
  // Also renders the Add pill during the brief pre-mount window
  // (`!hasMounted`) regardless of cart state, so server and client first
  // paint match. The localStorage cache applies in CartProvider's mount
  // effect; the next render with `hasMounted=true && totalQty > 0` swaps
  // to the stepper.
  if (!hasMounted || totalQty === 0) {
    return (
      <Button
        type="button"
        data-cart-action
        onClick={handleAdd}
        className={cn(
          "variant-default border border-black/15 shadow-lg",
          position === "floating" && "absolute bottom-3 right-3 z-10",
        )}
        aria-label={`Add ${itemName} to cart`}
      >
        Add
      </Button>
    );
  }

  // ── In cart: shadcn ButtonGroup, default outline buttons ─────────
  // Standard ButtonGroup composition: outline icon-buttons + a
  // ButtonGroupText for the qty readout. The primitive handles the
  // seamless-edges treatment between siblings. Position class is the
  // only extra style; everything else uses theme tokens.
  return (
    <ButtonGroup
      data-cart-action
      aria-label={`Cart quantity for ${itemName}`}
      className={cn(
        "rounded-md border border-black/15 shadow-lg",
        position === "floating" && "absolute bottom-3 right-3 z-10",
      )}
    >
      <Button
        type="button"
        size="icon"
        variant="default"
        onClick={handleDecrement}
        aria-label={
          lastLine && lastLine.quantity > 1
            ? `Decrease ${itemName} quantity`
            : `Remove ${itemName} from cart`
        }
      >
        {lastLine && lastLine.quantity > 1 ? <Minus /> : <Trash2 />}
      </Button>
      <ButtonGroupText className="bg-primary text-primary-foreground">
        <AnimatedQty value={totalQty} />
      </ButtonGroupText>
      <Button
        type="button"
        size="icon"
        variant="default"
        onClick={handleIncrement}
        aria-label={`Increase ${itemName} quantity`}
      >
        <Plus />
      </Button>
    </ButtonGroup>
  );
}
