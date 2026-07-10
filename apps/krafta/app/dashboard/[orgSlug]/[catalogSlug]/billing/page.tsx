import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { hasSsoRuntimeConfig } from "@/lib/auth/sso";
import { telegramLoginConfigured } from "@/lib/auth/telegram-bridge";
import { createPaySubscriptionCheckout, listKraftaPayPlans } from "@/lib/billing/pay-client";
import { changeKraftaSubscriptionPlan } from "@/lib/payments/pay-internal";
import { getCatalogBillingEntitlement } from "@/lib/billing/entitlement";
import { formatMoney } from "@/lib/billing/format";
import { getDashboardT } from "@/lib/locales/dashboard/server";
import { SubscriptionManager } from "./_components/subscription-manager";
import { PlansBrowser } from "./_components/plans-browser";
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

  // Onboarding runs on an anonymous session that lives only in a cookie. Paying
  // before registering would strand the subscription in an unrecoverable
  // account and skips the same registration gate publish_shop enforces, so
  // require a real identity first. The billing UI prompts the secure-account
  // flow; this is the server-side backstop.
  if (authUser.is_anonymous) {
    redirect(
      `/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(t("billing.error.registration_required"))}`,
    );
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

  // Per-catalog billing: resolve which catalog this billing page is for so the
  // subscription is scoped to it (one org account, one sub per catalog).
  const { data: catalogRow } = await supabase
    .from("catalogs")
    .select("id")
    .eq("org_id", customerOrgId)
    .eq("slug", catalogSlug)
    .maybeSingle();
  const catalogId = catalogRow?.id ?? "";

  const entitlement = await getCatalogBillingEntitlement(customerOrgId, catalogId);
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
      catalogId: catalogId || undefined,
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
  // Anonymous onboarding sessions can reach this page but must register before
  // paying (see startUpgradeAction's backstop). Surface the secure-account
  // prompt inline so they can convert without leaving billing.
  const { user: viewerUser } = await getUserSafely(supabase);
  const isAnonymous = viewerUser?.is_anonymous === true;
  const telegramBotUsername = telegramLoginConfigured()
    ? (process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null)
    : null;
  const { data: orgRecord, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgErr || !orgRecord) {
    return (
      <div className="mx-auto w-full max-w-[1248px] px-6 py-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t("billing.org_not_found")}
        </div>
      </div>
    );
  }

  const { data: billingCatalog } = await supabase
    .from("catalogs")
    .select("id")
    .eq("org_id", orgRecord.id)
    .eq("slug", catalogSlug)
    .maybeSingle();
  const entitlement = await getCatalogBillingEntitlement(
    orgRecord.id,
    billingCatalog?.id ?? "",
  );
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
  // The account summary (status + metrics + manage actions) only says
  // something once there's a subscription to describe. With no active access
  // it's four empty cells and a redundant CTA, so hide it and let the plans
  // picker below carry the "choose a plan" message.
  const showAccountSummary =
    entitlement.status === "active" || entitlement.status === "grace";

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto flex min-h-[120px] max-w-[1248px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">
              {t("billing.heading")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {orgRecord.name} · {t("billing.catalog_label", { slug: catalogSlug })}
            </p>
          </div>
          <Badge
            variant={entitlement.status === "active" ? "default" : entitlement.status === "grace" ? "secondary" : "outline"}
            className="rounded-full px-3 py-1"
          >
            {entitlementLabel}
          </Badge>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] space-y-8 px-6 py-8">
        {sp.checkout === "success" ? (
          <StatusBanner
            variant="neutral"
            icon={CheckCircle2}
            title={t("billing.banner.success_title")}
            description={t("billing.banner.success_desc")}
          />
        ) : null}
        {sp.checkout === "cancel" ? (
          <StatusBanner
            variant="neutral"
            icon={Clock3}
            title={t("billing.banner.cancel_title")}
            description={t("billing.banner.cancel_desc")}
          />
        ) : null}
        {sp.error ? (
          <StatusBanner
            variant="destructive"
            icon={AlertCircle}
            title={t("billing.banner.error_title")}
            description={sp.error}
          />
        ) : null}

        {showAccountSummary ? (
        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <p className="max-w-2xl text-sm text-muted-foreground">
              {entitlementDescription}
            </p>

            <div className="flex flex-col gap-2 lg:items-end">
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
              subValue={
                currentPlan ? (
                  <>
                    <span className="font-mono tabular-nums">
                      {formatMoney(currentPlan.amount_minor, currentPlan.currency)}
                    </span>{" "}
                    · {formatPlanInterval(t, currentPlan.interval_count)}
                  </>
                ) : undefined
              }
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
        </section>
        ) : null}

        <section id="plans" className="space-y-4">
          <PlansBrowser
            plans={sortedPlans}
            plansError={plansErr}
            entitlement={{
              planId: entitlement.planId,
              status: entitlement.status,
              cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
            }}
            orgId={orgRecord.id}
            orgSlug={orgSlug}
            catalogSlug={catalogSlug}
            upgradeAction={startUpgradeAction}
            isAnonymous={isAnonymous}
            telegramBotUsername={telegramBotUsername}
          />
        </section>
      </div>
    </main>
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
  subValue?: ReactNode;
  icon: typeof Sparkles;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
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
  variant,
  icon: Icon,
  title,
  description,
}: {
  variant: "neutral" | "destructive";
  icon: typeof Sparkles;
  title: string;
  description: string;
}) {
  const isDestructive = variant === "destructive";
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        isDestructive
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted/30 text-foreground",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">{title}</p>
          <p className={cn("mt-0.5", !isDestructive && "text-muted-foreground")}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
