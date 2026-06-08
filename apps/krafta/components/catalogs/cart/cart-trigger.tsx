"use client";

import * as React from "react";
import { ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useOptionalCart } from "./cart-provider";

type CartTriggerProps = {
  className?: string;
  /** When true, the trigger renders nothing while the cart is empty
   *  (slot-friendly behavior for the storefront dock). When false (the
   *  legacy floating-button mode), the icon stays visible at all times
   *  so the customer can still tap into an empty cart drawer. */
  hideWhenEmpty?: boolean;
};

/**
 * Tap surface that opens the cart drawer. Designed to be slotted into
 * the storefront bottom dock (`hideWhenEmpty=true` by default for the
 * dock context) — no fixed positioning, no shadow, no rounded-full;
 * the dock owns chrome. The legacy floating-button mode stays on the
 * `false` path for any caller that still wants the standalone bottom-
 * right circle.
 *
 * hasMounted gate prevents the badge from rendering during hydration:
 * the localStorage cart cache applies in a post-mount effect, so the
 * server's `itemCount=0` render diverges from the client's
 * `itemCount=N` immediately after hydration. Without this gate React
 * tears down + re-renders the whole cart tree → visible "stepper
 * flash" the customer perceives as a UI glitch.
 */
export function CartTrigger({
  className,
  hideWhenEmpty = true,
}: CartTriggerProps) {
  // useOptionalCart returns null when the trigger is mounted outside a
  // CartProvider (catalog with cart disabled, or test harness). Render
  // nothing in that case — safe to drop into the storefront dock
  // regardless of cart-enabled state.
  const cart = useOptionalCart();

  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!cart) return null;
  const { itemCount, open } = cart;

  const showCount = hasMounted && itemCount > 0;

  // Dock mode: render nothing while cart is empty. The dock collapses
  // to just the search input — calm empty state, no idle chrome.
  if (hideWhenEmpty && !showCount) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      onClick={open}
      // Inside Telegram the native MainButton ("View cart · total") owns cart
      // access, so this dock icon is redundant — hide it (see globals.css).
      data-tg-hide
      aria-label={
        showCount ? `Open cart (${itemCount} items)` : "Open cart"
      }
      className={cn(
        // bg-muted (secondary) instead of bg-primary so the trigger
        // blends into the storefront-dock's frosted-glass surface
        // instead of reading as a bright sticker pasted on the dark
        // pill. The badge does the work of attention-grabbing; the
        // button doesn't need to scream.
        "relative h-10 w-10 rounded-full bg-muted text-foreground hover:bg-muted/80",
        className,
      )}
    >
      <ShoppingCart className="h-4 w-4" />
      {showCount ? (
        // Inverted-tone badge — bg-foreground (off-white/dark in
        // light/dark mode) on a muted button reads as a confident
        // status pip, not a candy-colored sticker. Tighter offset
        // (-top-1.5 -right-1.5) so it overlaps the button edge by
        // less, looking integrated rather than stuck on.
        <Badge
          className="absolute -right-1.5 -top-1.5 h-5 min-w-5 rounded-full bg-foreground px-1.5 py-0 text-[10px] font-semibold text-background"
        >
          {itemCount}
        </Badge>
      ) : null}
    </Button>
  );
}
