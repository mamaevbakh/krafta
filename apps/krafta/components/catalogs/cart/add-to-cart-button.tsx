"use client";

import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useCart } from "./cart-provider";

type AddToCartButtonProps = {
  itemId: string;
  itemName: string;
  variationId?: string;
  className?: string;
};

export function AddToCartButton({
  itemId,
  itemName,
  variationId,
  className,
}: AddToCartButtonProps) {
  const { addItem, isMutating, open } = useCart();

  const handleClick = async () => {
    try {
      await addItem({ itemId, variationId });
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
      disabled={isMutating}
      className={cn("w-full", className)}
    >
      <ShoppingBag className="mr-2 h-4 w-4" />
      Add to cart
    </Button>
  );
}
