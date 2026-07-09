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
import type { TopItem } from "@/lib/dashboard/overview";

type TopItemsProps = {
  items: TopItem[];
  currency: CurrencySettings;
};

/**
 * What actually sells over the last 7 days — ranked list, no bars, no
 * thumbnails. Rank + name + ×N + revenue in the DESIGN.md-native treatment.
 * Rows aren't links: there's no per-item report to open in v1.1, so we don't
 * fake one. Only rendered past the same insight gate as the chart.
 */
export function TopItems({ items, currency }: TopItemsProps) {
  const t = useT();
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-baseline justify-between gap-2 space-y-0">
        <CardTitle className="text-lg font-medium">
          {t("overview.popular")}
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {t("overview.days_7")}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y border-t">
          {items.map((item, i) => (
            <li
              key={item.name}
              className="flex items-center gap-3 px-6 py-2.5"
            >
              <span className="w-4 shrink-0 font-mono text-xs text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.name}
              </span>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm tabular-nums">
                  {formatPriceCents(item.revenueCents, currency)}
                </div>
                <div className="font-mono text-xs tabular-nums text-muted-foreground">
                  ×{item.qty}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
