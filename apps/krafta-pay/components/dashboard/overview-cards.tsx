import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMinorAmount } from "@/lib/format";
import type { TranslateFn } from "@/lib/locales/messages";
import type { OverviewData } from "@/lib/overview";
import { percentChange } from "@/lib/overview";

/**
 * The figures across the top.
 *
 * Every card carries a number, a movement, and a sentence saying what the
 * movement means. The number alone is trivia — "23,203,000 UZS" answers
 * nothing without "up 12% on last month" next to it. That is the whole reason
 * these are cards rather than the bare divider-separated cells they were: the
 * takeaway line needs somewhere to live.
 *
 * A missing comparison renders as nothing at all rather than as 0% or +100%.
 * A merchant's first month has no previous month, and both of those read as a
 * result instead of an absence.
 */
export function OverviewCards({
  overview,
  t,
}: {
  overview: OverviewData;
  t: TranslateFn;
}) {
  const change = percentChange(
    overview.collectedThisMonthMinor,
    overview.collectedLastMonthMinor,
  );
  const rising = (change ?? 0) >= 0;
  const TrendIcon = rising ? TrendingUp : TrendingDown;

  const failing = overview.rows.filter((r) => r.kind === "failed").length;
  const awaiting = overview.rows.filter((r) => r.kind === "awaiting").length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card size="sm">
        <CardHeader>
          <CardDescription>{t("overview.collected")}</CardDescription>
          <CardTitle className="font-mono text-2xl tabular-nums">
            {formatMinorAmount(overview.collectedThisMonthMinor, overview.currency)}
          </CardTitle>
          {change !== null ? (
            <CardAction>
              <Badge variant="outline" className="gap-1">
                <TrendIcon className="size-3" aria-hidden />
                {rising ? "+" : ""}
                {change}%
              </Badge>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            {change === null
              ? t("overview.card.collected.first")
              : rising
                ? t("overview.card.collected.up")
                : t("overview.card.collected.down")}
            {change !== null ? <TrendIcon className="size-4" aria-hidden /> : null}
          </span>
          <span className="text-muted-foreground">
            {t("overview.card.collected.caption")}
          </span>
        </CardFooter>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardDescription>{t("overview.outstanding")}</CardDescription>
          <CardTitle className="font-mono text-2xl tabular-nums">
            {formatMinorAmount(overview.outstandingMinor, overview.currency)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="tabular-nums">
              {awaiting}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <span className="font-medium">{t("overview.card.outstanding.headline")}</span>
          <span className="text-muted-foreground">
            {t("overview.card.outstanding.caption")}
          </span>
        </CardFooter>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardDescription>{t("overview.failed")}</CardDescription>
          <CardTitle className="font-mono text-2xl tabular-nums">{failing}</CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <span className="font-medium">
            {failing === 0
              ? t("overview.card.failed.none")
              : t("overview.card.failed.headline")}
          </span>
          <span className="text-muted-foreground">{t("overview.card.failed.caption")}</span>
        </CardFooter>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardDescription>{t("overview.needsAttention")}</CardDescription>
          <CardTitle className="font-mono text-2xl tabular-nums">
            {overview.needsAttentionCount}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1 text-sm">
          <span className="font-medium">
            {overview.needsAttentionCount === 0
              ? t("overview.card.attention.none")
              : t("overview.card.attention.headline")}
          </span>
          <span className="text-muted-foreground">
            {t("overview.card.attention.caption")}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
