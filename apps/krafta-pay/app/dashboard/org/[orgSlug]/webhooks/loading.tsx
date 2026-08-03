import { Skeleton } from "@/components/ui/skeleton";

export default function WebhooksLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-6">
        <div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>

        <div className="space-y-8">
          <div className="flex max-w-2xl flex-col gap-6 rounded-xl bg-card py-6 shadow-xs ring-1 ring-foreground/10">
            <div className="grid gap-1 px-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <div className="grid gap-4 px-6">
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="grid gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-72 max-w-full" />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["w-28", "w-36", "w-32", "w-40", "w-24", "w-32"].map((width, index) => (
                    <Skeleton key={index} className={`h-6 ${width}`} />
                  ))}
                </div>
              </div>
              <Skeleton className="h-9 w-32 justify-self-start" />
            </div>
          </div>

          <section className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <div className="divide-y rounded-lg border">
              {[0, 1, 2].map((endpoint) => (
                <div key={endpoint} className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-64 max-w-full" />
                    <Skeleton className="mt-1.5 h-3 w-48" />
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Skeleton className="h-8 w-28" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-9" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left">
                  {/* Six columns, last one blank: it holds the row's Retry button. */}
                  <tr>
                    {["w-14", "w-14", "w-16", "w-20", "w-12", null].map((width, index) => (
                      <th key={index} className="px-3 py-2">
                        {width ? <Skeleton className={`h-4 ${width}`} /> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[0, 1, 2, 3, 4, 5].map((delivery) => (
                    <tr key={delivery}>
                      <td className="px-3 py-2">
                        <Skeleton className="h-3 w-40" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-3 w-6" />
                      </td>
                      <td className="max-w-[22rem] px-3 py-2">
                        <Skeleton className="h-3 w-10" />
                        <Skeleton className="mt-1 h-3 w-56" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="h-3 w-32" />
                      </td>
                      <td className="px-3 py-2">
                        <Skeleton className="ml-auto h-8 w-16" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
