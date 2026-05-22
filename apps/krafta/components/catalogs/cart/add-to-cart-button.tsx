"use client";

import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCart } from "./cart-provider";

type AddToCartButtonProps = {
  itemId: string;
  itemName: string;
  basePriceCents: number;
  variationId?: string;
  variationName?: string | null;
  modifiers?: Array<{
    modifierId: string;
    quantity: number;
    name: string;
    basePriceCentsDelta: number;
  }>;
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
};

export function AddToCartButton({
  itemId,
  itemName,
  basePriceCents,
  variationId,
  variationName = null,
  modifiers,
  disabled = false,
  className,
  preFlight,
}: AddToCartButtonProps) {
  const { addItem, open } = useCart();

  const handleClick = async () => {
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
      toast.success(`${itemName} added to cart`, {
        action: { label: "View", onClick: () => open() },
      });
    } catch {
      // toast is already shown by the provider
    }
  };

  return (
    <Button
      type="button"
      size="lg"
      onClick={handleClick}
      disabled={disabled}
      className={cn("w-full", className)}
    >
      <ShoppingBag className="mr-2 h-4 w-4" />
      Add to cart
    </Button>
  );
}
