import { ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { BillingMetrics } from "@/lib/metrics";
import type { TranslateFn } from "@/lib/locales/messages";
import { formatMinorAmount } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Recovery first, then the standard trio.
 *
 * Per DESIGN.md: mono tabular numerals for money, borders and weight for
 * hierarchy, no decorative colour. The one green accent is on recovered
 * revenue, because that is the number the whole product is arguing for and it
 * has earned an accent the others have not.
 */
export function MetricsPanel({
  metrics,
  orgSlug,
  t,
}: {
  metrics: BillingMetrics;
  orgSlug: string;
  t: TranslateFn;
}) {
  const { recovery } = metrics;
  const hasRecoveryHistory = recovery.recoveredCount + recovery.stillFailingCount > 0;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">{t("metrics.window", { days: metrics.windowDays })}</h2>
        <Link
          href={`/dashboard/org/${orgSlug}/subscriptions`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("metrics.allSubscriptions")}
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      </div>

      {/* The headline. A merchant knows their own MRR; they do not know what
          dunning clawed back for them, and that is what they are paying for. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="size-4" aria-hidden />
            {t("metrics.recovered.title")}
          </CardTitle>
          <CardDescription>{t("metrics.recovered.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-3xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMinorAmount(recovery.recoveredMinor, metrics.currency)}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {hasRecoveryHistory ? (
              <>
                {t("metrics.recovered.summary", {
                  recovered: recovery.recoveredCount,
                  total: recovery.recoveredCount + recovery.stillFailingCount,
                })}
                {recovery.recoveryRatePercent !== null
                  ? ` · ${t("metrics.recovered.rate", { rate: recovery.recoveryRatePercent })}`
                  : null}
              </>
            ) : (
              t("metrics.recovered.none")
            )}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label={t("metrics.mrr")}
          value={formatMinorAmount(metrics.mrrMinor, metrics.currency)}
          hint={t("metrics.mrr.hint")}
        />
        <Metric
          label={t("metrics.activeSubscribers")}
          value={String(metrics.activeSubscribers)}
          hint={
            metrics.pastDueSubscribers > 0
              ? t("metrics.activeSubscribers.pastDue", { count: metrics.pastDueSubscribers })
              : t("metrics.activeSubscribers.nonePastDue")
          }
          alert={metrics.pastDueSubscribers > 0}
        />
        <Metric
          label={t("metrics.churn")}
          value={metrics.churnRatePercent !== null ? `${metrics.churnRatePercent}%` : "—"}
          hint={t("metrics.churn.hint", { days: metrics.windowDays })}
        />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint: string;
  alert?: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums">{value}</p>
        <p
          className={
            alert ? "mt-1 text-xs text-amber-600 dark:text-amber-400" : "mt-1 text-xs text-muted-foreground"
          }
        >
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}
