"use client";

import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { XAxis } from "@/components/dither-kit/x-axis";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { formatMinorAmount } from "@/lib/format";
import { useT, usePayLocale } from "@/lib/locales/context";
import { payLocaleTag } from "@/lib/locales/locale";

/**
 * Six months of money actually collected.
 *
 * ONE SERIES, DELIBERATELY. The obvious second series is "expected", and it
 * would be a lie at this resolution: a subscription's expected charge is known
 * only for periods already invoiced, so the current month would always render
 * as a shortfall that has not happened yet. One honest line beats two the
 * reader has to disambiguate.
 *
 * Monthly, not daily. A language school with forty students collects on a
 * handful of days a month — a daily chart is ninety percent empty space
 * pretending to be information.
 *
 * ON THE COLOUR. dither-kit's palette is a fixed set of names, not our oklch
 * tokens, so this cannot reference --chart-1. `blue` is the one that sits
 * closest to the existing chart accent and, unlike purple or pink, does not
 * collide with DESIGN.md's colour blacklist.
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

  const points = data.map((d) => {
    const [year, month] = d.month.split("-").map(Number);
    return {
      month: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(payLocaleTag(locale), {
        month: "short",
        timeZone: "UTC",
      }),
      // Major units: the axis and tooltip both read this, and minor units would
      // render UZS amounts two orders of magnitude too large.
      collected: d.collectedMinor / 100,
    };
  });

  const config = {
    collected: { label: t("overview.chart.collected"), color: "blue" as const },
  };

  return (
    <AreaChart data={points} config={config} className="h-[220px] w-full" bloom="low">
      <XAxis dataKey="month" />
      <Tooltip
        labelKey="month"
        valueFormatter={(value: number) => formatMinorAmount(value * 100, currency)}
      />
      <Area dataKey="collected" variant="gradient" />
    </AreaChart>
  );
}
