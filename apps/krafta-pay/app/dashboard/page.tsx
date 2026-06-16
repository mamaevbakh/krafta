import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  BookText,
  CreditCard,
  KeyRound,
  Layers,
  Receipt,
  Repeat,
  ScrollText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { createHostedCheckoutAction } from "@/app/dashboard/actions";
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

// Home grid mirrors the nav, curated Atmos-first. Each card deep-links into the
// section, scoped to the user's first org where the page expects an orgId.
const NAV_ITEMS = [
  {
    href: "/dashboard/providers",
    title: "Providers",
    description: "Connect Atmos to accept cards inline — plus other acquirers.",
    Icon: CreditCard,
    orgScoped: true,
  },
  {
    href: "/dashboard/plans",
    title: "Plans",
    description: "Create and manage subscription plans.",
    Icon: Layers,
    orgScoped: true,
  },
  {
    href: "/dashboard/subscriptions",
    title: "Subscriptions",
    description: "Track active, past-due, and canceled subscriptions.",
    Icon: Repeat,
    orgScoped: true,
  },
  {
    href: "/dashboard/api-keys",
    title: "API keys",
    description: "Issue and revoke keys for the Checkout API.",
    Icon: KeyRound,
    orgScoped: true,
  },
  {
    href: "/dashboard/tax-codes",
    title: "Tax codes",
    description: "SPIC + package code registries for fiscalization.",
    Icon: Receipt,
    orgScoped: true,
  },
  {
    href: "/dashboard/logs",
    title: "Logs",
    description: "Inspect provider calls, callbacks, and webhooks — no SQL.",
    Icon: ScrollText,
    orgScoped: true,
  },
  {
    href: "/dashboard/docs",
    title: "Docs",
    description: "Platform reference, flows, and the logs event dictionary.",
    Icon: BookText,
    orgScoped: false,
  },
] as const;

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

  const memberships = await getCurrentUserMemberships();
  const firstOrgId = memberships[0]?.orgId ?? "";

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.map((item) => {
          const href =
            item.orgScoped && firstOrgId ? `${item.href}?orgId=${firstOrgId}` : item.href;
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={href}
              className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card
                size="sm"
                className="h-full transition-colors group-hover:bg-muted/40 group-focus-visible:bg-muted/40"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {item.title}
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
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
            <CardTitle>Payment link created</CardTitle>
            <CardDescription>Share this URL with the customer to collect payment.</CardDescription>
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
        <h2 className="text-sm font-medium">Create a payment link</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate a hosted checkout URL the customer pays on Krafta Pay.
        </p>

        {memberships.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No organization memberships found for this user.
          </div>
        ) : (
          <Card size="sm" className="mt-4 max-w-md">
            <CardContent>
              <form action={createHostedCheckoutAction} className="grid gap-4">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="orgId">
                    Organization
                  </label>
                  <select
                    id="orgId"
                    name="orgId"
                    required
                    defaultValue={firstOrgId}
                    // text-base on mobile keeps the font >=16px so iOS doesn't
                    // zoom the viewport on focus (matches the Input primitive).
                    className="h-10 w-full rounded-md border bg-background px-3 text-base md:text-sm"
                  >
                    {memberships.map((m) => (
                      <option key={m.orgId} value={m.orgId}>
                        {m.orgName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="amount">
                    Amount
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
                    Description
                  </label>
                  <Input
                    id="description"
                    name="description"
                    placeholder="What is this charge for?"
                  />
                </div>

                <Button type="submit" className="justify-self-start">
                  Create link
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
