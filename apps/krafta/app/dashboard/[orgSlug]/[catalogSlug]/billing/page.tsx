import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { Button } from "@/components/ui/button";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { createPaySubscriptionCheckout, listKraftaPayPlans } from "@/lib/billing/pay-client";
import { getOrgBillingEntitlement } from "@/lib/billing/entitlement";

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
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amountMinor / 100);
  } catch {
    return `${amountMinor} ${currency.toUpperCase()}`;
  }
}

async function startUpgradeAction(formData: FormData) {
  "use server";
  const customerOrgId = String(formData.get("customerOrgId") ?? "");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const catalogSlug = String(formData.get("catalogSlug") ?? "");
  const planId = String(formData.get("planId") ?? "");

  if (!customerOrgId || !orgSlug || !catalogSlug || !planId) {
    redirect(`/dashboard/${orgSlug}/${catalogSlug}/billing?error=Missing+required+fields`);
  }

  const supabase = await createClient();
  const { user: authUser, authError } = await getUserSafely(supabase);
  if (authError || !authUser) {
    redirect(`/login?next=/dashboard/${orgSlug}/${catalogSlug}/billing`);
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
    redirect(`/dashboard/${orgSlug}/${catalogSlug}/billing?error=Forbidden`);
  }

  const origin = getRequestOrigin(await headers());
  const appBaseUrl = resolveAppBaseUrl(origin).replace(/\/+$/, "");
  if (!appBaseUrl.startsWith("https://")) {
    redirect(
      `/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(
        "Uzum requires HTTPS return URLs. Set KRAFTA_APP_URL to an https:// domain (e.g. tunnel or production URL).",
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
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    redirect(`/dashboard/${orgSlug}/${catalogSlug}/billing?error=${encodeURIComponent(message)}`);
  }

  redirect(checkout.payUrl);
}

export default async function BillingPage({ params, searchParams }: BillingPageProps) {
  const { orgSlug, catalogSlug } = await params;
  const sp = await searchParams;

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
          Organization not found.
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
    plansErr = error instanceof Error ? error.message : "failed_to_load_plans";
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Billing</p>
        <h1 className="text-3xl font-semibold tracking-tight">Krafta Pay Plans</h1>
        <p className="text-sm text-muted-foreground">
          Organization: {orgRecord.name} · Catalog: {catalogSlug}
        </p>
      </div>

      <div className="mt-6 rounded-md border bg-background p-4 text-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-medium">Current entitlement</p>
            <p className="mt-1 text-muted-foreground">
              Access state: <span className="font-medium text-foreground">{entitlement.status}</span>
            </p>
            <p className="text-muted-foreground">
              Subscription status: {entitlement.subscriptionStatus ?? "none"}
            </p>
            {entitlement.currentPeriodEnd ? (
              <p className="text-muted-foreground">
                Current period end: {formatDateTime(entitlement.currentPeriodEnd)}
              </p>
            ) : null}
          </div>

          <form method="post" action="/api/billing/customer-portal">
            <input type="hidden" name="customerOrgId" value={orgRecord.id} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="catalogSlug" value={catalogSlug} />
            <Button type="submit" variant="outline">
              Manage Billing
            </Button>
          </form>
        </div>
      </div>

      {sp.checkout === "success" ? (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
          Checkout completed. Your subscription status will refresh automatically after webhook confirmation.
        </div>
      ) : null}
      {sp.checkout === "cancel" ? (
        <div className="mt-4 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
          Checkout canceled.
        </div>
      ) : null}
      {sp.error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {sp.error}
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">Available plans</h2>
        {plansErr ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {plansErr}
          </div>
        ) : (plans ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No active plans available right now.
          </div>
        ) : (
          <div className="grid gap-3">
            {(plans ?? []).map((plan) => (
              <div key={plan.id} className="rounded-md border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {plan.name} ({plan.code})
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatMoney(plan.amount_minor, plan.currency)} / {plan.interval_count} month(s)
                    </p>
                    {plan.trial_days > 0 ? (
                      <p className="text-xs text-muted-foreground">Trial: {plan.trial_days} days</p>
                    ) : null}
                  </div>
                  <form action={startUpgradeAction}>
                    <input type="hidden" name="customerOrgId" value={orgRecord.id} />
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="catalogSlug" value={catalogSlug} />
                    <input type="hidden" name="planId" value={plan.id} />
                    <Button type="submit">Upgrade to {plan.name}</Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
