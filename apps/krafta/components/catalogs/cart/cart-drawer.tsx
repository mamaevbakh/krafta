"use client";

import Image from "next/image";
import { ImageIcon, ShoppingCart, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";
import { TelegramBackButton } from "@/components/telegram/telegram-back-button";

import { CartStepper } from "./cart-stepper";
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
  const { isOpen, setOpen, step, setStep, close } = useCart();

  return (
    // shouldScaleBackground lets vaul transform the [vaul-drawer-wrapper]
    // element (set in app/[...slug]/layout.tsx) — the page tucks behind
    // the drawer with a small inset + rounded corners, iOS-card-stack feel.
    <Drawer open={isOpen} onOpenChange={setOpen} shouldScaleBackground>
      {/* Telegram Back control: on checkout step go back to the list,
          otherwise close the drawer (close() also resets the placed step). */}
      <TelegramBackButton
        active={isOpen}
        onBack={() => (step === "checkout" ? setStep("cart") : close())}
      />
      <DrawerContent
        className={cn(
          "data-[vaul-drawer-direction=bottom]:max-h-[92dvh]",
          "data-[vaul-drawer-direction=bottom]:h-[92dvh]",
          "data-[vaul-drawer-direction=bottom]:mt-0",
          // Center the drawer on desktop so it doesn't span the full
          // viewport width. Mobile keeps the full-bleed bottom-sheet feel.
          "sm:data-[vaul-drawer-direction=bottom]:max-w-md sm:data-[vaul-drawer-direction=bottom]:mx-auto",
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
    bumpQuantity,
    removeItem,
    setStep,
    taxes,
    dineInLock,
  } = useCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  const isEmpty = summary.lineItems.length === 0;

  return (
    // flex-1 + min-h-0: drawer-content is a flex column with a 24px
    // handle child. Default min-height:auto on flex items blocks
    // shrinking — without min-h-0, this column overflows the drawer.
    // See full note in checkout-step.tsx.
    <div className="flex min-h-0 flex-1 flex-col">
      <DrawerHeader className="text-center">
        <DrawerTitle className="text-lg">{t("cart.title")}</DrawerTitle>
        {dineInLock ? (
          <p className="mx-auto mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-foreground">
            {t("cart.mode_pill.dine_in", { table: dineInLock.tableLabel })}
          </p>
        ) : null}
      </DrawerHeader>

      {/* Plain overflow-y-auto div rather than Radix ScrollArea — Radix
          sets its inner wrapper to width:fit-content which lets a long
          item name escape the viewport and break truncate. mx-auto
          max-w-md centers the column on wider drawers. */}
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4">
          {isHydrating ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              …
            </p>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full border border-border bg-muted/40">
                <ShoppingCart
                  aria-hidden
                  className="h-5 w-5 text-muted-foreground"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t("cart.empty")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("cart.empty.hint")}
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {summary.lineItems.map((line) => (
                <CartLine
                  key={line.id}
                  line={line}
                  currencySettings={currencySettings}
                  onDecrement={() => bumpQuantity(line.id, -1)}
                  onIncrement={() => bumpQuantity(line.id, +1)}
                  onRemove={() => removeItem(line.id)}
                  removeLabel={t("aria.remove_item")}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {!isEmpty ? (
        // Sticky footer with safe-area padding so the CTA never hugs the
        // home-indicator on iOS PWAs. Border-t separates the pricing
        // from the scrollable lines above; the subtle bg/40 lift mirrors
        // the storefront-dock surface and signals "this row is fixed".
        // Inner max-w-md mirrors the scroll content so the CTA reads at
        // the same width on wider drawers (tablet, webviews).
        <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <PricingBreakdown
              subtotalCents={summary.subtotalCents}
              taxes={taxes}
              currencySettings={currencySettings}
            />
            <Button
              type="button"
              size="xl"
              className="mt-3 w-full"
              onClick={() => setStep("checkout")}
            >
              {t("cart.continue")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Line item ────────────────────────────────────────────────────────────────
// Mobile-first grid: [56px photo | meta+stepper (min-w-0, grows) | price].
// `min-w-0` on the meta column is what lets the name truncate gracefully
// on 320px viewports — without it the long item name overflows and the
// price slides off-screen (the iPhone SE bug from the screenshots).
type CartLineProps = {
  line: import("@/lib/cart/orders").CartLineItem;
  currencySettings: CurrencySettings;
  onDecrement: () => void;
  onIncrement: () => void;
  onRemove: () => void;
  removeLabel: string;
};

function CartLine({
  line,
  currencySettings,
  onDecrement,
  onIncrement,
  onRemove,
  removeLabel,
}: CartLineProps) {
  const variation =
    line.variation_name && line.variation_name !== "Default"
      ? line.variation_name
      : null;

  return (
    <li
      className={cn(
        "grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 py-4",
        "animate-in fade-in-0 duration-200",
      )}
    >
      {/* Thumbnail. 56×56 rounded-md to match the customisations-drawer
          and item-detail card surfaces. ImageIcon placeholder when the
          item has no photo — calmer than an empty muted square. */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {line.image_url ? (
          <Image
            src={line.image_url}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <ImageIcon
            aria-hidden
            className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/40"
          />
        )}
      </div>

      {/* Meta + stepper column. min-w-0 so the truncate inside `name`
          actually triggers instead of pushing the price slot off-screen. */}
      <div className="min-w-0 space-y-2">
        <div className="space-y-0.5">
          <p className="truncate text-sm font-medium text-foreground">
            {line.name}
          </p>
          {variation ? (
            <p className="truncate text-xs text-muted-foreground">
              {variation}
            </p>
          ) : null}
          {line.modifiers.length > 0 ? (
            <ul className="space-y-0.5 pt-0.5">
              {line.modifiers.map((mod) => {
                // Three display flavors (unchanged from previous design):
                //  • text-mode: "Note: <typed text>" — no price, no qty.
                //  • list-mode qty=1: "+ Pepperoni" (+ price)
                //  • list-mode qty>1: "+ Pepperoni × 3" (+ price)
                const isText = mod.text_value !== null;
                const showQty = !isText && mod.quantity > 1;
                return (
                  <li
                    key={mod.id}
                    className="flex items-baseline gap-2 text-xs text-muted-foreground"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {isText ? (
                        <>
                          <span className="font-medium">{mod.name}:</span>{" "}
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
        </div>

        {/* Stepper + trash sit together with a fixed gap so the trash
            icon doesn't drift line-to-line as the price column changes
            width (longer UZS prices squeeze the meta column narrower,
            which would otherwise pull the trash left). gap-3 matches the
            grid's outer gap so the two controls read as one cluster. */}
        <div className="flex items-center gap-3">
          <CartStepper
            variant="drawer"
            quantity={line.quantity}
            itemName={line.name}
            onDecrement={onDecrement}
            onIncrement={onIncrement}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label={removeLabel}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Line total. Pinned top-right so the customer's eye lands on
          price immediately — the mobile-first cart-list pattern Square
          and DoorDash both use. font-mono tabular-nums keeps long UZS
          prices from jittering on quantity bumps. */}
      <p className="shrink-0 font-mono text-sm font-semibold text-foreground tabular-nums">
        {formatPriceCents(line.total_price_cents, currencySettings)}
      </p>
    </li>
  );
}
