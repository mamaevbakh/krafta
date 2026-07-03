import { DashboardHeaderSkeleton } from "@/components/dashboard/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <main className="w-full">
      <DashboardHeaderSkeleton action />

      <div className="mx-auto max-w-[1248px] space-y-6 px-6 py-6 pb-24">
        {/* Queue card */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="mt-4 flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-56 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>

        {/* KPI card: revenue / orders / avg check */}
        <div className="grid grid-cols-1 divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* Sales bars */}
        <div className="rounded-xl border bg-card p-5">
          <Skeleton className="h-6 w-40" />
          <div className="mt-4 flex h-24 items-end gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1"
                style={{ height: `${30 + ((i * 37) % 60)}%` }}
              />
            ))}
          </div>
        </div>

        {/* Recent orders */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-2 p-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="divide-y border-t">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
