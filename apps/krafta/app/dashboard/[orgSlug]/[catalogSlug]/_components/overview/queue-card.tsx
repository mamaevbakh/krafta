"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useT, useDashboardLocale } from "@/lib/locales/dashboard/context";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import {
  transitionOrderState,
  type OrderAction,
} from "../../orders/_components/actions";
import { orderTotalCents } from "@/lib/dashboard/overview";
import { cn } from "@/lib/utils";

import { MODE_ICON, formatRelative } from "./shared";
import type { OverviewOrder } from "./types";

type QueueCardProps = {
  orders: OverviewOrder[]; // today's orders, any state
  currency: CurrencySettings;
  ordersHref: string;
  catalogPath: string;
  paused: boolean;
};

// Which action a given fulfillment state advances to, and its button label.
// dine_in has no "ready" stage — it hands off straight from accepted.
function nextAction(order: OverviewOrder): {
  action: OrderAction;
  labelKey:
    | "overview.action_accept"
    | "overview.action_ready"
    | "overview.action_hand_off";
} | null {
  const s = order.fulfillmentState;
  if (s === "proposed")
    return { action: "accept", labelKey: "overview.action_accept" };
  if (s === "reserved") {
    return order.mode === "dine_in"
      ? { action: "mark_completed", labelKey: "overview.action_hand_off" }
      : { action: "mark_ready", labelKey: "overview.action_ready" };
  }
  if (s === "prepared")
    return { action: "mark_completed", labelKey: "overview.action_hand_off" };
  return null;
}

export function QueueCard({
  orders,
  currency,
  ordersHref,
  catalogPath,
  paused,
}: QueueCardProps) {
  const t = useT();
  // The queue is orders still needing a hand: anything open with a non-terminal
  // fulfillment state. Newest first.
  const active = orders.filter(
    (o) =>
      o.state === "open" &&
      o.fulfillmentState !== "completed" &&
      o.fulfillmentState !== "canceled" &&
      o.fulfillmentState !== "failed",
  );
  const newCount = active.filter(
    (o) => o.fulfillmentState === "proposed",
  ).length;
  const visible = active.slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg font-medium">
          {t("overview.needs_attention")}
          {active.length > 0 ? (
            <Badge
              variant={newCount > 0 ? "destructive" : "secondary"}
              className="font-mono tabular-nums"
            >
              {active.length}
            </Badge>
          ) : null}
        </CardTitle>
        {active.length > 5 ? (
          <Link
            href={ordersHref}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("overview.all_orders")} →
          </Link>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {active.length === 0 ? (
          <div className="flex items-center gap-2 px-6 py-6 text-sm text-muted-foreground">
            <Check className="size-4" aria-hidden />
            {paused ? t("overview.queue_paused") : t("overview.all_handled")}
          </div>
        ) : (
          <ul className="divide-y border-t">
            {visible.map((order) => (
              <QueueRow
                key={order.id}
                order={order}
                currency={currency}
                ordersHref={ordersHref}
                catalogPath={catalogPath}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QueueRow({
  order,
  currency,
  ordersHref,
  catalogPath,
}: {
  order: OverviewOrder;
  currency: CurrencySettings;
  ordersHref: string;
  catalogPath: string;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const Icon = order.mode ? MODE_ICON[order.mode] : null;
  const next = nextAction(order);
  const total = orderTotalCents(order);

  function runAction(action: OrderAction) {
    if (!order.fulfillmentId) return;
    setError(null);
    startTransition(async () => {
      const res = await transitionOrderState({
        orderId: order.id,
        fulfillmentId: order.fulfillmentId!,
        action,
        catalogPath,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex min-h-11 items-center gap-3 px-6 py-3">
      <Link href={ordersHref} className="flex min-w-0 flex-1 items-center gap-2">
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        <span className="font-mono text-sm font-medium">{order.reference}</span>
        <span className="truncate text-xs text-muted-foreground">
          {order.customerLabel} · {formatRelative(order.createdAt, locale)}
        </span>
      </Link>

      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
        {formatPriceCents(total, currency)}
      </span>

      {next ? (
        <Button
          type="button"
          size="sm"
          variant={next.action === "accept" ? "default" : "outline"}
          disabled={pending}
          onClick={() => runAction(next.action)}
          className={cn("shrink-0", error && "border-destructive")}
          title={error ?? undefined}
        >
          {pending ? "…" : t(next.labelKey)}
        </Button>
      ) : null}
    </li>
  );
}
