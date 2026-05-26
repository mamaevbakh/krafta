"use client";

import * as React from "react";
import { ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCart } from "./cart-provider";

type CartTriggerProps = {
  className?: string;
};

export function CartTrigger({ className }: CartTriggerProps) {
  const { itemCount, open } = useCart();

  // hasMounted flips true after first commit. Used to gate everything
  // derived from the localStorage-cached cart so the server-rendered tree
  // and the first client render are byte-identical (no hydration mismatch).
  //
  // Without this, server renders aria-label="Open cart" + no Badge while
  // client renders aria-label="Open cart (N items)" + a Badge — React then
  // throws "Hydration failed" and tears down + re-renders the whole cart
  // tree, which the customer perceives as the "Add → stepper" flicker.
  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  const showCount = hasMounted && itemCount > 0;

  return (
    <Button
      type="button"
      size="icon"
      onClick={open}
      aria-label={
        showCount ? `Open cart (${itemCount} items)` : "Open cart"
      }
      // Sits to the left of the floating search trigger (right-6) so both are
      // visible together on mobile.
      className={cn(
        "fixed bottom-6 right-24 z-40 h-12 w-12 rounded-full shadow-lg",
        className,
      )}
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
