"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useT } from "@/lib/locales/dashboard/context";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

export type DayBar = {
  key: string; // YYYY-MM-DD
  label: string; // weekday initial(s)
  revenueCents: number;
  isToday: boolean;
};

type SalesBarsProps = {
  days: DayBar[]; // oldest → today
  currency: CurrencySettings;
};

/**
 * The one chart — seven static daily revenue bars, hand-rolled divs (no chart
 * lib: a dependency for seven bars isn't justified). Today is full opacity,
 * prior days dimmed — Square's emphasis without a dotted overlay. No tooltips,
 * no tabs, no hover dependency. Only rendered past the insight gate.
 */
export function SalesBars({ days, currency }: SalesBarsProps) {
  const t = useT();
  const max = Math.max(1, ...days.map((d) => d.revenueCents));
  const peak = days.reduce((a, b) => (b.revenueCents > a.revenueCents ? b : a));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">
          {t("overview.revenue_7d")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-24 items-end gap-2"
          role="img"
          aria-label={t("overview.revenue_chart_aria", {
            peak: formatPriceCents(peak.revenueCents, currency),
          })}
        >
          {days.map((d) => {
            const pct = Math.round((d.revenueCents / max) * 100);
            return (
              <div
                key={d.key}
                className="flex flex-1 items-end"
                style={{ height: "100%" }}
              >
                <div
                  className="w-full rounded-xs"
                  style={{
                    height: `${Math.max(pct, d.revenueCents > 0 ? 4 : 1)}%`,
                    backgroundColor: "var(--chart-1)",
                    opacity: d.isToday ? 1 : 0.4,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          {days.map((d) => (
            <div
              key={d.key}
              className="flex-1 text-center text-xs text-muted-foreground"
            >
              {d.label}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("overview.peak")}{" "}
          <span className="font-mono tabular-nums">
            {formatPriceCents(peak.revenueCents, currency)}
          </span>{" "}
          {t("overview.peak_on_day", { day: peak.label })}
        </p>
      </CardContent>
    </Card>
  );
}
