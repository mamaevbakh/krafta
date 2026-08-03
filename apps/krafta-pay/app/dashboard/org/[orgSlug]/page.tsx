import { getDashboardEnvironment } from "@/lib/dashboard-env";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CreditCard, KeyRound, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { requireOrgAccess } from "@/lib/org-access";
import { getOrgProviderStatus } from "@/lib/provider-status";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createHostedCheckoutAction } from "@/app/dashboard/actions";
import { ConnectProviderFirst } from "@/components/dashboard/connect-provider-first";
import { MetricsPanel } from "@/components/dashboard/metrics-panel";
import { loadBillingMetrics } from "@/lib/metrics";
import { getPayT } from "@/lib/locales/server";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [providerStatus, metrics] = await Promise.all([
    activeOrgId
      ? getOrgProviderStatus(admin, activeOrgId, environment)
      : Promise.resolve({ hasActive: false, providers: [], environment }),
    activeOrgId
      ? loadBillingMetrics(admin, {
          orgId: activeOrgId,
          environment: environment === "test" ? "test" : "live",
        })
      : Promise.resolve(null),
  ]);

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

        {!providerStatus.hasActive ? (
          <ConnectProviderFirst
            orgId={activeOrgId}
            environment={environment}
            what={t("paymentLink.what")}
          />
        ) : (
          <Card size="sm" className="mt-4 max-w-md">
            <CardContent>
              <form action={createHostedCheckoutAction} className="grid gap-4">
                {/* The org comes from the URL now, so the picker is gone. It
                    still travels with the POST because the server action reads
                    it from the form body. */}
                <input type="hidden" name="orgId" value={activeOrgId} />

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="amount">
                    {t("paymentLink.amount")}
                  </label>
                  <div className="relative">
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      required
                      defaultValue={200000}
                      // Suppress the native number spinners so they don't collide
                      // with the absolutely-positioned UZS affix.
                      className="pr-12 font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                      UZS
                    </span>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="description">
                    {t("paymentLink.description")}
                  </label>
                  <Input
                    id="description"
                    name="description"
                    placeholder={t("paymentLink.descriptionPlaceholder")}
                  />
                </div>

                <Button type="submit" className="justify-self-start">
                  {t("paymentLink.submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
