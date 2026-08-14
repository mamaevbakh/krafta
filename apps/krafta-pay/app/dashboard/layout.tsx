import { getDashboardEnvironment } from "@/lib/dashboard-env";
import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { getUserSafely } from "@krafta/supabase/auth";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { AppSidebar } from "@/components/dashboard/app-sidebar.client";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SiteHeader } from "@/components/dashboard/site-header.client";
import { getPayLocale, getPayT } from "@/lib/locales/server";
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
  const t = await getPayT();

  return (
    <PayLocaleProvider locale={locale}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <AppSidebar
          memberships={memberships}
          userEmail={user.email ?? null}
          environment={environment}
          locale={locale}
        />
        <SidebarInset>
          <SiteHeader />
          {/* The block wraps content in these exact two divs; the gap and the
              vertical rhythm of every section below depend on them. */}
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">{children}</div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PayLocaleProvider>
  );
}
