import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/console/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { APPROVALS } from "@/lib/mock/data"
import { getSelectedOrg, getUserOrgs } from "@/lib/orgs"
import { createClient } from "@/lib/supabase/server"
import { getDict, type Locale } from "@/lib/i18n"

export default async function ConsoleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  // Next 16's generated route validator types `params` as plain strings, so
  // the narrowing to Locale happens here rather than in the signature. The
  // parent layout has already 404'd anything that isn't a real locale.
  params: Promise<{ locale: string }>
}) {
  const { locale } = (await params) as { locale: Locale }
  const dict = getDict(locale)

  // proxy.ts already redirects signed-out visitors, but a layout must not
  // assume that: the matcher can be edited, and a missed case would render the
  // console shell to an anonymous visitor rather than failing closed.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  const [orgs, org] = await Promise.all([getUserOrgs(), getSelectedOrg()])

  return (
    <SidebarProvider>
      <AppSidebar
        locale={locale}
        dict={dict}
        orgs={orgs}
        currentOrg={org}
        userEmail={user.email ?? ""}
        pendingApprovals={APPROVALS.length}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
