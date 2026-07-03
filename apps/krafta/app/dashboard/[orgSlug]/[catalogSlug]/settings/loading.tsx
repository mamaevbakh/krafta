import { DashboardHeaderSkeleton } from "@/components/dashboard/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <main className="w-full">
      <DashboardHeaderSkeleton />
      <div className="mx-auto max-w-[1248px] px-6 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="lg:w-56">
            <div className="space-y-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          </aside>

          <section className="flex-1">
            <div className="rounded-xl border border-border bg-card p-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-64 max-w-full" />
              <div className="mt-6 space-y-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
                <Skeleton className="h-9 w-32" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
