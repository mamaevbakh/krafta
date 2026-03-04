import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { CatalogSwitcherSkeleton } from "@/components/dashboard/catalog-switcher";
import { OrgSwitcherSkeleton } from "@/components/dashboard/org-switcher";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardNavbarSkeleton() {
  return (
    <div className="flex flex-col">
      <header className="px-6 py-3 h-16">
        <nav className="h-full flex items-center gap-3">
          <h1 className="h-full shrink-0 flex items-center text-2xl">
            <BrandWordmark className="text-2xl" />
          </h1>

          <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-2">
              <OrgSwitcherSkeleton />
              <CatalogSwitcherSkeleton />
            </div>
          </div>

          <Skeleton className="size-10 rounded-lg" />
        </nav>
      </header>

      <nav className="relative px-4 -mt-2.5">
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-border" />
        <div className="h-10" />
      </nav>
    </div>
  );
}

