import { Skeleton } from "@/components/ui/skeleton";

const FIELDS = [0, 1, 2, 3, 4, 5];
const PLANS = [0, 1, 2, 3, 4];

export default function PlansLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-6">
        <div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>

        <div className="space-y-6">
          <div className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field} className="grid gap-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}

            <div className="grid gap-1 md:col-span-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="md:col-span-2">
              <Skeleton className="h-9 w-28" />
            </div>
          </div>

          <div className="rounded-md border bg-background p-4">
            <Skeleton className="h-4 w-14" />
            <div className="mt-3 space-y-3">
              {PLANS.map((plan) => (
                <div key={plan} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-52" />
                      <Skeleton className="h-3 w-64" />
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-44" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-14" />
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-8 w-16" />
                    </div>
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
