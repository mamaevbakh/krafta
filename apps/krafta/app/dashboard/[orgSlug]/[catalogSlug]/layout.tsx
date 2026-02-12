import { Suspense } from "react";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { DashboardNavbar } from "@/components/dashboard/dashboard-navbar";
import {
  getOrgCatalogSummaries,
  type CatalogSummary,
  type CookieSnapshot,
} from "@/lib/dashboard/catalogs";
import { createClient } from "@/lib/supabase/server";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { CatalogSwitcherSkeleton } from "@/components/dashboard/catalog-switcher";

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

  // Get current user
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const user = {
    name: authUser?.user_metadata?.full_name || authUser?.email?.split("@")[0] || "User",
    email: authUser?.email || "",
    avatar: authUser?.user_metadata?.avatar_url,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardNavbar
        orgSlug={orgSlug}
        catalogSlug={catalogSlug}
        catalogs={catalogs}
        user={user}
      />
      <main className="flex-1 bg-secondary-background">{children}</main>
    </div>
  );
}

function CatalogLayoutFallback() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-3 h-16">
        <nav className="h-full flex items-center space-x-4">
          <h1 className="h-full flex items-center text-2xl">
            <BrandWordmark className="text-2xl" />
          </h1>
          <CatalogSwitcherSkeleton />
        </nav>
      </header>
      <main className="flex-1 bg-secondary-background" />
    </div>
  );
}
