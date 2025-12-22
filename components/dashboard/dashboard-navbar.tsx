"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "@/components/ui/navigation-menu";
import { DashboardNavLink } from "@/components/dashboard/dashboard-nav-link";
import Link from "next/link";
import { CatalogSwitcher } from "./catalog-switcher";
import type { CatalogSummary } from "@/lib/dashboard/catalogs";
import { LayoutGroup } from "framer-motion";

const DASHBOARD_LINKS = [
  { segment: "", label: "Overview" },
  { segment: "categories", label: "Categories" },
  { segment: "items", label: "Items" },
  { segment: "builder", label: "Builder" },
  { segment: "settings", label: "Settings" },
] as const;

export function DashboardNavbar({
  orgSlug,
  catalogSlug,
  catalogs,
}: {
  orgSlug: string;
  catalogSlug: string;
  catalogs: CatalogSummary[];
}) {
  const pathname = usePathname();
  const basePath = useMemo(
    () => `/dashboard/${orgSlug}/${catalogSlug}`,
    [orgSlug, catalogSlug],
  );

  return (
    <div className="flex flex-col">
      {/* Logo block */}
      <header className="px-6 py-3 h-16">
        <nav className="h-full flex items-center space-x-4">
            <h1 className="h-full flex items-center text-2xl font-semibold text-shadow-sm">
                Krafta
            </h1>
            <CatalogSwitcher
              orgSlug={orgSlug}
              currentCatalogSlug={catalogSlug}
              catalogs={catalogs}
            />
        </nav>
      </header>

      {/* Navigation block */}
      <nav className="relative px-4 -mt-2.5">
  {/* Fake bottom border */}
  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border" />

  <LayoutGroup id="dashboard-nav">
    <NavigationMenu>
    {DASHBOARD_LINKS.map(({ segment, label }) => {
      const href = segment ? `${basePath}/${segment}` : basePath;
      const isActive = segment
        ? pathname.startsWith(href)
        : pathname === href;

      return (
      <DashboardNavLink
        key={href}
        asChild
        isActive={isActive}
      >
        <Link href={href}>{label}</Link>
      </DashboardNavLink>
      );
    })}
    </NavigationMenu>
  </LayoutGroup>
</nav>
    </div>
  );
}
