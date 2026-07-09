"use client";

import { useMemo } from "react";
import { ExternalLink, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT, useDashboardLocale } from "@/lib/locales/dashboard/context";
import { useChimeMute } from "@/lib/hooks/use-chime-mute";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import {
  aggregateDay,
  deltaPercent,
  INSIGHT_GATE_ORDERS_7D,
  isRevenueOrder,
  localDateKey,
  orderTotalCents,
  recentDayKeys,
  topItems,
  weekdayLabel,
} from "@/lib/dashboard/overview";

import { KpiCard } from "./kpi-card";
import { QueueCard } from "./queue-card";
import { RecentOrders } from "./recent-orders";
import { FirstOrderCard } from "./first-order-card";
import { SalesBars, type DayBar } from "./sales-bars";
import { TopItems } from "./top-items";
import type { OverviewOrder, PriorOrder } from "./types";

type OverviewPanelProps = {
  catalogId: string;
  catalogName: string;
  orgSlug: string;
  catalogSlug: string;
  catalogStatus: string;
  venueStatus: string | null;
  timeZone: string;
  currencySettings: CurrencySettings;
  todayOrders: OverviewOrder[];
  priorOrders: PriorOrder[];
  lifetimeOrders: number;
  todayTruncated: boolean;
  storefrontUrl: string;
  published: boolean;
  mainQrSvg: string | null;
  telegramUrl: string | null;
  nowIso: string;
};

export function OverviewPanel(props: OverviewPanelProps) {
  const {
    catalogId,
    orgSlug,
    catalogSlug,
    catalogStatus,
    venueStatus,
    timeZone,
    currencySettings,
    todayOrders,
    priorOrders,
    lifetimeOrders,
    todayTruncated,
    storefrontUrl,
    published,
    mainQrSvg,
    telegramUrl,
    nowIso,
  } = props;

  const t = useT();
  const locale = useDashboardLocale();

  const ordersHref = `/dashboard/${orgSlug}/${catalogSlug}/orders`;
  const qrHref = `/dashboard/${orgSlug}/${catalogSlug}/qr-codes`;
  const catalogPath = `/dashboard/${orgSlug}/${catalogSlug}`;
  const paused = venueStatus === "paused";
  const isBrandNew = lifetimeOrders === 0;

  // The chime + live refresh live in <OrderAlerts> at the layout level (rings
  // on every dashboard page). This header toggle stays in sync via the shared
  // per-catalog mute key.
  const { muted, toggle: toggleMute } = useChimeMute(catalogId);

  // ---- derived metrics (one source: today + prior orders) ------------------
  const metrics = useMemo(() => {
    const now = new Date(nowIso);
    const dayKeys = recentDayKeys(now, timeZone, 7); // -6 … today
    const todayKey = dayKeys[dayKeys.length - 1];
    const yesterdayKey = dayKeys[dayKeys.length - 2];
    const weekAgoKey = localDateKey(
      new Date(
        new Date(`${todayKey}T12:00:00Z`).getTime() - 7 * 86400 * 1000,
      ).toISOString(),
      timeZone,
    );

    const priorByDay = new Map<string, PriorOrder[]>();
    for (const o of priorOrders) {
      const key = localDateKey(o.createdAt, timeZone);
      const arr = priorByDay.get(key) ?? [];
      arr.push(o);
      priorByDay.set(key, arr);
    }

    const today = aggregateDay(
      todayOrders.map((o) => ({
        state: o.state,
        createdAt: o.createdAt,
        lineItems: o.lineItems,
      })),
    );
    const yesterday = priorByDay.has(yesterdayKey)
      ? aggregateDay(priorByDay.get(yesterdayKey)!)
      : { revenueCents: 0, orders: 0, avgCheckCents: null };
    const weekAgo = priorByDay.has(weekAgoKey)
      ? aggregateDay(priorByDay.get(weekAgoKey)!)
      : { revenueCents: 0, orders: 0, avgCheckCents: null };
    const weekAgoDelta = deltaPercent(
      today.orders,
      weekAgo.orders,
      weekAgo.orders,
    );

    // 7-day bars: revenue per day key across today + prior orders.
    const revByDay = new Map<string, number>();
    const addRev = (o: { state: string; createdAt: string; lineItems: { totalPriceCents: number }[] }) => {
      if (!isRevenueOrder(o.state)) return;
      const key = localDateKey(o.createdAt, timeZone);
      revByDay.set(key, (revByDay.get(key) ?? 0) + orderTotalCents(o));
    };
    todayOrders.forEach(addRev);
    priorOrders.forEach(addRev);
    const bars: DayBar[] = dayKeys.map((key) => ({
      key,
      label: weekdayLabel(key, locale),
      revenueCents: revByDay.get(key) ?? 0,
      isToday: key === todayKey,
    }));

    // Insight gate: enough recent volume across enough days to be meaningful.
    const last7Set = new Set(dayKeys);
    const last7Orders = [
      ...todayOrders.map((o) => ({ state: o.state, createdAt: o.createdAt, lineItems: o.lineItems })),
      ...priorOrders,
    ].filter(
      (o) => isRevenueOrder(o.state) && last7Set.has(localDateKey(o.createdAt, timeZone)),
    );
    const distinctDays = new Set(
      last7Orders.map((o) => localDateKey(o.createdAt, timeZone)),
    ).size;
    const showInsights =
      last7Orders.length >= INSIGHT_GATE_ORDERS_7D && distinctDays >= 2;
    const popular = topItems(last7Orders, 5);

    return {
      today,
      yesterday,
      weekAgo,
      weekAgoDelta,
      bars,
      showInsights,
      popular,
    };
  }, [nowIso, timeZone, todayOrders, priorOrders, locale]);

  const statusLine = paused
    ? t("overview.status_paused")
    : catalogStatus === "draft"
      ? t("overview.status_draft")
      : t("overview.status_taking_orders");
  const dateLine = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(nowIso));

  return (
    <main className="w-full">
      {/* Header band — matches the Orders page convention exactly */}
      <div className="w-full border-b">
        <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between gap-4 px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">
              {t("overview.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {dateLine} · {statusLine}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              aria-pressed={muted}
              title={muted ? t("overview.sound_off") : t("overview.sound_on")}
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden />
              ) : (
                <Volume2 className="size-4" aria-hidden />
              )}
            </Button>
            {published ? (
              <Button asChild variant="outline" size="sm">
                <a href={storefrontUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{t("overview.open_shop")}</span>
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] space-y-6 px-6 py-6 pb-24">
        {isBrandNew ? (
          <FirstOrderCard
            storefrontUrl={storefrontUrl}
            published={published}
            qrHref={qrHref}
            mainQrSvg={mainQrSvg}
            telegramUrl={telegramUrl}
          />
        ) : (
          <>
            <QueueCard
              orders={todayOrders}
              currency={currencySettings}
              ordersHref={ordersHref}
              catalogPath={catalogPath}
              paused={paused}
            />

            <KpiCard
              today={metrics.today}
              todayOrderCount={metrics.today.orders}
              truncated={todayTruncated}
              yesterday={metrics.yesterday}
              weekAgo={metrics.weekAgo}
              weekAgoDelta={metrics.weekAgoDelta}
              currency={currencySettings}
            />

            {metrics.showInsights ? (
              <SalesBars days={metrics.bars} currency={currencySettings} />
            ) : null}

            {metrics.showInsights && metrics.popular.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <RecentOrders
                    orders={todayOrders}
                    currency={currencySettings}
                    ordersHref={ordersHref}
                  />
                </div>
                <div className="lg:col-span-5">
                  <TopItems
                    items={metrics.popular}
                    currency={currencySettings}
                  />
                </div>
              </div>
            ) : (
              <RecentOrders
                orders={todayOrders}
                currency={currencySettings}
                ordersHref={ordersHref}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
