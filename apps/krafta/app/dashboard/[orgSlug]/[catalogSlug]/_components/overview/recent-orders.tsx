"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useT, useDashboardLocale } from "@/lib/locales/dashboard/context";
import type { TranslateFn } from "@/lib/locales/dashboard/messages";
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

const FULFILLMENT_LABEL_KEY = {
  proposed: "common.new",
  reserved: "overview.status_accepted",
  prepared: "overview.status_ready",
  completed: "overview.status_completed",
  canceled: "overview.status_canceled",
  failed: "overview.status_failed",
} as const satisfies Record<NonNullable<OverviewOrder["fulfillmentState"]>, string>;

function stateBadge(order: OverviewOrder, t: TranslateFn) {
  if (order.state === "completed")
    return <Badge variant="secondary">{t("overview.status_completed")}</Badge>;
  if (order.state === "canceled")
    return <Badge variant="outline">{t("overview.status_canceled")}</Badge>;
  const key = order.fulfillmentState
    ? FULFILLMENT_LABEL_KEY[order.fulfillmentState] ?? "overview.status_open"
    : "overview.status_open";
  return <Badge>{t(key)}</Badge>;
}

export function RecentOrders({
  orders,
  currency,
  ordersHref,
}: RecentOrdersProps) {
  const t = useT();
  const locale = useDashboardLocale();
  const visible = orders.slice(0, 5);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg font-medium">
          {t("overview.recent_orders")}
        </CardTitle>
        <Link
          href={ordersHref}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("overview.all_orders")} →
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            {t("overview.no_orders_today")}
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
                        {stateBadge(order, t)}
                        <span className="font-mono text-sm tabular-nums">
                          {formatPriceCents(orderTotalCents(order), currency)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
                      <span className="truncate">
                        {formatRelative(order.createdAt, locale)} ·{" "}
                        {order.customerLabel} · {order.itemCount}{" "}
                        {order.itemCount === 1
                          ? t("overview.item_one")
                          : t("overview.item_other")}
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
