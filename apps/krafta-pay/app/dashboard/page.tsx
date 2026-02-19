import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createHostedCheckoutAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { getUserSafely } from "@krafta/supabase/auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; payUrl?: string; publicToken?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);

  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", user.id);

  const orgOptions = (memberships ?? [])
    .map((m: any) => m.organizations)
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Link className="rounded-md border bg-background p-4 text-sm hover:bg-muted" href={`/dashboard/providers${orgOptions[0]?.id ? `?orgId=${orgOptions[0].id}` : ""}`}>
          <p className="font-medium">Provider Setup</p>
          <p className="mt-1 text-muted-foreground">Configure Uzum credentials and webhook secret.</p>
        </Link>
        <Link className="rounded-md border bg-background p-4 text-sm hover:bg-muted" href={`/dashboard/plans${orgOptions[0]?.id ? `?orgId=${orgOptions[0].id}` : ""}`}>
          <p className="font-medium">Plans</p>
          <p className="mt-1 text-muted-foreground">Create and manage subscription plans.</p>
        </Link>
        <Link className="rounded-md border bg-background p-4 text-sm hover:bg-muted" href={`/dashboard/tax-codes${orgOptions[0]?.id ? `?orgId=${orgOptions[0].id}` : ""}`}>
          <p className="font-medium">Tax Codes</p>
          <p className="mt-1 text-muted-foreground">Upload SPIC + package code registries.</p>
        </Link>
        <Link className="rounded-md border bg-background p-4 text-sm hover:bg-muted" href={`/dashboard/subscriptions${orgOptions[0]?.id ? `?orgId=${orgOptions[0].id}` : ""}`}>
          <p className="font-medium">Subscriptions</p>
          <p className="mt-1 text-muted-foreground">Inspect active, past due, and canceled subscriptions.</p>
        </Link>
      </div>

      {sp.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
          {sp.error}
        </div>
      ) : null}

      {sp.payUrl ? (
        <div className="rounded-md border bg-background p-4">
          <div className="text-sm font-medium">Checkout session created</div>
          <div className="mt-2 break-all text-sm">
            <Link className="underline" href={sp.payUrl}>
              {sp.payUrl}
            </Link>
          </div>
          {sp.publicToken ? (
            <div className="mt-2 text-xs text-muted-foreground">publicToken: {sp.publicToken}</div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-md border bg-background p-4">
        <div className="text-sm font-medium">Create hosted checkout</div>
        <form action={createHostedCheckoutAction} className="mt-4 grid gap-3">
          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="orgId">
              Org ID
            </label>
            <Input id="orgId" name="orgId" placeholder="org uuid" required defaultValue={orgOptions[0]?.id ?? ""} />
            {orgOptions.length ? (
              <div className="text-xs text-muted-foreground">
                Your orgs: {orgOptions.map((o: any) => o.slug).join(", ")}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No org memberships found for this user.</div>
            )}
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="amountMinor">
              Amount (minor)
            </label>
            <Input id="amountMinor" name="amountMinor" type="number" min={1} required defaultValue={200000} />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="currency">
              Currency
            </label>
            <Input id="currency" name="currency" required defaultValue="UZS" />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-medium" htmlFor="description">
              Description
            </label>
            <Input id="description" name="description" defaultValue="Hosted checkout" />
          </div>

          <Button type="submit">Create</Button>
        </form>
      </div>
    </div>
  );
}
