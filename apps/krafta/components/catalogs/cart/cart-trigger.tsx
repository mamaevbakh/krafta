"use client";

import { ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCart } from "./cart-provider";

type CartTriggerProps = {
  className?: string;
};

export function CartTrigger({ className }: CartTriggerProps) {
  const { itemCount, open, isHydrating } = useCart();

  return (
    <Button
      type="button"
      size="icon"
      onClick={open}
      aria-label={
        itemCount > 0 ? `Open cart (${itemCount} items)` : "Open cart"
      }
      // Sits to the left of the floating search trigger (right-6) so both are
      // visible together on mobile.
      className={cn(
        "fixed bottom-6 right-24 z-40 h-12 w-12 rounded-full shadow-lg",
        className,
      )}
    >
      <ShoppingBag className="h-5 w-5" />
      {!isHydrating && itemCount > 0 ? (
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
