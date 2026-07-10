"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/locales/dashboard/context";
import { formatMoney } from "@/lib/billing/format";
import type { KraftaPayPlan } from "@/lib/billing/pay-client";

type EntitlementLite = {
  planId: string | null;
  status: "active" | "grace" | "locked";
  cancelAtPeriodEnd: boolean;
};

type PlansBrowserProps = {
  plans: KraftaPayPlan[];
  plansError: string | null;
  entitlement: EntitlementLite;
  orgId: string;
  orgSlug: string;
  catalogSlug: string;
  upgradeAction: (formData: FormData) => void | Promise<void>;
};

/**
 * Savings of an annual plan vs paying the matching monthly plan for the same
 * span. Pairs monthly↔annual by code (`pro` ↔ `pro-yearly`); returns null when
 * there is no monthly counterpart or the annual plan isn't actually cheaper.
 */
function annualSavingsPct(annual: KraftaPayPlan, all: KraftaPayPlan[]): number | null {
  if (annual.interval_count <= 1) return null;
  const base = annual.code.replace(/[-_](yearly|annually|annual|year)$/i, "");
  const monthly = all.find(
    (p) => p.interval_count === 1 && p.currency === annual.currency && p.code === base,
  );
  if (!monthly) return null;
  const monthlyForSpan = monthly.amount_minor * annual.interval_count;
  if (monthlyForSpan <= 0 || annual.amount_minor >= monthlyForSpan) return null;
  return Math.round(((monthlyForSpan - annual.amount_minor) / monthlyForSpan) * 100);
}

/**
 * PlansBrowser — the plan picker on the billing page. When the catalog offers
 * both monthly and annual plans it shows a Monthly / Annual segmented toggle
 * (annual carries a savings badge) and filters the cards to the active period;
 * otherwise it just lists whatever plans exist. Client-side so switching the
 * period is instant, but the upgrade itself still goes through the passed-in
 * server action.
 */
export function PlansBrowser({
  plans,
  plansError,
  entitlement,
  orgId,
  orgSlug,
  catalogSlug,
  upgradeAction,
}: PlansBrowserProps) {
  const t = useT();

  const heading = (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{t("billing.plans_heading")}</h2>
      <p className="text-sm text-muted-foreground">{t("billing.plans_subtitle")}</p>
    </div>
  );

  if (plansError) {
    return (
      <div className="space-y-4">
        {heading}
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {plansError}
        </div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="space-y-4">
        {heading}
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t("billing.no_plans")}
        </div>
      </div>
    );
  }

  const planInterval = (intervalCount: number) =>
    intervalCount === 1
      ? t("billing.interval.monthly")
      : t("billing.interval.every_months", { count: intervalCount });

  const renderCard = (plan: KraftaPayPlan, savingsPct: number | null) => {
    const isCurrentPlan = Boolean(
      entitlement.planId &&
        (entitlement.status === "active" || entitlement.status === "grace") &&
        entitlement.planId === plan.id,
    );
    const actionLabel = isCurrentPlan
      ? t("billing.action.current")
      : entitlement.status === "locked"
        ? t("billing.action.choose", { name: plan.name })
        : t("billing.action.switch", { name: plan.name });

    return (
      <div
        key={plan.id}
        className={cn(
          "rounded-lg border bg-card p-5",
          isCurrentPlan ? "border-foreground/50" : "border-border",
        )}
      >
        <div className="flex h-full flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold tracking-tight">{plan.name}</p>
                {isCurrentPlan ? (
                  <Badge variant="secondary" className="rounded-full">
                    {t("billing.current")}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{plan.code}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-semibold tracking-tight tabular-nums">
                {formatMoney(plan.amount_minor, plan.currency)}
              </p>
              <p className="text-xs text-muted-foreground">{planInterval(plan.interval_count)}</p>
              {savingsPct ? (
                <p className="mt-0.5 text-xs font-medium text-foreground">
                  {t("billing.period.save", { pct: savingsPct })}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">{t("billing.cadence")}</span>
              <span className="font-medium">
                {t("billing.months_count", { count: plan.interval_count })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground">{t("billing.trial")}</span>
              <span className="font-medium">
                {plan.trial_days > 0
                  ? t("billing.trial_days", { days: plan.trial_days })
                  : t("billing.no_trial")}
              </span>
            </div>
          </div>

          {isCurrentPlan && entitlement.cancelAtPeriodEnd ? (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Clock3 className="mt-0.5 size-4 shrink-0" />
              <span>{t("billing.cancel_note")}</span>
            </div>
          ) : null}

          <div className="mt-auto">
            <form action={upgradeAction}>
              <input type="hidden" name="customerOrgId" value={orgId} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="catalogSlug" value={catalogSlug} />
              <input type="hidden" name="planId" value={plan.id} />
              <Button type="submit" disabled={isCurrentPlan} className="w-full">
                {actionLabel}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  };

  const renderGrid = (list: KraftaPayPlan[], withSavings: boolean) => (
    <div className="grid gap-6 md:grid-cols-2">
      {list.map((plan) => renderCard(plan, withSavings ? annualSavingsPct(plan, plans) : null))}
    </div>
  );

  const monthlyPlans = plans.filter((p) => p.interval_count === 1);
  const annualPlans = plans.filter((p) => p.interval_count > 1);
  const showToggle = monthlyPlans.length > 0 && annualPlans.length > 0;

  if (!showToggle) {
    return (
      <div className="space-y-4">
        {heading}
        {renderGrid(plans, false)}
      </div>
    );
  }

  const currentPlan = plans.find(
    (p) =>
      p.id === entitlement.planId &&
      (entitlement.status === "active" || entitlement.status === "grace"),
  );
  const defaultPeriod = currentPlan && currentPlan.interval_count > 1 ? "annual" : "monthly";

  const savingsValues = annualPlans
    .map((p) => annualSavingsPct(p, plans))
    .filter((n): n is number => n !== null);
  const maxSavings = savingsValues.length ? Math.max(...savingsValues) : null;

  return (
    <Tabs defaultValue={defaultPeriod} className="gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {heading}
        <TabsList>
          <TabsTrigger value="monthly">{t("billing.period.monthly")}</TabsTrigger>
          <TabsTrigger value="annual">
            {t("billing.period.annual")}
            {maxSavings ? (
              <Badge
                variant="secondary"
                className="rounded-full px-1.5 py-0 font-mono text-[11px] leading-4 tabular-nums"
              >
                −{maxSavings}%
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="monthly">{renderGrid(monthlyPlans, false)}</TabsContent>
      <TabsContent value="annual">{renderGrid(annualPlans, true)}</TabsContent>
    </Tabs>
  );
}
