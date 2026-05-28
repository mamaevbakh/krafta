"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { CartStepper } from "./cart-stepper";
import { useOptionalCart } from "./cart-provider";
import { CustomisationsDrawer } from "./customisations-drawer";
import { useItemSheet } from "../items/item-detail-controller";

type CartActionsProps = {
  itemId: string;
  itemSlug: string;
  categorySlug: string | null;
  itemName: string;
  basePriceCents: number;
  /** True when the item has at least one modifier list (forces the
   *  customer through the configuration sheet on first Add, and routes
   *  +/- on the catalog stepper through the customisations drawer
   *  when at least one config is already in cart). */
  hasModifiers: boolean;
  /** cart-v3 P3: the item's default variation uuid (is_default=true,
   *  or first variation as a fallback). Threaded down from the catalog
   *  layout so the provider can compute a stable lineKey for the
   *  no-picker Add path. Without this the optimistic placeholder uses
   *  a random local-uuid and won't match the server-materialized
   *  line's lineKey on commit, causing a stepper flicker. */
  defaultVariationId?: string;
  /** Photo URL forwarded to the customisations drawer so each config row
   *  shows a thumbnail. May be null for items without a photo — the
   *  drawer renders a muted placeholder square instead. */
  imageUrl?: string | null;
  /** Currency settings forwarded to the customisations drawer for
   *  per-config price formatting. */
  currencySettings?: CurrencySettings;
  /** Visual position. "floating" = absolute bottom-right pill overlapping
   *  the card photo (Careem big-photo pattern). Use "inline" inside
   *  list-row cards where a floating overlay looks wrong. */
  position?: "floating" | "inline";
};

/**
 * Catalog-card cart action surface — renders one of three states:
 *
 *   1. **Not in cart** — single "Add" pill. Tap adds (simple items) or
 *      opens the item detail to configure (customisable items).
 *
 *   2. **In cart (simple item)** — `[🗑/− N +]` 3-button group. + bumps;
 *      − decrements; at qty=1 the − slot becomes a trash icon that
 *      removes the line entirely. Each tap dispatches directly through
 *      bumpQuantity / addItem — no extra disambiguation surface.
 *
 *   3. **In cart (customisable item)** — same stepper visual, BUT taps
 *      open the CustomisationsDrawer (Careem / Kcal pattern). The
 *      drawer lists each existing config with its own per-config
 *      stepper and an "Add new customised item" CTA. Avoids the
 *      ambiguity of "I tapped + on a card with 2 configs — which one
 *      did it bump?" that always hits when N > 1.
 *
 * Below the action surface, items with modifiers also render a small
 * "Customisable" hint — the same affordance Kcal/Careem use to signal
 * "this opens a configurator, it's not a one-tap add."
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
  defaultVariationId,
  imageUrl = null,
  currencySettings,
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

  // Customisations drawer state. Only ever opens for `hasModifiers` items
  // that have at least one line in cart — the disambiguation only makes
  // sense when there's an existing config to either bump or add-another-of.
  const [customisationsOpen, setCustomisationsOpen] = React.useState(false);

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
      variationId: defaultVariationId,
      name: itemName,
      basePriceCents,
    });
  };

  const handleIncrement = () => {
    if (!lastLine) return;
    // Customisable + MULTIPLE configs in cart: open the disambiguation
    // drawer so the customer picks which config to bump. Opening the
    // drawer for a single config (the common case) is unnecessary
    // friction — there's nothing to disambiguate, just silently bump
    // the only config. Drawer is reserved for the ambiguous case.
    if (hasModifiers && matchingLines.length > 1) {
      setCustomisationsOpen(true);
      return;
    }
    // Single config (simple OR customisable): bump by line id via the
    // same path the cart-drawer stepper uses. This is the line-id-keyed
    // updateQuantity flow — no match-by-(item, variation, sig), no
    // permissive-variation papering over placeholder gaps, no chance of
    // creating a second line from a stale optimistic snapshot.
    //
    // History: this used to call cart.addItem(...) so it could share the
    // pre-v2 cart's debounce key with the item-detail's "+". That whole
    // debounce mechanism is gone (KRA-108) — the surviving justification
    // for taking the racy path was the debounce-key sharing, which no
    // longer applies. Going through bumpQuantity makes the card stepper
    // symmetric with the drawer stepper and eliminates the rapid-fire
    // overshoot the customer was seeing on the card surface.
    cart.bumpQuantity(lastLine.id, +1);
  };

  const handleDecrement = () => {
    if (!lastLine) return;
    // Same rule as +: drawer only when there's actual ambiguity
    // (multiple configs). Single config = silent decrement / remove.
    if (hasModifiers && matchingLines.length > 1) {
      setCustomisationsOpen(true);
      return;
    }
    // bumpQuantity reads latest qty from the optimistic cart (which is
    // always fresh because it derives from server + in-flight optimistic
    // actions every render), so rapid taps don't all compute the same
    // target. Routes to removeItem internally when next ≤ 0, swapping
    // the icon back to Trash on the next render.
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
    // While the cart is still hydrating (cold-cache visitor), disable
    // the Add pill. Tapping during hydration would dispatch with a
    // pre-hydration optimisticCart of {empty}, so target qty=1 lands
    // even if the customer's draft already has the item — see the
    // hydration-gating note in the batch refactor brief.
    const isHydrating = cart.isHydrating;
    return (
      <Button
        type="button"
        data-cart-action
        onClick={handleAdd}
        disabled={isHydrating}
        className={cn(
          "variant-default border border-black/15 shadow-lg",
          position === "floating" && "absolute bottom-3 right-3 z-10",
        )}
        aria-label={`Add ${itemName} to cart`}
        aria-busy={isHydrating || undefined}
      >
        Add
      </Button>
    );
  }

  // ── In cart: shared CartStepper, card variant ───────────────────
  // The stepper renders the trash icon at qty=1 (the card has no
  // other "remove" affordance); +/- otherwise route through the
  // handlers we computed above — which open the customisations
  // disambiguator when there are multiple configs of the same item
  // in the cart.
  return (
    <>
      <CartStepper
        variant="card"
        floating={position === "floating"}
        quantity={totalQty}
        itemName={itemName}
        onDecrement={handleDecrement}
        onIncrement={handleIncrement}
      />
      {/* Disambiguation drawer for customisable items. Mounted always
          when hasModifiers, only opens when the customer taps +/- on
          a card whose item has at least one config in cart. */}
      {hasModifiers ? (
        <CustomisationsDrawer
          open={customisationsOpen}
          onOpenChange={setCustomisationsOpen}
          itemName={itemName}
          imageUrl={imageUrl}
          lines={matchingLines}
          currencySettings={currencySettings}
          onAddNew={() => sheet.openItem(itemSlug, categorySlug)}
        />
      ) : null}
    </>
  );
}
