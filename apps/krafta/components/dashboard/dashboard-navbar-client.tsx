"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup } from "framer-motion";

import { NavigationMenu } from "@/components/ui/navigation-menu";
import { DashboardNavLink } from "@/components/dashboard/dashboard-nav-link";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { CatalogSwitcher } from "@/components/dashboard/catalog-switcher";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { DashboardUserMenu } from "@/components/dashboard/dashboard-user-menu";
import { DashboardLanguageSwitcher } from "@/components/dashboard/dashboard-language-switcher";
import type { CatalogOption } from "@/components/dashboard/catalog-switcher";
import type { OrgOption } from "@/components/dashboard/org-switcher";
import { useT } from "@/lib/locales/dashboard/context";
import type { DashboardMessageKey } from "@/lib/locales/dashboard/messages";
import { cn } from "@/lib/utils";

// Top-nav links. Categories migrates under Items per ADR 0002 §4.2 — the
// link still appears on the top nav (for now; KRA-76 will collapse this
// into the sidebar with proper sub-nav). The sub-path `items/categories`
// is the destination; the old `/categories` URL 308-redirects to it.
//
// KRA-92 adds Translations as a sibling of Items. Same temporary-top-nav
// pattern; the future sub-nav refactor (KRA-76) will tuck both under Items.
const DASHBOARD_LINKS: { segment: string; labelKey: DashboardMessageKey }[] = [
  { segment: "", labelKey: "nav.overview" },
  { segment: "orders", labelKey: "nav.orders" },
  { segment: "items", labelKey: "nav.items" },
  { segment: "items/categories", labelKey: "nav.categories" },
  // KRA-85 adds Modifiers under the Items tree per ADR 0002 §2. Same
  // temporary-top-nav pattern as Categories; collapses into the proper
  // Items sub-nav when KRA-76 lands.
  { segment: "items/modifiers", labelKey: "nav.modifiers" },
  { segment: "translations", labelKey: "nav.translations" },
  { segment: "qr-codes", labelKey: "nav.qr_codes" },
  { segment: "builder", labelKey: "nav.studio" },
  { segment: "billing", labelKey: "nav.billing" },
  { segment: "settings", labelKey: "nav.settings" },
];

export function DashboardNavbarClient({
  orgSlug,
  catalogSlug,
  orgs,
  catalogs,
  user,
  showUpgradeCta = true,
}: {
  orgSlug: string;
  catalogSlug: string;
  orgs: OrgOption[];
  catalogs: CatalogOption[];
  user: { name: string; email: string; avatar?: string };
  showUpgradeCta?: boolean;
}) {
  const pathname = usePathname();
  const t = useT();
  const basePath = useMemo(
    () => `/dashboard/${orgSlug}/${catalogSlug}`,
    [orgSlug, catalogSlug],
  );

  return (
    <div className="flex flex-col">
      <header className="px-6 py-3 h-16">
        <nav className="h-full flex items-center gap-3">
          <h1 className="h-full shrink-0 flex items-center text-2xl">
            <BrandWordmark className="text-2xl" />
          </h1>

          {/* Middle is horizontally scrollable; avatar stays pinned right */}
          <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-2">
              <OrgSwitcher
                currentOrgSlug={orgSlug}
                orgs={orgs}
                triggerClassName="min-w-[220px]"
              />
              <CatalogSwitcher
                orgSlug={orgSlug}
                currentCatalogSlug={catalogSlug}
                catalogs={catalogs}
                triggerClassName="min-w-[240px]"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <DashboardLanguageSwitcher />
            <DashboardUserMenu
              user={user}
              orgSlug={orgSlug}
              catalogSlug={catalogSlug}
              showUpgradeCta={showUpgradeCta}
            />
          </div>
        </nav>
      </header>

      <nav className="relative px-4 -mt-2.5">
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border" />

        <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <LayoutGroup id="dashboard-nav">
            <NavigationMenu className={cn("w-max max-w-none flex-none justify-start")}>
              {DASHBOARD_LINKS.map(({ segment, labelKey }) => {
                const href = segment ? `${basePath}/${segment}` : basePath;
                const isActive = segment ? pathname.startsWith(href) : pathname === href;
                return (
                  <DashboardNavLink key={href} asChild isActive={isActive}>
                    <Link href={href}>{t(labelKey)}</Link>
                  </DashboardNavLink>
                );
              })}
            </NavigationMenu>
          </LayoutGroup>
        </div>
      </nav>
    </div>
  );
}

