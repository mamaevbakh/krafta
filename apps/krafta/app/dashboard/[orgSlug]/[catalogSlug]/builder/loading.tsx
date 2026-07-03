import { DashboardHeaderSkeleton } from "@/components/dashboard/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function BuilderLoading() {
  return (
    <main className="w-full">
      <DashboardHeaderSkeleton subtitle={false} action />

      <div className="mx-auto max-w-[1248px] px-6 py-8">
        {/* Studio section switcher */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
            <div className="mt-4 flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-28 rounded-md" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[384px_minmax(0,1fr)] xl:items-start">
          {/* Control rail */}
          <aside className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-5">
                <Skeleton className="h-5 w-32" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Live preview surface */}
          <Skeleton className="h-[640px] w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
