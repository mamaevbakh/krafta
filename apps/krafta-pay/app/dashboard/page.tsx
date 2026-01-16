import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createHostedCheckoutAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; payUrl?: string; publicToken?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", auth.user!.id);

  const orgOptions = (memberships ?? [])
    .map((m: any) => m.organizations)
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {auth.user?.email}</p>
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
