"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
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
import { CartCheckoutStep } from "./checkout-step";
import { CartPlacedStep } from "./placed-step";
import { PricingBreakdown } from "./pricing-breakdown";

type CartDrawerProps = {
  currencySettings?: CurrencySettings;
};

export function CartDrawer({
  currencySettings = defaultCurrencySettings,
}: CartDrawerProps) {
  const { isOpen, setOpen, step } = useCart();

  return (
    // shouldScaleBackground lets vaul transform the [vaul-drawer-wrapper]
    // element (set in app/[...slug]/layout.tsx) — the page tucks behind
    // the drawer with a small inset + rounded corners, iOS-card-stack feel.
    <Drawer open={isOpen} onOpenChange={setOpen} shouldScaleBackground>
      <DrawerContent
        className={cn(
          "data-[vaul-drawer-direction=bottom]:max-h-[92dvh]",
          "data-[vaul-drawer-direction=bottom]:h-[92dvh]",
          "data-[vaul-drawer-direction=bottom]:mt-0",
        )}
      >
        {step === "cart" ? (
          <CartListStep currencySettings={currencySettings} />
        ) : null}
        {step === "checkout" ? (
          <CartCheckoutStep currencySettings={currencySettings} />
        ) : null}
        {step === "placed" ? (
          <CartPlacedStep currencySettings={currencySettings} />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function CartListStep({
  currencySettings,
}: {
  currencySettings: CurrencySettings;
}) {
  const {
    summary,
    isHydrating,
    updateQuantity,
    removeItem,
    setStep,
    taxes,
  } = useCart();

  const isEmpty = summary.lineItems.length === 0;

  return (
    <div className="flex h-full flex-col">
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
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
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
                    {line.modifiers.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {line.modifiers.map((mod) => {
                          // Three display flavors:
                          //  • text-mode: "Note: <typed text>" — no price,
                          //    no qty (text-mode quantity is always 1).
                          //  • list-mode qty=1: "+ Pepperoni" (+ price)
                          //  • list-mode qty>1: "+ Pepperoni × 3" (+ price)
                          const isText = mod.text_value !== null;
                          const showQty = !isText && mod.quantity > 1;
                          return (
                            <li
                              key={mod.id}
                              className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                            >
                              <span className="min-w-0 truncate">
                                {isText ? (
                                  <>
                                    <span className="font-medium">
                                      {mod.name}:
                                    </span>{" "}
                                    <span className="italic">
                                      “{mod.text_value}”
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    + {mod.name}
                                    {showQty ? (
                                      <span className="ml-1 tabular-nums">
                                        × {mod.quantity}
                                      </span>
                                    ) : null}
                                  </>
                                )}
                              </span>
                              {!isText && mod.base_price_cents_delta > 0 ? (
                                <span className="shrink-0 font-mono tabular-nums">
                                  +
                                  {formatPriceCents(
                                    mod.base_price_cents_delta * mod.quantity,
                                    currencySettings,
                                  )}
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatPriceCents(line.base_price_cents, currencySettings)}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-medium text-foreground tabular-nums">
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
                      onClick={() => updateQuantity(line.id, line.quantity - 1)}
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
                      onClick={() => updateQuantity(line.id, line.quantity + 1)}
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
          <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
            <PricingBreakdown
              subtotalCents={summary.subtotalCents}
              taxes={taxes}
              currencySettings={currencySettings}
            />
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => setStep("checkout")}
            >
              Continue
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
