import { Skeleton } from "@/components/ui/skeleton";

// Three rows, not the usual five: a merchant can connect at most four
// provider/environment pairs, so a longer list would promise a page that
// cannot exist.
const ROWS = [0, 1, 2];

export default function ProvidersLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-32" />
          </div>

          <div className="rounded-lg border">
            {ROWS.map((row) => (
              <div
                key={row}
                className="flex flex-wrap items-center gap-3.5 border-b px-4 py-3.5 last:border-b-0"
              >
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-44" />
                </div>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="size-8" />
              </div>
            ))}
          </div>

          <Skeleton className="h-3 w-72" />
        </div>
      </div>
    </div>
  );
}
