/**
 * merchant-orders.tsx — a static, token-built mock of the MERCHANT order list,
 * used as the large cell of the features bento. The current landing only ever
 * showed the customer menu; this shows what the merchant actually buys: every
 * dine-in / pickup / delivery order on one screen, in order-ticket grammar
 * (mono order number · channel · context) with UZS totals in tabular-nums.
 *
 * Locale-aware via content.demo (channel labels, item names). No screenshot,
 * no gradient, no shadow — borders + secondary-background only.
 */

import { cn } from "@/lib/utils";
import { formatSum } from "./demo-shared";
import { DEMO_DELIVERY_FEE, type LandingContent } from "./content";

export function MerchantOrders({
  content,
  className,
}: {
  content: LandingContent;
  className?: string;
}) {
  const { demo } = content;
  const [dinein, pickup, delivery] = demo.channels;
  const [coffee, raf, cheesecake, tiramisu] = demo.items;

  const orders = [
    {
      num: "#0042",
      channel: dinein,
      lines: [coffee, raf],
      extraFee: 0,
    },
    {
      num: "#0041",
      channel: delivery,
      lines: [cheesecake],
      extraFee: DEMO_DELIVERY_FEE,
    },
    {
      num: "#0040",
      channel: pickup,
      lines: [tiramisu],
      extraFee: 0,
    },
  ];

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-secondary-background px-5 py-4">
        <span className="text-sm font-semibold text-foreground">
          {demo.orderTitle.replace(/^./, (c) => c.toUpperCase())}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {content.features.mockCaption}
        </span>
      </div>

      <ul className="flex-1 divide-y divide-border">
        {orders.map((order, i) => {
          const total =
            order.lines.reduce((sum, l) => sum + l.price, 0) + order.extraFee;
          return (
            <li
              key={order.num}
              className="flex items-start justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {/* live-order dot only on the newest ticket */}
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      i === 0 ? "bg-foreground" : "bg-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                  <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    {order.num} · {order.channel.label} · {order.channel.context}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-foreground">
                  {order.lines.map((l) => l.name).join(", ")}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                {formatSum(total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
