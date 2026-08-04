import { createHostedCheckoutAction } from "@/app/dashboard/actions";
import { ConnectProviderFirst } from "@/components/dashboard/connect-provider-first";
import { PayLink } from "@/components/dashboard/pay-link.client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDashboardEnvironment } from "@/lib/dashboard-env";
import { getPayT } from "@/lib/locales/server";
import { requireOrgAccess } from "@/lib/org-access";
import { getOrgProviderStatus } from "@/lib/provider-status";
import { createAdminSupabase } from "@/lib/supabase-admin";

import { PaymentsListClient } from "./payments-list.client";

/**
 * One-off payments — the merchant's answer to "did they pay?".
 *
 * This page exists because that question had nowhere to be asked. A merchant
 * could create a payment link from the overview and then never see it again:
 * no list, no status, no way to recover the URL. For a merchant with no
 * engineer and no webhook consumer, that made one-off payments unusable rather
 * than merely unpolished.
 *
 * The create form lives here rather than on the overview for the same reason a
 * subscription's form lives on its own page: the thing you do and the thing you
 * watch belong together.
 */
export default async function DashboardPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ publicToken?: string; payUrl?: string; error?: string }>;
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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("page.payments.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("page.payments.subtitle")}
        </p>
      </header>

      <section>
        {!providerStatus.hasActive ? (
          <ConnectProviderFirst
            orgId={orgId}
            environment={environment}
            what={t("paymentLink.what")}
          />
        ) : (
          /* A plain bordered row, not a card. Two fields on an index page, and a
             stacked card pushed the payments themselves below the fold — the
             same call the subscriptions form made. */
          <div className="rounded-lg border p-3">
            <form
              action={createHostedCheckoutAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="orgId" value={orgId} />

              <div className="grid min-w-40 flex-1 gap-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="payment-amount"
                >
                  {t("paymentLink.amount")}
                </label>
                <div className="relative">
                  <Input
                    id="payment-amount"
                    name="amount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    required
                    defaultValue={200000}
                    // Native spinners collide with the absolutely-positioned
                    // currency affix, so they are suppressed.
                    className="pr-12 font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    UZS
                  </span>
                </div>
              </div>

              <div className="grid min-w-56 flex-1 gap-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="payment-description"
                >
                  {t("paymentLink.description")}
                </label>
                <Input
                  id="payment-description"
                  name="description"
                  placeholder={t("paymentLink.descriptionPlaceholder")}
                />
              </div>

              <Button type="submit">{t("paymentLink.submit")}</Button>
            </form>

            <p className="mt-2 text-xs text-muted-foreground">
              {t("payments.createHint")}
            </p>
          </div>
        )}

        {sp.error ? (
          <div className="mt-4 max-w-md rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sp.error}
          </div>
        ) : null}

        {sp.payUrl ? (
          <Card
            size="sm"
            className="mt-4 max-w-md border-emerald-500/30 bg-emerald-500/5"
          >
            <CardHeader>
              <CardTitle>{t("paymentLink.created.title")}</CardTitle>
              <CardDescription>{t("payments.created.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <PayLink url={sp.payUrl} className="bg-background" />
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="space-y-3">
        <PaymentsListClient orgId={orgId} environment={environment} />
      </section>
    </div>
  );
}
