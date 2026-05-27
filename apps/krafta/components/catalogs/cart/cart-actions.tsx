"use client";

import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { AnimatedQty } from "./animated-qty";
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
    // Single config (simple OR customisable): bump qty via addItem so
    // this stepper shares the same debounce key as the item-detail's
    // "+". For customisable items we echo the line's modifiers so the
    // dedup key matches and the existing line is bumped (not a new
    // placeholder added alongside).
    void cart.addItem({
      itemId,
      name: itemName,
      basePriceCents,
      variationId: lastLine.catalog_variation_id ?? undefined,
      variationName: lastLine.variation_name ?? null,
      modifiers: hasModifiers
        ? lastLine.modifiers
            .filter((m) => m.catalog_modifier_list_id !== null)
            .map((m) => ({
              modifierListId: m.catalog_modifier_list_id as string,
              modifierId: m.catalog_modifier_id,
              quantity: m.quantity,
              name: m.name,
              basePriceCentsDelta: m.base_price_cents_delta,
              text_value: m.text_value,
            }))
        : undefined,
    });
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
    <>
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
