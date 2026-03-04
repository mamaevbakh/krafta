import { Suspense } from "react";
import type { OrgOption } from "@/components/dashboard/org-switcher";
import { DashboardNavbarClient } from "@/components/dashboard/dashboard-navbar-client";
import { DashboardNavbarSkeleton } from "@/components/dashboard/dashboard-navbar-skeleton";
import type { CatalogOption } from "@/components/dashboard/catalog-switcher";

export function DashboardNavbar(props: {
  orgSlug: string;
  catalogSlug: string;
  orgs: OrgOption[];
  catalogs: CatalogOption[];
  user: { name: string; email: string; avatar?: string };
  showUpgradeCta?: boolean;
}) {
  return (
    <Suspense fallback={<DashboardNavbarSkeleton />}>
      <DashboardNavbarClient
        orgSlug={props.orgSlug}
        catalogSlug={props.catalogSlug}
        orgs={props.orgs}
        catalogs={props.catalogs}
        user={props.user}
        showUpgradeCta={props.showUpgradeCta}
      />
    </Suspense>
  );
}
