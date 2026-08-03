import { Skeleton } from "@/components/ui/skeleton";

export default function LogsLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>

        <div className="space-y-6">
          <div className="rounded-md border bg-background p-4">
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1, 2].map((field) => (
                <div key={field}>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-2 h-10 w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-4 h-3 w-96 max-w-full" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr,2fr]">
            <div className="rounded-md border bg-background p-4">
              <Skeleton className="h-4 w-36" />
              <div className="mt-3 space-y-2">
                {[0, 1, 2, 3, 4].map((checkout) => (
                  <div key={checkout} className="rounded-md border bg-background p-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="mt-1.5 h-3 w-32" />
                    <Skeleton className="mt-1.5 h-3 w-44" />
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-md border bg-muted/10 p-3">
                <Skeleton className="h-3 w-52" />
                <div className="mt-2 space-y-1.5">
                  {[0, 1, 2, 3].map((token) => (
                    <Skeleton key={token} className="h-3 w-full" />
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-14" />
              </div>

              <div className="mt-3 space-y-3">
                {[0, 1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="mt-1.5 h-3 w-56" />
                        <Skeleton className="mt-1.5 h-3 w-40" />
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Skeleton className="h-3 w-36" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
