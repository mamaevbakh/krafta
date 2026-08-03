import { getDashboardEnvironment } from "@/lib/dashboard-env";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { getUserSafely } from "@krafta/supabase/auth";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar.client";
import { getPayLocale } from "@/lib/locales/server";
import { PayLocaleProvider } from "@/lib/locales/context";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { user, authError } = await getUserSafely(supabase);

  if (authError || !user) {
    const origin = getRequestOrigin(await headers());
    redirect(buildKraftaLoginUrl(`${origin}/dashboard`));
  }

  // Still loaded, but only so a merchant who genuinely belongs to several orgs
  // can switch between them. With the org in the path, a single-org merchant
  // never sees a picker at all — the sidebar hides it.
  const memberships = await getCurrentUserMemberships();
  const environment = await getDashboardEnvironment();
  const locale = await getPayLocale();

  return (
    <PayLocaleProvider locale={locale}>
      <div className="min-h-dvh bg-background">
        <DashboardSidebar
          memberships={memberships}
          userEmail={user.email ?? null}
          environment={environment}
          locale={locale}
        />
        <div className="md:pl-60">
          <main className="mx-auto max-w-5xl px-6 py-8 md:py-10">{children}</main>
        </div>
      </div>
    </PayLocaleProvider>
  );
}
