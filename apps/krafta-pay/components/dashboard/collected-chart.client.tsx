"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";

import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { XAxis } from "@/components/dither-kit/x-axis";
import { Tooltip } from "@/components/dither-kit/tooltip";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMinorAmount } from "@/lib/format";
import { useT, usePayLocale } from "@/lib/locales/context";
import { payLocaleTag } from "@/lib/locales/locale";
import type { PayMessageKey } from "@/lib/locales/messages";

/**
 * Money collected, over a range the merchant picks.
 *
 * TWO SERIES BEHIND ONE CONTROL. "Today" and "last week" are questions about
 * days; "3 months" and "6 months" are questions about months. Answering the
 * short ranges by slicing the monthly series would draw one bar covering a
 * month the merchant is standing in the middle of — so the short ranges read
 * the daily series and the long ones read the monthly one.
 *
 * A DROPDOWN, NOT A ROW OF TOGGLES. Five ranges do not fit across a card
 * header at 375px, and a control that wraps to a second line stops reading as
 * a single choice. Same shape as the organisation switcher so the two behave
 * alike.
 *
 * ON THE COLOUR. dither-kit's palette is a fixed set of names rather than our
 * oklch tokens, so this cannot reference --chart-1. `blue` sits closest to the
 * existing chart accent and, unlike purple or pink, avoids DESIGN.md's colour
 * blacklist.
 */

type RangeKey = "today" | "week" | "month" | "3mo" | "6mo";

const RANGES: Array<{ key: RangeKey; labelKey: PayMessageKey; captionKey: PayMessageKey }> = [
  { key: "today", labelKey: "overview.range.today", captionKey: "overview.range.todayCaption" },
  { key: "week", labelKey: "overview.range.week", captionKey: "overview.range.weekCaption" },
  { key: "month", labelKey: "overview.range.month", captionKey: "overview.range.monthCaption" },
  { key: "3mo", labelKey: "overview.range.3mo", captionKey: "overview.range.3moCaption" },
  { key: "6mo", labelKey: "overview.range.6mo", captionKey: "overview.range.6moCaption" },
];

/** How many days each short range covers; absent means it reads months. */
const DAYS: Partial<Record<RangeKey, number>> = { today: 1, week: 7, month: 30 };

export function CollectedChart({
  monthly,
  daily,
  currency,
}: {
  monthly: Array<{ month: string; collectedMinor: number }>;
  daily: Array<{ day: string; collectedMinor: number }>;
  currency: string;
}) {
  const t = useT();
  const locale = usePayLocale();
  const [range, setRange] = useState<RangeKey>("6mo");
  const active = RANGES.find((r) => r.key === range) ?? RANGES[4];

  const tag = payLocaleTag(locale);
  const days = DAYS[range];

  const points = days
    ? daily.slice(-days).map((d) => ({
        label: new Date(`${d.day}T00:00:00.000Z`).toLocaleDateString(tag, {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }),
        collected: d.collectedMinor / 100,
      }))
    : monthly.slice(range === "3mo" ? -3 : -6).map((d) => {
        const [year, month] = d.month.split("-").map(Number);
        return {
          label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(tag, {
            month: "short",
            timeZone: "UTC",
          }),
          // Major units: minor would render UZS two orders of magnitude high.
          collected: d.collectedMinor / 100,
        };
      });

  // The total for the chosen window, so the range answers "how much" without
  // the reader having to add the plot up by eye.
  const total = points.reduce((sum, p) => sum + p.collected, 0) * 100;

  const config = {
    collected: { label: t("overview.chart.collected"), color: "blue" as const },
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{t("overview.chart.title")}</CardTitle>
        <CardDescription>
          {t(active.captionKey)} · {formatMinorAmount(total, currency)}
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="gap-2">
                  {t(active.labelKey)}
                  <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              {RANGES.map((r) => (
                <DropdownMenuItem key={r.key} onClick={() => setRange(r.key)}>
                  {t(r.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        <AreaChart data={points} config={config} className="h-[240px] w-full" bloom="low">
          {/* Grid and YAxis are omitted deliberately: adding either makes
              dither-kit's Area draw nothing at all — the SVG mounts at the
              right size and stays empty. The scale lives in the caption above
              and in the tooltip until that is understood. */}
          <XAxis dataKey="label" />
          <Tooltip
            labelKey="label"
            valueFormatter={(value: number) => formatMinorAmount(value * 100, currency)}
          />
          <Area dataKey="collected" variant="gradient" />
        </AreaChart>
      </CardContent>
    </Card>
  );
}
