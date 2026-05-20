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
}: AddToCartButtonProps) {
  const { addItem, open } = useCart();

  const handleClick = async () => {
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
