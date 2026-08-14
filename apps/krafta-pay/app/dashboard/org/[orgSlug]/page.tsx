import Link from "next/link";
import { CreditCard, KeyRound, Layers } from "lucide-react";

import { getDashboardEnvironment } from "@/lib/dashboard-env";
import { requireOrgAccess } from "@/lib/org-access";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getPayT } from "@/lib/locales/server";
import { getPayLocale } from "@/lib/locales/server";
import { loadOverview, percentChange } from "@/lib/overview";
import { formatMinorAmount } from "@/lib/format";
import { CollectedChart } from "@/components/dashboard/collected-chart.client";
import { OverviewCards } from "@/components/dashboard/overview-cards";
import { NeedsAttention } from "@/components/dashboard/needs-attention.client";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The overview.
 *
 * This used to lead with three onboarding cards — connect a provider, create a
 * plan, get API keys. That is a checklist for a developer, and it was the first
 * thing a merchant saw every single day for the rest of their life with the
 * product. Galaktika opens this to answer «сколько мне заплатили» and «кто ещё
 * не заплатил».
 *
 * So: the money, then the trend, then the only list on the page a merchant can
 * act on. Setup moved to the bottom and disappears entirely once there is
 * anything to show — a checklist earns its place exactly once.
 */

const SETUP_STEPS = [
  {
    href: "/providers",
    titleKey: "setup.connectProvider.title",
    descriptionKey: "setup.connectProvider.description",
    Icon: CreditCard,
  },
  {
    href: "/plans",
    titleKey: "setup.createPlan.title",
    descriptionKey: "setup.createPlan.description",
    Icon: Layers,
  },
  {
    href: "/api-keys",
    titleKey: "setup.apiKeys.title",
    descriptionKey: "setup.apiKeys.description",
    Icon: KeyRound,
  },
] as const;

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await requireOrgAccess(orgSlug);
  const environment = await getDashboardEnvironment();
  const t = await getPayT();
  const locale = await getPayLocale();
  const admin = createAdminSupabase();

  const overview = await loadOverview(admin, {
    orgId: org.orgId,
    environment,
    payBaseUrl: process.env.PAY_BASE_URL ?? "",
  });

  const change = percentChange(
    overview.collectedThisMonthMinor,
    overview.collectedLastMonthMinor,
  );
  const hasHistory = overview.monthly.some((m) => m.collectedMinor > 0);
  const isNew = !hasHistory && overview.needsAttentionCount === 0;

  return (
    <>
      <OverviewCards overview={overview} t={t} />


      {hasHistory ? (
        <div>
          <CollectedChart
            monthly={overview.monthly}
            daily={overview.daily}
            currency={overview.currency}
          />
        </div>
      ) : null}

      <NeedsAttention rows={overview.rows} />

      {/* Setup, once. It vanishes as soon as there is any real activity — a
          merchant who has taken money does not need to be told how to start. */}
      {isNew ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("overview.setup.title")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SETUP_STEPS.map((step) => {
              const Icon = step.Icon;
              return (
                <Link
                  key={step.href}
                  href={`/dashboard/org/${orgSlug}${step.href}`}
                  className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card
                    size="sm"
                    className="h-full transition-colors group-hover:bg-muted/40 group-focus-visible:bg-muted/40"
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        {t(step.titleKey)}
                      </CardTitle>
                      <CardDescription>{t(step.descriptionKey)}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {environment === "test" ? t("overview.testHint") : null}
      </p>
      <span className="sr-only">{locale}</span>
    </>
  );
}
