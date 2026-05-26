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
      onClick={open}
      aria-label={
        showCount ? `Open cart (${itemCount} items)` : "Open cart"
      }
      className={cn("relative h-11 w-11 rounded-full", className)}
    >
      <ShoppingCart className="h-5 w-5" />
      {showCount ? (
        <Badge
          className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1.5 py-0 text-xs"
          variant="secondary"
        >
          {itemCount}
        </Badge>
      ) : null}
    </Button>
  );
}
