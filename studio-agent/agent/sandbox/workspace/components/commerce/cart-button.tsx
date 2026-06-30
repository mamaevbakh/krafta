"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useOptionalCart } from "./cart-provider";
import { CartIcon } from "./icons";

/**
 * Header tap target that opens the cart, with a live item-count badge. Renders
 * nothing outside a CartProvider (e.g. a preview with cart disabled).
 *
 * The badge is gated behind `hasMounted` so the server-rendered button (which
 * can't read localStorage, so always count 0) matches the first client paint —
 * the persisted count then appears on the next render without a hydration tear.
 */
export function CartButton({ className }: { className?: string }) {
  const cart = useOptionalCart();
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  if (!cart) return null;
  const showCount = hasMounted && cart.itemCount > 0;

  return (
    <button
      type="button"
      onClick={cart.open}
      aria-label={
        showCount ? `Open cart, ${cart.itemCount} items` : "Open cart"
      }
      className={cn(
        "relative flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent",
        className,
      )}
    >
      <CartIcon className="size-4" />
      {showCount ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
          {cart.itemCount}
        </span>
      ) : null}
    </button>
  );
}
