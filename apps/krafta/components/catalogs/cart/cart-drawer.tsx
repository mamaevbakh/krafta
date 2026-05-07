"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";

import { useCart } from "./cart-provider";

type CartDrawerProps = {
  currencySettings?: CurrencySettings;
};

export function CartDrawer({
  currencySettings = defaultCurrencySettings,
}: CartDrawerProps) {
  const {
    summary,
    isOpen,
    setOpen,
    isMutating,
    isHydrating,
    updateQuantity,
    removeItem,
  } = useCart();

  const isEmpty = summary.lineItems.length === 0;

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 px-5 pb-4 pt-5">
          <SheetTitle>Your cart</SheetTitle>
          <SheetDescription>
            Review your items before placing the order.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4">
            {isHydrating ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : isEmpty ? (
              <div className="py-12 text-center">
                <ShoppingBag
                  aria-hidden
                  className="mx-auto mb-3 h-8 w-8 text-muted-foreground"
                />
                <p className="text-sm text-muted-foreground">
                  Your cart is empty.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {summary.lineItems.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-start justify-between gap-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {line.name}
                      </p>
                      {line.variation_name &&
                      line.variation_name !== "Default" ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {line.variation_name}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatPriceCents(line.base_price_cents, currencySettings)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {formatPriceCents(line.total_price_cents, currencySettings)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={isMutating}
                          onClick={() =>
                            updateQuantity(line.id, line.quantity - 1)
                          }
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-6 text-center text-sm tabular-nums">
                          {line.quantity}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          disabled={isMutating}
                          onClick={() =>
                            updateQuantity(line.id, line.quantity + 1)
                          }
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          disabled={isMutating}
                          onClick={() => removeItem(line.id)}
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        {!isEmpty ? (
          <>
            <Separator />
            <SheetFooter className="gap-3 px-5 pb-5 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-base font-semibold text-foreground">
                  {formatPriceCents(summary.subtotalCents, currencySettings)}
                </span>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={isMutating}
                // Checkout flow lands in commit #5; this is a placeholder so
                // the surface is testable end-to-end now.
                onClick={() => setOpen(false)}
              >
                Continue
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
