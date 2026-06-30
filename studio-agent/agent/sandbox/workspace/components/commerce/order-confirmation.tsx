"use client";

import type { Order } from "@/lib/commerce-client";

import { Button } from "@/components/ui/button";
import { Price } from "./price";
import { PricingSummary } from "./pricing-summary";
import { CheckIcon } from "./icons";

const MODE_LABEL: Record<Order["mode"], string> = {
  dine_in: "Dine-in",
  pickup: "Pickup",
  delivery: "Delivery",
};

const STATE_LABEL: Record<Order["state"], string> = {
  open: "Received",
  reserved: "Reserved",
  prepared: "Prepared",
  completed: "Completed",
  canceled: "Canceled",
};

/**
 * Order-placed confirmation. Renders the engine's authoritative order: short id,
 * state, fulfilment mode, the line items, and the final pricing. "Order more"
 * starts a fresh cart; "Done" closes the drawer.
 */
export function OrderConfirmation({
  order,
  onOrderMore,
  onDone,
}: {
  order: Order;
  onOrderMore: () => void;
  onDone: () => void;
}) {
  const currency = order.pricing.currency;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      role="status"
      aria-live="polite"
    >
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CheckIcon className="size-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">
                Order placed
              </h2>
              <p className="text-sm text-muted-foreground">
                {MODE_LABEL[order.mode]} · {STATE_LABEL[order.state]}
                {order.paymentStatus === "pending" ? " · Pay on arrival" : ""}
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
                #{order.id.slice(0, 8)}
              </p>
            </div>
          </div>

          {/* Line items + totals */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {order.lines.map((line) => (
                <li
                  key={line.lineId}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    <span className="tabular-nums text-muted-foreground">
                      {line.qty}×
                    </span>{" "}
                    {line.name}
                  </span>
                  <Price
                    cents={line.lineTotalCents}
                    currency={currency}
                    className="shrink-0 tabular-nums text-foreground"
                  />
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-3">
              <PricingSummary pricing={order.pricing} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-t border-border p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={onOrderMore}
        >
          Order more
        </Button>
        <Button type="button" size="lg" className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
