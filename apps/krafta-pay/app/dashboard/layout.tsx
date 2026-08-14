import { getDashboardEnvironment } from "@/lib/dashboard-env";
import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildKraftaLoginUrl, getRequestOrigin } from "@/lib/auth-redirect";
import { getUserSafely } from "@krafta/supabase/auth";
import { getCurrentUserMemberships } from "@/lib/org-memberships";
import { AppSidebar } from "@/components/dashboard/app-sidebar.client";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
          {/* The trigger has to live outside the sidebar so it survives the
              collapsed state — that is the whole point of the inset layout. */}
          <header className="flex h-14 items-center gap-2 border-b px-4 md:px-6">
            <SidebarTrigger className="-ml-1" />
          </header>
          <main className="@container/main flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </PayLocaleProvider>
  );
}
