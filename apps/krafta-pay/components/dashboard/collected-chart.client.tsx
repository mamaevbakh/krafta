"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMinorAmount } from "@/lib/format";
import { useT } from "@/lib/locales/context";
import { usePayLocale } from "@/lib/locales/context";
import { payLocaleTag } from "@/lib/locales/locale";

/**
 * Six months of money actually collected.
 *
 * ONE SERIES, DELIBERATELY. The obvious second series is "expected", and it
 * would be a lie at this resolution: a subscription's expected charge is known
 * only for periods that have already been invoiced, so the last bar would
 * always look like a shortfall that has not happened yet. Better one honest
 * line than two where the reader has to know which is which.
 *
 * Monthly, not daily. A language school with forty students collects on a
 * handful of days a month — a daily chart is ninety percent empty space
 * pretending to be information.
 */
export function CollectedChart({
  data,
  currency,
}: {
  data: Array<{ month: string; collectedMinor: number }>;
  currency: string;
}) {
  const t = useT();
  const locale = usePayLocale();

  const config = {
    collected: {
      label: t("overview.chart.collected"),
      // The one ratified chart accent (DESIGN.md §Chart palette). A second
      // colour would imply a second meaning.
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  const points = data.map((d) => {
    const [year, month] = d.month.split("-").map(Number);
    return {
      month: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(payLocaleTag(locale), {
        month: "short",
        timeZone: "UTC",
      }),
      collected: d.collectedMinor / 100,
      collectedMinor: d.collectedMinor,
    };
  });

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <AreaChart data={points} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-collected)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-collected)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          width={0}
          tick={false}
          axisLine={false}
          tickLine={false}
          // The axis is suppressed rather than removed: the grid still gives a
          // sense of scale, and the exact number lives in the tooltip and in
          // the figure above the chart. Numbers in two places invite reading
          // one and trusting the other.
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => formatMinorAmount(Number(value) * 100, currency)}
              indicator="line"
            />
          }
        />
        <Area
          dataKey="collected"
          type="monotone"
          stroke="var(--color-collected)"
          strokeWidth={2}
          fill="url(#collectedFill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
