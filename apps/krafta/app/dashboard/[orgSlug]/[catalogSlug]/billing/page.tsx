import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { hasSsoRuntimeConfig } from "@/lib/auth/sso";
import { createPaySubscriptionCheckout, listKraftaPayPlans } from "@/lib/billing/pay-client";
import { changeKraftaSubscriptionPlan } from "@/lib/payments/pay-internal";
import { getOrgBillingEntitlement } from "@/lib/billing/entitlement";
import { getDashboardT } from "@/lib/locales/dashboard/server";
import { SubscriptionManager } from "./_components/subscription-manager";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Sparkles,
} from "lucide-react";

type BillingPageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
  searchParams: Promise<{ checkout?: string; error?: string }>;
};

function resolveAppBaseUrl(origin: string) {
  const configured = process.env.KRAFTA_APP_URL?.trim();
  return configured && configured.length > 0 ? configured : origin;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatMoney(amountMinor: number, currency: string) {
  try {
    const hasNoCents = amountMinor % 100 === 0;
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: hasNoCents ? 0 : 2,
      maximumFractionDigits: hasNoCents ? 0 : 2,
    }).format(amountMinor / 100);
  } catch {
    return `${amountMinor} ${currency.toUpperCase()}`;
  }
}

type DashboardT = Awaited<ReturnType<typeof getDashboardT>>;

function formatPlanInterval(t: DashboardT, intervalCount: number) {
  return intervalCount === 1
    ? t("billing.interval.monthly")
    : t("billing.interval.every_months", { count: intervalCount });
}

function getEntitlementLabel(t: DashboardT, status: "active" | "grace" | "locked") {
  if (status === "active") return t("billing.entitlement.active");
  if (status === "grace") return t("billing.entitlement.ending_soon");
  return t("billing.entitlement.none");
}

function getEntitlementDescription(
  t: DashboardT,
  input: {
    status: "active" | "grace" | "locked";
    subscriptionStatus: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  },
) {
  if (input.status === "active") {
    if (input.cancelAtPeriodEnd && input.currentPeriodEnd) {
      return t("billing.desc.cancel_at_period_end", {
        date: formatDateTime(input.currentPeriodEnd),
      });
    }
    if (input.currentPeriodEnd) {
      return t("billing.desc.renews_on", { date: formatDateTime(input.currentPeriodEnd) });
    }
    return t("billing.desc.active");
  }

  if (input.status === "grace") {
    if (input.currentPeriodEnd) {
      return t("billing.desc.grace_until", { date: formatDateTime(input.currentPeriodEnd) });
    }
    return t("billing.desc.grace_no_date");
  }

  if (input.subscriptionStatus) {
    return t("billing.desc.locked_status", { status: input.subscriptionStatus });
  }
  return t("billing.desc.locked_none");
}

async function startUpgradeAction(formData: FormData) {
  "use server";
  const t = await getDashboardT();
  const customerOrgId = String(formData.get("customerOrgId") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const catalogSlug = String(formData.get("catalogSlug") ?? "");
  const planId = String(formData.get("planId") ?? "");

  if (!customerOrgId || !orgSlug || !catalogSlug || !planId) {
    redirect(
      `/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(t("billing.error.missing_fields"))}`,
    );
  }

  const supabase = await createClient();
  const { user: authUser, authError } = await getUserSafely(supabase);
  if (authError || !authUser) {
    const next = `/dashboard/${orgSlug}/${catalogSlug}/billing`;
    if (hasSsoRuntimeConfig()) {
      redirect(`/auth/sso/start?next=${encodeURIComponent(next)}`);
    }
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const { data: membership, error: membershipErr } = await supabase
    .from("organization_members")
    .select("id")
    .eq("org_id", customerOrgId)
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (membershipErr) {
    redirect(`/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(membershipErr.message)}`);
  }
  if (!membership) {
    redirect(
      `/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(t("billing.error.forbidden"))}`,
    );
  }

  const entitlement = await getOrgBillingEntitlement(customerOrgId);
  const backTo = `/dashboard/${orgSlug}/${catalogSlug}/billing`;
  if (
    (entitlement.status === "active" || entitlement.status === "grace") &&
    entitlement.planId &&
    entitlement.planId === planId
  ) {
    redirect(`${backTo}?error=${encodeURIComponent(t("billing.error.already_on_plan"))}`);
  }

  // Already subscribed to a DIFFERENT plan → change the same subscription in
  // place. This replaces the old behavior that spun up a second parallel
  // subscription (a duplicate-billing bug). Upgrades apply now; downgrades
  // (target cheaper than current) defer to period end.
  if (
    entitlement.subscriptionId &&
    (entitlement.status === "active" || entitlement.status === "grace")
  ) {
    const allPlans = await listKraftaPayPlans().catch(() => []);
    const current = allPlans.find((p) => p.id === entitlement.planId) ?? null;
    const target = allPlans.find((p) => p.id === planId) ?? null;
    const prorationBehavior =
      current && target && target.amount_minor < current.amount_minor
        ? "defer_to_period_end"
        : "none";
    const res = await changeKraftaSubscriptionPlan({
      customerOrgId,
      subscriptionId: entitlement.subscriptionId,
      planId,
      prorationBehavior,
      initiatedByUserId: authUser.id,
    });
    if (!res.ok) {
      redirect(`${backTo}?error=${encodeURIComponent(res.error ?? "change_failed")}`);
    }
    redirect(`${backTo}?checkout=success`);
  }

  const origin = getRequestOrigin(await headers());
  const appBaseUrl = resolveAppBaseUrl(origin).replace(/\/+$/, "");
  // Card checkout normally requires an https return URL, but allow http on
  // localhost so the full flow can be exercised against a local Krafta Pay.
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(appBaseUrl);
  if (!appBaseUrl.startsWith("https://") && !isLocalhost) {
    redirect(
      `/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(
        t("billing.error.https_required"),
      )}`,
    );
  }

  const returnPath = `/dashboard/${orgSlug}/${catalogSlug}/billing`;
  const successUrl = `${appBaseUrl}${returnPath}?checkout=success`;
  const cancelUrl = `${appBaseUrl}${returnPath}?checkout=cancel`;

  let checkout: Awaited<ReturnType<typeof createPaySubscriptionCheckout>>;
  try {
    checkout = await createPaySubscriptionCheckout({
      customerOrgId,
      planId,
      successUrl,
      cancelUrl,
      returnUrl: successUrl,
      customerRef: {
        email: authUser.email,
        customerUserRef: authUser.id,
      },
      catalogContext: {
        org_slug: orgSlug,
        catalog_slug: catalogSlug,
      },
      initiatedByUserId: authUser.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : t("billing.error.checkout_failed");
    redirect(`/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(message)}`);
  }

  redirect(checkout.payUrl);
}

export default async function BillingPage({ params, searchParams }: BillingPageProps) {
  const { orgSlug, catalogSlug } = await params;
  const sp = await searchParams;
  const t = await getDashboardT();

  const supabase = await createClient();
  const { data: orgRecord, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgErr || !orgRecord) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t("billing.org_not_found")}
        </div>
      </div>
    );
  }

  const entitlement = await getOrgBillingEntitlement(orgRecord.id);
  let plans: Awaited<ReturnType<typeof listKraftaPayPlans>> = [];
  let plansErr: string | null = null;
  try {
    plans = await listKraftaPayPlans();
  } catch (error) {
    plansErr = error instanceof Error ? error.message : t("billing.error.plans_load_failed");
  }

  const sortedPlans = [...(plans ?? [])].sort((a, b) => {
    if (a.currency !== b.currency) {
      return a.currency.localeCompare(b.currency);
    }
    if (a.amount_minor !== b.amount_minor) {
      return a.amount_minor - b.amount_minor;
    }
    return a.interval_count - b.interval_count;
  });
  const currentPlan = sortedPlans.find((plan) => plan.id === entitlement.planId) ?? null;
  const canOpenBillingPortal = Boolean(entitlement.subscriptionId || entitlement.subscriptionStatus);
  const entitlementLabel = getEntitlementLabel(t, entitlement.status);
  const entitlementDescription = getEntitlementDescription(t, entitlement);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <section className="relative overflow-hidden rounded-2xl border bg-background">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(16,185,129,0.12),transparent_38%),radial-gradient(circle_at_86%_18%,rgba(59,130,246,0.1),transparent_42%)]" />
        <div className="relative p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {t("billing.badge")}
                </Badge>
                <Badge
                  variant={entitlement.status === "active" ? "default" : entitlement.status === "grace" ? "secondary" : "outline"}
                  className="rounded-full px-3 py-1"
                >
                  {entitlementLabel}
                </Badge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {t("billing.heading")}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {orgRecord.name} · {t("billing.catalog_label", { slug: catalogSlug })}
                </p>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {entitlementDescription}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <SubscriptionManager
                orgId={orgRecord.id}
                orgSlug={orgSlug}
                catalogSlug={catalogSlug}
                subscriptionId={entitlement.subscriptionId}
                cancelAtPeriodEnd={entitlement.cancelAtPeriodEnd}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                {canOpenBillingPortal ? (
                  <form method="post" action="/api/billing/customer-portal">
                    <input type="hidden" name="customerOrgId" value={orgRecord.id} />
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="catalogSlug" value={catalogSlug} />
                    <Button type="submit" variant="outline" className="w-full sm:w-auto">
                      <CreditCard className="size-4" />
                      {t("billing.manage_billing")}
                    </Button>
                  </form>
                ) : null}
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <a href="#plans">
                    {t("billing.view_plans")}
                    <ArrowUpRight className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={t("billing.metric.access")}
              value={entitlementLabel}
              icon={entitlement.status === "active" ? CheckCircle2 : entitlement.status === "grace" ? Clock3 : AlertCircle}
            />
            <MetricCard
              label={t("billing.metric.current_plan")}
              value={currentPlan?.name ?? t("billing.not_subscribed")}
              subValue={currentPlan ? `${formatMoney(currentPlan.amount_minor, currentPlan.currency)} · ${formatPlanInterval(t, currentPlan.interval_count)}` : undefined}
              icon={Sparkles}
            />
            <MetricCard
              label={t("billing.metric.subscription_status")}
              value={entitlement.subscriptionStatus ?? t("billing.status_none")}
              icon={CreditCard}
            />
            <MetricCard
              label={entitlement.status === "grace" ? t("billing.metric.access_ends") : t("billing.metric.next_billing")}
              value={entitlement.currentPeriodEnd ? formatDateTime(entitlement.currentPeriodEnd) : t("billing.not_available")}
              icon={Clock3}
            />
          </div>
        </div>
      </section>

      {sp.checkout === "success" ? (
        <StatusBanner
          className="mt-4 border-emerald-300 bg-emerald-50 text-emerald-700"
          icon={CheckCircle2}
          title={t("billing.banner.success_title")}
          description={t("billing.banner.success_desc")}
        />
      ) : null}
      {sp.checkout === "cancel" ? (
        <StatusBanner
          className="mt-4 border-border bg-muted/40 text-muted-foreground"
          icon={Clock3}
          title={t("billing.banner.cancel_title")}
          description={t("billing.banner.cancel_desc")}
        />
      ) : null}
      {sp.error ? (
        <StatusBanner
          className="mt-4 border-destructive/30 bg-destructive/10 text-destructive"
          icon={AlertCircle}
          title={t("billing.banner.error_title")}
          description={sp.error}
        />
      ) : null}

      <section id="plans" className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("billing.plans_heading")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("billing.plans_subtitle")}
            </p>
          </div>
          {currentPlan ? (
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {t("billing.current_badge", { name: currentPlan.name })}
            </Badge>
          ) : null}
        </div>
        {plansErr ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {plansErr}
          </div>
        ) : sortedPlans.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {t("billing.no_plans")}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedPlans.map((plan) => {
              const isCurrentPlan = Boolean(
                entitlement.planId &&
                (entitlement.status === "active" || entitlement.status === "grace") &&
                entitlement.planId === plan.id,
              );
              const actionLabel =
                isCurrentPlan
                  ? t("billing.action.current")
                  : entitlement.status === "locked"
                    ? t("billing.action.choose", { name: plan.name })
                    : t("billing.action.switch", { name: plan.name });

              return (
                <div
                  key={plan.id}
                  className={[
                    "relative overflow-hidden rounded-2xl border bg-background p-5",
                    isCurrentPlan ? "border-foreground/50 shadow-sm" : "border-border",
                  ].join(" ")}
                >
                  {isCurrentPlan ? (
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r from-emerald-500 via-emerald-400 to-blue-500" />
                  ) : null}

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
                        <p className="text-sm text-muted-foreground">
                          {plan.code}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold tracking-tight">
                          {formatMoney(plan.amount_minor, plan.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPlanInterval(t, plan.interval_count)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                        <span className="text-muted-foreground">{t("billing.cadence")}</span>
                        <span className="font-medium">{t("billing.months_count", { count: plan.interval_count })}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                        <span className="text-muted-foreground">{t("billing.trial")}</span>
                        <span className="font-medium">
                          {plan.trial_days > 0 ? t("billing.trial_days", { days: plan.trial_days }) : t("billing.no_trial")}
                        </span>
                      </div>
                    </div>

                    {isCurrentPlan && entitlement.cancelAtPeriodEnd ? (
                      <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-700">
                        {t("billing.cancel_note")}
                      </div>
                    ) : null}

                    <div className="mt-auto">
                      <form action={startUpgradeAction}>
                        <input type="hidden" name="customerOrgId" value={orgRecord.id} />
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
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subValue,
  icon: Icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: typeof Sparkles;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-medium leading-tight">{value}</p>
          {subValue ? (
            <p className="mt-1 text-xs text-muted-foreground">{subValue}</p>
          ) : null}
        </div>
        <Icon className="mt-0.5 size-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function StatusBanner({
  className,
  icon: Icon,
  title,
  description,
}: {
  className: string;
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  );
}
