import { Skeleton } from "@/components/ui/skeleton";

export default function TaxCodesLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>

        <div className="space-y-6">
          <div className="space-y-4 rounded-md border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="grid gap-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>

            <div className="grid gap-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="min-h-44 w-full" />
              <Skeleton className="h-3 w-56" />
            </div>

            <div className="flex items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-64" />
            </div>

            <Skeleton className="h-9 w-56" />
          </div>

          <div className="rounded-md border bg-background p-4">
            <Skeleton className="h-4 w-36" />
            <div className="mt-3 space-y-4">
              {[0, 1].map((registry) => (
                <div key={registry} className="rounded-md border p-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-1.5 h-3 w-64" />
                  <div className="mt-2 rounded border">
                    <div className="border-b bg-muted px-2 py-1.5">
                      <div className="grid grid-cols-3 gap-2">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                    </div>
                    {[0, 1, 2, 3, 4].map((entry) => (
                      <div key={entry} className="border-t px-2 py-1.5">
                        <div className="grid grid-cols-3 gap-2">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
