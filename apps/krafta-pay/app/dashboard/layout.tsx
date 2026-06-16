import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { getUserSafely } from "@krafta/supabase/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);

  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-5">
            <Link className="shrink-0" href="/dashboard">
              <BrandWordmark text="Krafta•Pay" className="text-sm" />
            </Link>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <Link className="transition-colors hover:text-foreground" href="/dashboard/providers">Providers</Link>
              <Link className="transition-colors hover:text-foreground" href="/dashboard/plans">Plans</Link>
              <Link className="transition-colors hover:text-foreground" href="/dashboard/tax-codes">Tax codes</Link>
              <Link className="transition-colors hover:text-foreground" href="/dashboard/api-keys">API keys</Link>
              <Link className="transition-colors hover:text-foreground" href="/dashboard/subscriptions">Subscriptions</Link>
              <Link className="transition-colors hover:text-foreground" href="/dashboard/logs">Logs</Link>
              <Link className="transition-colors hover:text-foreground" href="/dashboard/docs">Docs</Link>
            </nav>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
