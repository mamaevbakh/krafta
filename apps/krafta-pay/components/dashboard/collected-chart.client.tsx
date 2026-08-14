"use client";

import { useState } from "react";

import { AreaChart } from "@/components/dither-kit/area-chart";
import { Area } from "@/components/dither-kit/area";
import { XAxis } from "@/components/dither-kit/x-axis";
import { Tooltip } from "@/components/dither-kit/tooltip";
import {
  Card,
  CardAction,
  CardDescription,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMinorAmount } from "@/lib/format";
import { useT, usePayLocale } from "@/lib/locales/context";
import { payLocaleTag } from "@/lib/locales/locale";

/**
 * Money collected, by month.
 *
 * IN A CARD, WITH A HEADER AND A RANGE. The first version was a bare canvas
 * dropped into the page with no frame, no axis and no controls, and it read as
 * a decoration rather than a figure. A chart needs to say what it is measuring
 * and over what window, or the reader has to reconstruct both from context.
 *
 * ONE SERIES, DELIBERATELY. The obvious second is "expected", and it would be
 * a lie at this resolution: a subscription's expected charge is only known for
 * periods already invoiced, so the current month would always render as a
 * shortfall that has not happened yet.
 *
 * Monthly, not daily. A school collecting from forty students bills on a
 * handful of days — a daily axis is mostly empty space pretending to be
 * information.
 *
 * ON THE COLOUR. dither-kit's palette is a fixed set of names rather than our
 * oklch tokens, so this cannot reference --chart-1. `blue` sits closest to the
 * existing chart accent and, unlike purple or pink, does not collide with
 * DESIGN.md's colour blacklist.
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
  const [months, setMonths] = useState<"3" | "6">("6");

  const window = data.slice(months === "3" ? -3 : -6);

  const points = window.map((d) => {
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
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{t("overview.chart.title")}</CardTitle>
        <CardDescription>
          {months === "3" ? t("overview.chart.range.3") : t("overview.chart.range.6")}
        </CardDescription>
        <CardAction>
          {/* Base UI's ToggleGroup is multi-select by nature — the value is an
              array, not a string as it is in Radix. Keeping a single-element
              array is what makes it behave as a radio. */}
          <ToggleGroup
            value={[months]}
            onValueChange={(v) => {
              const next = v[v.length - 1];
              if (next === "3" || next === "6") setMonths(next);
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="6">{t("overview.chart.toggle.6")}</ToggleGroupItem>
            <ToggleGroupItem value="3">{t("overview.chart.toggle.3")}</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        <AreaChart data={points} config={config} className="h-[240px] w-full" bloom="low">
          {/* Grid and YAxis are OMITTED on purpose: adding either makes
              dither-kit's Area render nothing at all — the SVG mounts at the
              right size and stays empty. Not yet diagnosed; the scale lives in
              the tooltip and in the card above until it is. */}
          <XAxis dataKey="month" />
          <Tooltip
            labelKey="month"
            valueFormatter={(value: number) => formatMinorAmount(value * 100, currency)}
          />
          <Area dataKey="collected" variant="gradient" />
        </AreaChart>
      </CardContent>
    </Card>
  );
}
