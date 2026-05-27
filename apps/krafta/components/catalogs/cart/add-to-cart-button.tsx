"use client";

import * as React from "react";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

import {
  modifierSignature,
  type ModifierSelection,
} from "@/lib/cart/modifier-signature";

import { CartStepper } from "./cart-stepper";
import { useCart } from "./cart-provider";

type AddToCartModifier = {
  modifierListId: string;
  modifierId: string | null;
  quantity: number;
  name: string;
  basePriceCentsDelta: number;
  text_value: string | null;
};

type AddToCartButtonProps = {
  itemId: string;
  itemName: string;
  basePriceCents: number;
  variationId?: string;
  variationName?: string | null;
  /**
   * Selected modifiers (KRA-96 shape). Supports both list-mode and
   * text-mode rows — see CartProvider.addItem for the full shape doc.
   */
  modifiers?: AddToCartModifier[];
  disabled?: boolean;
  className?: string;
  /** Optional pre-flight validation hook. Called synchronously on click
   *  BEFORE the cart action. Return true to proceed; return false to
   *  abort silently (the parent is expected to surface its own UI
   *  feedback — e.g. scrolling to an unfilled required modifier list).
   *
   *  Pattern in use by item-detail-fullscreen-view: rather than render
   *  the button as disabled (a dead-end UX when the customer doesn't
   *  know WHY it's disabled), keep it enabled and let preFlight redirect
   *  the customer's eye to the field that's blocking them. */
  preFlight?: () => boolean;
  /**
   * Called when the customer taps the "View" action on the success toast
   * (which also opens the cart drawer). Use this to close any wrapping
   * dialog so the merchant lands on the cart, not back on the item card.
   * If undefined, only the cart drawer opens.
   */
  onClose?: () => void;
};

/**
 * Two-state CTA at the bottom of the item detail view.
 *
 * Default state: a single "Add to cart" button. After a successful add,
 * if the SAME (item + variation + modifier signature) combo is already
 * in the cart, the button swaps to a `[− N +]` stepper that drives
 * the existing optimistic update / debounced server-sync path. This
 * matches the Uber Eats / DoorDash pattern: the merchant who tapped
 * "Add" once shouldn't have to keep tapping it; the same surface area
 * keeps bumping the qty.
 *
 * The stepper disappears (button returns) when:
 *   - the customer tweaks modifier picks so the signature no longer
 *     matches (intentional: different mods = new cart line)
 *   - they tap minus at qty 1 (removes the line)
 */
export function AddToCartButton(props: AddToCartButtonProps) {
  const {
    itemId,
    itemName,
    basePriceCents,
    variationId,
    variationName = null,
    modifiers,
    disabled = false,
    className,
    preFlight,
    onClose,
  } = props;

  const { addItem, bumpQuantity, summary, open } = useCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  // Compute the signature of the CURRENT modifier selections so we can
  // ask "is this exact combo already in the cart?". Has to match the
  // server-side dedup logic in lib/cart/orders.ts byte-for-byte —
  // hence the same shared modifierSignature() util.
  const currentSignature = React.useMemo(() => {
    const selections: ModifierSelection[] = (modifiers ?? []).map((m) => ({
      listId: m.modifierListId,
      modifierId: m.modifierId,
      quantity: m.quantity,
      text_value: m.text_value,
    }));
    return modifierSignature(selections);
  }, [modifiers]);

  // hasMounted flips true after first commit. Gates the stepper branch so the
  // server-rendered tree (which has no localStorage access and thus always
  // sees an empty cart) matches the first client render byte-for-byte. Without
  // this, React throws a hydration mismatch when the localStorage-cached cart
  // includes this item — server renders <button>Add to cart</button>, client
  // renders <div role="group"> stepper. React then tears down and re-renders
  // the entire tree, which the customer perceives as flicker.
  //
  // After the first commit, the cache effect in CartProvider has applied,
  // matchingLine is populated, and the stepper appears normally.
  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  // Look up a cart line that matches (item, variation?, signature).
  //
  // Variation handling: when the caller didn't pass a variationId (the
  // common case in item-detail-fullscreen-view, where the customer hasn't
  // explicitly picked one), we accept ANY variation on the line — the
  // server-side addLineItem resolves "no variation passed" to the item's
  // default variation and stamps that uuid into catalog_variation_id.
  // If we strictly compared `line.catalog_variation_id !== null`, the
  // optimistic local placeholder (variationId=null) would match BUT the
  // real server-returned line (variationId=<default-uuid>) would not —
  // making the +/- stepper flash on optimistic add and then disappear
  // 2.5 s later when the server response replaces the placeholder.
  // When the caller DID pass a variationId, we still require an exact
  // match so distinct variations stay as distinct cart lines.
  //
  // Local optimistic placeholders (id starting with `local-`) are
  // included so the stepper appears synchronously on tap.
  const matchingLine = React.useMemo(() => {
    return summary.lineItems.find((line) => {
      if (line.catalog_item_id !== itemId) return false;
      if (variationId !== undefined && line.catalog_variation_id !== variationId) {
        return false;
      }
      // Mirror cart-provider's lineModifierSig() so the comparison matches.
      const sig = modifierSignature(
        line.modifiers
          .filter((m) => m.catalog_modifier_list_id !== null)
          .map((m) => ({
            listId: m.catalog_modifier_list_id as string,
            modifierId: m.catalog_modifier_id,
            quantity: m.quantity,
            text_value: m.text_value,
          })),
      );
      return sig === currentSignature;
    });
  }, [summary.lineItems, itemId, variationId, currentSignature]);

  const handleAdd = async () => {
    if (preFlight && !preFlight()) return;
    try {
      await addItem({
        itemId,
        variationId,
        name: itemName,
        basePriceCents,
        variationName,
        modifiers,
      });
      toast.success(t("add_to_cart.added", { name: itemName }), {
        action: {
          label: t("add_to_cart.view"),
          // Open the cart drawer AND close the item dialog so the
          // customer lands on the cart, not back on the item card.
          onClick: () => {
            open();
            onClose?.();
          },
        },
      });
    } catch {
      // cart-provider's addItem already toasts the error.
    }
  };

  const handleIncrement = () => {
    if (!matchingLine) return;
    // Bump by line id — identical path the cart-drawer + card stepper
    // use post-KRA-108. Goes through updateQuantity (line-id keyed,
    // absolute qty), which avoids the racy match-by-(item, variation,
    // sig) recompute the old addItem-bump path required. The comment
    // here used to talk about a 2.5s debounce dedup — that mechanism is
    // gone, and so is the only reason for taking the addItem path on a
    // bump where we already know the exact line id.
    bumpQuantity(matchingLine.id, +1);
  };

  const handleDecrement = () => {
    if (!matchingLine) return;
    // Delta-based bump reads latest qty from the optimistic cart (derived
    // every render from server + in-flight actions — never stale), so two
    // rapid taps both compute against current state — second tap actually
    // moves the number. bumpQuantity routes to removeItem internally when next ≤ 0,
    // which also flips the stepper back to the "Add to cart" button on
    // the next render (matchingLine becomes undefined).
    bumpQuantity(matchingLine.id, -1);
  };

  // ── Stepper state: already in cart ─────────────────────────────────
  if (hasMounted && matchingLine) {
    return (
      <CartStepper
        variant="detail"
        quantity={matchingLine.quantity}
        itemName={itemName}
        onDecrement={handleDecrement}
        onIncrement={handleIncrement}
        disabled={disabled}
        className={className}
      />
    );
  }

  // ── Default state: not in cart yet ─────────────────────────────────
  return (
    <Button
      type="button"
      size="lg"
      onClick={handleAdd}
      disabled={disabled}
      className={cn("w-full", className)}
    >
      <ShoppingCart className="mr-2 h-4 w-4" />
      {t("add_to_cart.label")}
    </Button>
  );
}
