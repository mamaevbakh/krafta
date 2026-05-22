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
import type { CatalogOption } from "@/components/dashboard/catalog-switcher";
import type { OrgOption } from "@/components/dashboard/org-switcher";
import { cn } from "@/lib/utils";

// Top-nav links. Categories migrates under Items per ADR 0002 §4.2 — the
// link still appears on the top nav (for now; KRA-76 will collapse this
// into the sidebar with proper sub-nav). The sub-path `items/categories`
// is the destination; the old `/categories` URL 308-redirects to it.
//
// KRA-92 adds Translations as a sibling of Items. Same temporary-top-nav
// pattern; the future sub-nav refactor (KRA-76) will tuck both under Items.
const DASHBOARD_LINKS = [
  { segment: "", label: "Overview" },
  { segment: "orders", label: "Orders" },
  { segment: "items", label: "Items" },
  { segment: "items/categories", label: "Categories" },
  // KRA-85 adds Modifiers under the Items tree per ADR 0002 §2. Same
  // temporary-top-nav pattern as Categories; collapses into the proper
  // Items sub-nav when KRA-76 lands.
  { segment: "items/modifiers", label: "Modifiers" },
  { segment: "translations", label: "Translations" },
  { segment: "builder", label: "Studio" },
  { segment: "billing", label: "Billing" },
  { segment: "settings", label: "Settings" },
] as const;

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

          <div className="shrink-0">
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
              {DASHBOARD_LINKS.map(({ segment, label }) => {
                const href = segment ? `${basePath}/${segment}` : basePath;
                const isActive = segment ? pathname.startsWith(href) : pathname === href;
                return (
                  <DashboardNavLink key={href} asChild isActive={isActive}>
                    <Link href={href}>{label}</Link>
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

