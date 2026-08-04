import { getDashboardEnvironment } from "@/lib/dashboard-env";
import { getPayT } from "@/lib/locales/server";
import { requireOrgAccess } from "@/lib/org-access";
import { getOrgProviderStatus } from "@/lib/provider-status";
import { ConnectProviderFirst } from "@/components/dashboard/connect-provider-first";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createSubscriptionCheckoutAction } from "@/app/dashboard/actions";
import { formatMinorAmount } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PayLink } from "@/components/dashboard/pay-link.client";
import { SubscriptionsListClient } from "./subscriptions-list.client";

type PlanRow = {
  id: string;
  name: string;
  amount_minor: number;
  currency: string;
  interval_count: number;
};

export default async function DashboardSubscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    subPayUrl?: string;
    subToken?: string;
    subError?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const org = await requireOrgAccess(orgSlug);
  const orgId = org.orgId;
  const sp = await searchParams;
  const t = await getPayT();

  const admin = createAdminSupabase();
  const environment = await getDashboardEnvironment();
  const providerStatus = orgId
    ? await getOrgProviderStatus(admin, orgId, environment)
    : { hasActive: false, providers: [], environment };

  let plans: PlanRow[] = [];
  if (orgId) {
    const { data } = await admin
      .schema("payments")
      .from("plans")
      .select("id, name, amount_minor, currency, interval_count")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("amount_minor", { ascending: true });
    plans = (data ?? []) as PlanRow[];
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("page.subscriptions.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("page.subscriptions.subtitle")}
        </p>
      </header>

      {/* Create subscription. A single row, not a stacked card: this is a
          two-field action on an index page, and a tall form pushed the actual
          subscriptions below the fold. */}
      <section>
        {!providerStatus.hasActive ? (
          <ConnectProviderFirst orgId={orgId} environment={environment} />
        ) : plans.length === 0 ? (
          <Card size="sm" className="max-w-md">
            <CardHeader>
              <CardTitle className="text-sm">{t("subscriptions.noPlans.title")}</CardTitle>
              <CardDescription>
                {t("subscriptions.noPlans.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LinkButton
                href={`/dashboard/org/${orgSlug}/plans`}
                size="sm"
                variant="outline"
              >
                {t("subscriptions.noPlans.cta")}
              </LinkButton>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border p-3">
            <form
              action={createSubscriptionCheckoutAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="orgId" value={orgId} />

              <div className="grid min-w-56 flex-1 gap-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="sub-email"
                >
                  {t("subscriptions.form.email")}
                </label>
                <Input
                  id="sub-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  placeholder="customer@example.com"
                />
              </div>

              <div className="grid min-w-56 flex-1 gap-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="sub-plan"
                >
                  {t("subscriptions.form.plan")}
                </label>
                <select
                  id="sub-plan"
                  name="planId"
                  required
                  className="h-9 w-full rounded-md border bg-background px-3 text-base md:text-sm"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatMinorAmount(p.amount_minor, p.currency)} /{" "}
                      {p.interval_count === 1
                        ? t("subscriptions.interval.month")
                        : t("subscriptions.interval.months", { count: p.interval_count })}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit">{t("subscriptions.form.submit")}</Button>
            </form>

            {/* Says it plainly, because the field looked like a "send to" box
                and there is no sender behind it. One line under the row rather
                than wedged between the fields. */}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("subscriptions.form.emailHint")}
            </p>
          </div>
        )}

        {sp.subError ? (
          <div className="mt-4 max-w-md rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sp.subError}
          </div>
        ) : null}

        {sp.subPayUrl ? (
          <Card
            size="sm"
            className="mt-4 max-w-md border-emerald-500/30 bg-emerald-500/5"
          >
            <CardHeader>
              <CardTitle>{t("subscriptions.created.title")}</CardTitle>
              <CardDescription>
                {t("subscriptions.created.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PayLink url={sp.subPayUrl} className="bg-background" />
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* Existing subscriptions */}
      <section className="space-y-3">
        <SubscriptionsListClient orgId={orgId} orgSlug={orgSlug} />
      </section>
    </div>
  );
}
