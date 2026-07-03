"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { orderTotalCents } from "@/lib/dashboard/overview";

import { MODE_ICON, formatRelative } from "./shared";
import type { OverviewOrder } from "./types";

type RecentOrdersProps = {
  orders: OverviewOrder[]; // today's orders, newest first
  currency: CurrencySettings;
  ordersHref: string;
};

const FULFILLMENT_LABEL: Record<
  NonNullable<OverviewOrder["fulfillmentState"]>,
  string
> = {
  proposed: "New",
  reserved: "Accepted",
  prepared: "Ready",
  completed: "Completed",
  canceled: "Canceled",
  failed: "Failed",
};

function stateBadge(order: OverviewOrder) {
  if (order.state === "completed")
    return <Badge variant="secondary">Completed</Badge>;
  if (order.state === "canceled")
    return <Badge variant="outline">Canceled</Badge>;
  const label = order.fulfillmentState
    ? FULFILLMENT_LABEL[order.fulfillmentState] ?? "Open"
    : "Open";
  return <Badge>{label}</Badge>;
}

export function RecentOrders({
  orders,
  currency,
  ordersHref,
}: RecentOrdersProps) {
  const visible = orders.slice(0, 5);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg font-medium">Recent orders</CardTitle>
        <Link
          href={ordersHref}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          All orders →
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            No orders yet today.
          </p>
        ) : (
          <ul className="divide-y border-t">
            {visible.map((order) => {
              const Icon = order.mode ? MODE_ICON[order.mode] : null;
              return (
                <li key={order.id} className="px-6 py-3">
                  <Link href={ordersHref} className="block">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium">
                        {order.reference}
                      </span>
                      <div className="flex items-center gap-2">
                        {stateBadge(order)}
                        <span className="font-mono text-sm tabular-nums">
                          {formatPriceCents(orderTotalCents(order), currency)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
                      <span className="truncate">
                        {formatRelative(order.createdAt)} · {order.customerLabel}{" "}
                        · {order.itemCount}{" "}
                        {order.itemCount === 1 ? "item" : "items"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
