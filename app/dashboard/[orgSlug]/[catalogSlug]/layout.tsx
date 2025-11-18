import { Suspense } from "react";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { DashboardNavbar } from "@/components/dashboard/dashboard-navbar";
import {
  getOrgCatalogSummaries,
  type CatalogSummary,
  type CookieSnapshot,
} from "@/lib/dashboard/catalogs";

type CatalogLayoutProps = {
  children: ReactNode;
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default function CatalogLayout(props: CatalogLayoutProps) {
  return (
    <Suspense fallback={<CatalogLayoutFallback />}>
      <CatalogLayoutContent {...props} />
    </Suspense>
  );
}

async function CatalogLayoutContent({ children, params }: CatalogLayoutProps) {
  const { orgSlug, catalogSlug } = await params;
  const cookieStore = await cookies();
  const cookieSnapshot: CookieSnapshot = cookieStore
    .getAll()
    .map(({ name, value }) => ({ name, value }));
  const catalogs: CatalogSummary[] = await getOrgCatalogSummaries(
    orgSlug,
    cookieSnapshot,
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardNavbar
        orgSlug={orgSlug}
        catalogSlug={catalogSlug}
        catalogs={catalogs}
      />
      <main className="flex-1 bg-secondary-background">{children}</main>
    </div>
  );
}

function CatalogLayoutFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="h-16 w-full animate-pulse bg-muted" />
      <main className="flex-1 bg-secondary-background" />
    </div>
  );
}
