"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { cn } from "@/lib/utils";

import { useCart } from "./cart-provider";

type CartDrawerProps = {
  currencySettings?: CurrencySettings;
};

export function CartDrawer({
  currencySettings = defaultCurrencySettings,
}: CartDrawerProps) {
  // Optimistic UI: no `isMutating` gate on the +/- / Remove controls — each
  // click updates state immediately, the server action runs in the
  // background via the cart provider's transition.
  const { summary, isOpen, setOpen, isHydrating, updateQuantity, removeItem } =
    useCart();

  const isEmpty = summary.lineItems.length === 0;

  return (
    <Drawer open={isOpen} onOpenChange={setOpen}>
      {/*
        Fullscreen bottom drawer: override the shadcn defaults
        (max-h-[80vh] + mt-24) so the cart fills the viewport. Keeps the
        bottom-direction swipe-down dismiss gesture and grabber handle.
      */}
      <DrawerContent
        className={cn(
          "h-[100dvh]",
          "data-[vaul-drawer-direction=bottom]:max-h-[100dvh]",
          "data-[vaul-drawer-direction=bottom]:mt-0",
          "data-[vaul-drawer-direction=bottom]:rounded-t-none",
        )}
      >
        <DrawerHeader className="text-left">
          <DrawerTitle>Your cart</DrawerTitle>
          <DrawerDescription>
            Review your items before placing the order.
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-4">
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
                <li key={line.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-3">
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
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatPriceCents(line.base_price_cents, currencySettings)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-foreground tabular-nums">
                      {formatPriceCents(line.total_price_cents, currencySettings)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() =>
                          updateQuantity(line.id, line.quantity - 1)
                        }
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="min-w-7 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() =>
                          updateQuantity(line.id, line.quantity + 1)
                        }
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => removeItem(line.id)}
                      aria-label="Remove item"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {!isEmpty ? (
          <>
            <Separator />
            <DrawerFooter className="gap-3 pb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-base font-semibold text-foreground tabular-nums">
                  {formatPriceCents(summary.subtotalCents, currencySettings)}
                </span>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full"
                // Checkout flow lands in commit #5; placeholder for now.
                onClick={() => setOpen(false)}
              >
                Continue
              </Button>
            </DrawerFooter>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
