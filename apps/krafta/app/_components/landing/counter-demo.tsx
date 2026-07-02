"use client";

/**
 * counter-demo.tsx — the hero's interactive product proof: "one menu becoming
 * one order", composed as TWO side-by-side surfaces (Variant B · Live Counter).
 * A channel segmented-control sits above both. On the left, the guest menu; on
 * the right, the merchant's live order ticket, stepped down so the pair reads as
 * "the menu flows into the order". Tapping a menu item drops a line into the
 * ticket; switching the channel changes the order context (table / pickup time /
 * delivery address + a UZS fee). This dramatizes Krafta's two-sided POS loop —
 * the thing none of the reference sites can show because they're single-surface.
 *
 * On phones the two surfaces stack (menu above ticket). Built entirely from
 * theme tokens — depth comes from a layered surface (bg-secondary-background) and
 * the downward step, NOT a drop shadow (DESIGN.md §Anti-Slop #9). Motion is
 * user-triggered only (DESIGN.md §Motion): a 200ms slide-in on new ticket lines
 * and a short pulse on the total. Prices use formatSum + font-mono tabular-nums
 * (DESIGN.md §Currency).
 */

import * as React from "react";
import { Plus } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatSum } from "./demo-shared";
import {
  DEMO_ORDER_NUMBER,
  DEMO_DELIVERY_FEE,
  type LandingContent,
} from "./content";

type Line = { name: string; price: number; qty: number };

export function CounterDemo({
  content,
  className,
}: {
  content: LandingContent;
  className?: string;
}) {
  const { demo } = content;
  const [channelKey, setChannelKey] = React.useState(demo.channels[0].key);
  // Seed two lines so the merchant ticket reads as alive on first paint.
  const [lines, setLines] = React.useState<Line[]>(() => [
    { name: demo.items[0].name, price: demo.items[0].price, qty: 1 },
    { name: demo.items[2].name, price: demo.items[2].price, qty: 1 },
  ]);
  // Bumped on every add to replay the total's pulse animation via remount.
  const [pulse, setPulse] = React.useState(0);

  const channel =
    demo.channels.find((c) => c.key === channelKey) ?? demo.channels[0];
  const isDelivery = channelKey === "delivery";

  const itemsTotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const total = itemsTotal + (isDelivery ? DEMO_DELIVERY_FEE : 0);

  const add = React.useCallback((name: string, price: number) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.name === name);
      if (existing) {
        return prev.map((l) =>
          l.name === name ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { name, price, qty: 1 }];
    });
    setPulse((p) => p + 1);
  }, []);

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      {/* Channel selector above both surfaces — the order TYPE the guest places */}
      <Tabs value={channelKey} onValueChange={setChannelKey} className="mb-4">
        <TabsList>
          {demo.channels.map((c) => (
            <TabsTrigger
              key={c.key}
              value={c.key}
              className="font-mono text-[11px] uppercase tracking-wide"
            >
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1.05fr] sm:items-start sm:gap-3">
        {/* Guest side — the menu */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                {demo.shopName}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {demo.shopMeta}
              </span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {demo.menuLabel}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {demo.items.map((item) => (
              <li
                key={item.name}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-sm text-foreground">{item.name}</span>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {formatSum(item.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() => add(item.name, item.price)}
                    aria-label={`${demo.addAria} ${item.name}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Merchant side — the live order ticket, stepped down on desktop */}
        <div className="overflow-hidden rounded-xl border border-border bg-secondary-background sm:mt-10">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">
              {demo.orderTitle}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {DEMO_ORDER_NUMBER} · {channel.context}
            </span>
          </div>

          <ul className="space-y-1.5 px-4 py-4">
            {lines.map((line) => (
              <li
                key={line.name}
                className="flex items-center justify-between gap-3 text-sm duration-200 animate-in fade-in slide-in-from-bottom-1"
              >
                <span className="text-foreground">
                  {line.name}
                  {line.qty > 1 ? (
                    <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                      ×{line.qty}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono tabular-nums text-foreground">
                  {formatSum(line.price * line.qty)}
                </span>
              </li>
            ))}

            {isDelivery ? (
              <li className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>{demo.deliveryFeeLabel}</span>
                <span className="font-mono tabular-nums">
                  {formatSum(DEMO_DELIVERY_FEE)}
                </span>
              </li>
            ) : null}
          </ul>

          <div className="flex items-center justify-between border-t border-border px-4 pt-3">
            <span className="text-sm font-medium text-foreground">
              {demo.totalLabel}
            </span>
            <span
              key={pulse}
              aria-live="polite"
              className="font-mono text-lg font-semibold tabular-nums text-foreground animate-cart-qty-pulse"
            >
              {formatSum(total)}
            </span>
          </div>
          <p className="px-4 pb-4 pt-2.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {demo.keepLine}
          </p>
        </div>
      </div>
    </div>
  );
}
