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
  className?: string;
};

export function AddToCartButton({
  itemId,
  itemName,
  basePriceCents,
  variationId,
  variationName = null,
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
      className={cn("w-full", className)}
    >
      <ShoppingBag className="mr-2 h-4 w-4" />
      Add to cart
    </Button>
  );
}
