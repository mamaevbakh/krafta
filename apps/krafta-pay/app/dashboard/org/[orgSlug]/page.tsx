import { getDashboardEnvironment } from "@/lib/dashboard-env";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CreditCard, KeyRound, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { requireOrgAccess } from "@/lib/org-access";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { MetricsPanel } from "@/components/dashboard/metrics-panel";
import { loadBillingMetrics } from "@/lib/metrics";
import { getPayT } from "@/lib/locales/server";
import { LinkButton } from "@/components/ui/link-button";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Onboarding steps for the overview — the few things a merchant does to start
// taking payments. Nav lives in the sidebar now, so this is setup, not wayfinding.
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
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string; payUrl?: string; publicToken?: string }>;
}) {
  const sp = await searchParams;
  const { orgSlug } = await params;
  // Auth + membership are both resolved here; a slug this user cannot reach
  // 404s rather than falling through to an empty dashboard.
  const org = await requireOrgAccess(orgSlug);
  const activeOrgId = org.orgId;

  const environment = await getDashboardEnvironment();
  const t = await getPayT();
  const admin = createAdminSupabase();
  const metrics = activeOrgId
    ? await loadBillingMetrics(admin, {
        orgId: activeOrgId,
        environment: environment === "test" ? "test" : "live",
      })
    : null;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("overview.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("overview.subtitle", { name: org.orgName })}
        </p>
      </header>

      {metrics ? <MetricsPanel metrics={metrics} orgSlug={orgSlug} t={t} /> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {SETUP_STEPS.map((step) => {
          const href = `/dashboard/org/${orgSlug}${step.href}`;
          const Icon = step.Icon;
          return (
            <Link
              key={step.href}
              href={href}
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
      </section>

      {sp.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sp.error}
        </div>
      ) : null}

      {sp.payUrl ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("paymentLink.created.title")}</CardTitle>
            <CardDescription>{t("paymentLink.created.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link className="block break-all font-mono text-sm underline" href={sp.payUrl}>
              {sp.payUrl}
            </Link>
            {sp.publicToken ? (
              <p className="font-mono text-xs text-muted-foreground">token: {sp.publicToken}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section>
        <h2 className="text-sm font-medium">{t("paymentLink.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("paymentLink.subtitle")}
        </p>
        <div className="mt-4">
          <LinkButton
            href={`/dashboard/org/${orgSlug}/payments`}
            size="sm"
            variant="outline"
          >
            {t("page.payments.title")}
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
