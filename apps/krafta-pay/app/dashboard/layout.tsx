import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link className="text-sm font-semibold" href="/dashboard">
              Krafta•Pay Dashboard
            </Link>
            <nav className="flex items-center gap-3 text-xs text-muted-foreground">
              <Link className="hover:underline" href="/dashboard/providers">Providers</Link>
              <Link className="hover:underline" href="/dashboard/plans">Plans</Link>
              <Link className="hover:underline" href="/dashboard/api-keys">API Keys</Link>
              <Link className="hover:underline" href="/dashboard/subscriptions">Subscriptions</Link>
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
