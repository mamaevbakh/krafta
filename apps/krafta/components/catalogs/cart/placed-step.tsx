"use client";

import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useCart } from "./cart-provider";

export function CartPlacedStep() {
  const { close, placedOrderId } = useCart();

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-foreground" aria-hidden />
        <h2 className="text-2xl font-semibold tracking-tight">Order placed</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          We sent your order to the venue. Pay at the counter, table, or on
          delivery — the merchant will confirm the rest.
        </p>
        {placedOrderId ? (
          <p className="text-xs text-muted-foreground">
            Reference: {placedOrderId.slice(0, 8)}
          </p>
        ) : null}
      </div>

      <div className="border-t border-border/60 px-4 pb-6 pt-4">
        <Button type="button" size="lg" className="w-full" onClick={close}>
          Done
        </Button>
      </div>
    </div>
  );
}
