import { getDashboardEnvironment } from "@/lib/dashboard-env";
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
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a subscription and track lifecycle + billing states.
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
              <CardTitle className="text-sm">No plans yet</CardTitle>
              <CardDescription>
                Create a subscription plan before you can start a subscription.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LinkButton
                href={`/dashboard/org/${orgSlug}/plans`}
                size="sm"
                variant="outline"
              >
                Create a plan
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
                  Customer email
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
                  Plan
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
                      {p.interval_count === 1 ? "month" : `${p.interval_count} months`}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit">Create subscription</Button>
            </form>

            {/* Says it plainly, because the field looked like a "send to" box
                and there is no sender behind it. One line under the row rather
                than wedged between the fields. */}
            <p className="mt-2 text-xs text-muted-foreground">
              The email identifies the customer — we don&apos;t contact them. You&apos;ll
              get a payment link to send yourself.
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
              <CardTitle>Subscription created</CardTitle>
              <CardDescription>
                Send this link to the customer. It stays on the subscription below,
                so you can copy it again later.
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
