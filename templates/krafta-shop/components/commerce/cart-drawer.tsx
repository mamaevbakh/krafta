"use client";

import { useEffect, useState } from "react";

import type { Currency, Order } from "@krafta/commerce";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCart, type DisplayLine } from "./cart-provider";
import { CheckoutForm } from "./checkout-form";
import { BagIcon, CloseIcon, TrashIcon } from "./icons";
import { OrderConfirmation } from "./order-confirmation";
import { Price } from "./price";
import { QuantityStepper } from "./quantity-stepper";
import { useFocusTrap } from "./use-focus-trap";

type Step = "cart" | "checkout" | "placed";

/**
 * The cart, as a slide-in panel with three steps: the line list, the checkout
 * form, and the order confirmation. Mounted once near the app root; opened from
 * anywhere via `useCart().open()`. All money shown here comes from the engine.
 */
export function CartDrawer() {
  const cart = useCart();
  const { isOpen } = cart;

  const [step, setStep] = useState<Step>("cart");
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  // Mount/exit transition.
  const [rendered, setRendered] = useState(isOpen);
  const [shown, setShown] = useState(false);

  // Modal focus: move focus into the panel once it's actually mounted (the panel
  // renders a tick after isOpen via `rendered`), trap Tab, restore on close.
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen && rendered);
  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      // A tick after mount so the panel paints at its off-screen start, then
      // transitions in. setTimeout (not requestAnimationFrame) so the slide
      // still fires when rAF is throttled in a backgrounded / headless tab —
      // otherwise the panel could stay parked off-screen and never appear.
      const id = setTimeout(() => setShown(true), 10);
      return () => clearTimeout(id);
    }
    setShown(false);
    const t = setTimeout(() => setRendered(false), 200);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Reset to the cart step once the panel has fully closed.
  useEffect(() => {
    if (!rendered) {
      setStep("cart");
      setPlacedOrder(null);
    }
  }, [rendered]);

  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cart.close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, cart]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Scrim — decorative; the panel has its own labeled Close button, so this
          stays out of the tab order / a11y tree. */}
      <div
        aria-hidden="true"
        onClick={cart.close}
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex h-full w-full max-w-md flex-col bg-background shadow-xl outline-none transition-transform duration-200 ease-out",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        {step === "cart" ? (
          <CartListStep
            currency={cart.currency}
            onCheckout={() => setStep("checkout")}
          />
        ) : null}
        {step === "checkout" ? (
          <CheckoutForm
            currency={cart.currency}
            onBack={() => setStep("cart")}
            onPlaced={(order) => {
              setPlacedOrder(order);
              setStep("placed");
              // The order is captured; drop the local cart + token so the next
              // visit starts fresh.
              cart.reset();
            }}
          />
        ) : null}
        {step === "placed" && placedOrder ? (
          <OrderConfirmation
            order={placedOrder}
            onOrderMore={() => {
              setPlacedOrder(null);
              setStep("cart");
            }}
            onDone={cart.close}
          />
        ) : null}
      </div>
    </div>
  );
}

function CartListStep({
  currency,
  onCheckout,
}: {
  currency: Currency;
  onCheckout: () => void;
}) {
  const cart = useCart();
  const isEmpty = cart.lines.length === 0;
  const noModes = cart.orderModes.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Your cart</h2>
        <button
          type="button"
          onClick={cart.close}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-4">
        {cart.isHydrating && isEmpty ? (
          <p className="py-16 text-center text-sm text-muted-foreground">…</p>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-border bg-muted">
              <BagIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Your cart is empty
              </p>
              <p className="text-xs text-muted-foreground">
                Add something from the menu to get started.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={cart.close}>
              Continue shopping
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {cart.lines.map((line) => (
              <CartLineRow key={line.lineId} line={line} currency={currency} />
            ))}
          </ul>
        )}
      </div>

      {/* Error */}
      {cart.error ? (
        <p className="mx-4 mb-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground">
          {cart.error}
        </p>
      ) : null}

      {/* Footer */}
      {!isEmpty ? (
        <div className="border-t border-border p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <Price
              cents={cart.subtotalCents}
              currency={currency}
              className="text-base font-semibold tabular-nums"
            />
          </div>
          {noModes ? (
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
              Online ordering isn&apos;t available for this shop right now.
            </p>
          ) : (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={onCheckout}
            >
              Checkout
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CartLineRow({
  line,
  currency,
}: {
  line: DisplayLine;
  currency: Currency;
}) {
  const cart = useCart();
  const modifierSummary = line.modifiers
    .map((m) => m.name)
    .filter(Boolean)
    .join(", ");

  return (
    <li className="flex gap-3 py-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-0.5">
          <p className="truncate text-sm font-medium text-foreground">
            {line.name}
          </p>
          {modifierSummary ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {modifierSummary}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <QuantityStepper
            quantity={line.qty}
            itemName={line.name}
            onDecrement={() => cart.setLineQty(line, line.qty - 1)}
            onIncrement={() => cart.setLineQty(line, line.qty + 1)}
          />
          <button
            type="button"
            onClick={() => cart.removeLine(line)}
            aria-label={`Remove ${line.name}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>
      <Price
        cents={line.lineTotalCents}
        currency={currency}
        className="shrink-0 text-sm font-semibold tabular-nums text-foreground"
      />
    </li>
  );
}
