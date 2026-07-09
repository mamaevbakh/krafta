"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { useT } from "@/lib/locales/dashboard/context";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { useAnimatedNumber } from "@/lib/hooks/use-animated-number";
import { cn } from "@/lib/utils";

import type { DayMetrics } from "@/lib/dashboard/overview";

type KpiCardProps = {
  today: DayMetrics;
  todayOrderCount: number; // pre-cap count for the "500+" guard
  truncated: boolean;
  yesterday: DayMetrics | null;
  weekAgo: DayMetrics | null; // same weekday last week (delta baseline)
  weekAgoDelta: number | null; // percent, or null when suppressed
  currency: CurrencySettings;
};

function Money({
  cents,
  currency,
  className,
}: {
  cents: number;
  currency: CurrencySettings;
  className?: string;
}) {
  const animated = Math.round(useAnimatedNumber(cents));
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {formatPriceCents(animated, currency)}
    </span>
  );
}

export function KpiCard({
  today,
  todayOrderCount,
  truncated,
  yesterday,
  weekAgoDelta,
  currency,
}: KpiCardProps) {
  const t = useT();
  const ordersLabel = truncated ? `${todayOrderCount}+` : String(today.orders);

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {/* Revenue — full width on mobile, first cell on desktop */}
        <div className="p-4">
          <p className="text-xs text-muted-foreground">
            {t("overview.revenue_today")}
          </p>
          <Money
            cents={today.revenueCents}
            currency={currency}
            className="mt-1 block text-2xl font-semibold"
          />
          {yesterday && (yesterday.orders > 0 || today.orders === 0) ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("overview.yesterday")}:{" "}
              <span className="font-mono tabular-nums">
                {formatPriceCents(yesterday.revenueCents, currency)}
              </span>{" "}
              · {yesterday.orders}{" "}
              {yesterday.orders === 1
                ? t("overview.order_one")
                : t("overview.order_other")}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 divide-x sm:contents">
          {/* Orders */}
          <div className="p-4">
            <p className="text-xs text-muted-foreground">{t("overview.orders")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {ordersLabel}
            </p>
            {!truncated && weekAgoDelta !== null ? (
              <DeltaLine value={weekAgoDelta} />
            ) : null}
          </div>

          {/* Average check */}
          <div className="p-4">
            <p className="text-xs text-muted-foreground">
              {t("overview.avg_order")}
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {today.avgCheckCents === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Money cents={today.avgCheckCents} currency={currency} />
              )}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Monochrome delta line — direction shown by the arrow glyph, never by color. */
function DeltaLine({ value }: { value: number }) {
  const t = useT();
  if (value === 0) {
    return (
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {t("overview.delta_same")}
      </p>
    );
  }
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <p className="mt-1 inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {t("overview.delta_vs_last_week", { value: Math.abs(value) })}
    </p>
  );
}
