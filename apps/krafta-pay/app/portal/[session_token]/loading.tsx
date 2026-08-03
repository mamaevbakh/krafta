import { Skeleton } from "@/components/ui/skeleton";

// Invoice rows differ in width in the real table, so the plan column varies —
// a column of identical bars reads as a broken table rather than a loading one.
const INVOICE_PLAN_WIDTHS = ["w-24", "w-20", "w-28", "w-20", "w-24", "w-16"];

export default function CustomerPortalLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div
        aria-hidden="true"
        className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(300px,360px)_1fr]"
      >
        {/* Brand rail keeps its dark surface, so its skeletons are tinted white —
            bg-muted would read as light patches on black. */}
        <aside className="hidden bg-neutral-950 text-neutral-100 lg:block dark:bg-black">
          <div className="sticky top-0 flex min-h-screen flex-col px-9 py-10">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-8 rounded-md bg-white/15" />
              <Skeleton className="h-5 w-24 bg-white/15" />
            </div>

            <div className="mt-7 max-w-[26ch] space-y-2">
              <Skeleton className="h-3.5 w-full bg-white/10" />
              <Skeleton className="h-3.5 w-full bg-white/10" />
              <Skeleton className="h-3.5 w-2/3 bg-white/10" />
            </div>

            <Skeleton className="mt-7 h-9 w-40 bg-white/10" />

            <div className="flex-1" />

            <div className="border-t border-white/10 pt-6">
              <Skeleton className="h-3 w-48 bg-white/10" />
            </div>
          </div>
        </aside>

        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-3 bg-neutral-950 px-4 py-3 lg:hidden dark:bg-black">
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 rounded bg-white/15" />
              <Skeleton className="h-4 w-20 bg-white/15" />
            </div>
            <Skeleton className="h-4 w-16 bg-white/10" />
          </div>

          <main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
            <div className="mx-auto flex w-full max-w-[560px] flex-col gap-10">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <Skeleton className="h-7 w-52" />
                  <Skeleton className="mt-1 h-4 w-44" />
                </div>
                <Skeleton className="size-9 shrink-0 rounded-md" />
              </header>

              {/* Current subscription */}
              <section className="flex flex-col gap-5">
                <Skeleton className="h-3 w-36" />

                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>

                  <div className="flex items-baseline gap-2">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-4 w-16" />
                  </div>

                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-56" />

                  <div className="flex items-center gap-2.5 border-t border-border pt-3">
                    <Skeleton className="h-[22px] w-8 shrink-0 rounded" />
                    <Skeleton className="h-4 w-36" />
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <Skeleton className="h-8 w-32 rounded-md" />
                    <Skeleton className="h-8 w-36 rounded-md" />
                  </div>
                </div>
              </section>

              {/* Payment method */}
              <section className="flex flex-col gap-3 border-t border-border pt-10">
                <Skeleton className="h-3 w-32" />

                <div className="flex flex-col gap-2">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-3"
                    >
                      <Skeleton className="h-[22px] w-8 shrink-0 rounded" />
                      <div className="min-w-0">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="mt-1 h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-1">
                  <Skeleton className="h-8 w-36 rounded-md" />
                </div>
              </section>

              {/* Billing information */}
              <section className="flex flex-col gap-3 border-t border-border pt-10">
                <Skeleton className="h-3 w-40" />

                <div className="divide-y divide-border">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  ))}
                </div>
              </section>

              {/* Invoice history */}
              <section className="flex flex-col gap-3 border-t border-border pt-10">
                <Skeleton className="h-3 w-36" />

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3">
                          <Skeleton className="h-3 w-12" />
                        </th>
                        <th className="py-2 pr-3">
                          <Skeleton className="h-3 w-14" />
                        </th>
                        <th className="py-2 pr-3">
                          <Skeleton className="ml-auto h-3 w-14" />
                        </th>
                        <th className="py-2">
                          <Skeleton className="h-3 w-14" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {INVOICE_PLAN_WIDTHS.map((width, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="py-3 pr-3">
                            <Skeleton className="h-4 w-28" />
                          </td>
                          <td className="py-3 pr-3">
                            <Skeleton className={`h-4 ${width}`} />
                          </td>
                          <td className="py-3 pr-3">
                            <Skeleton className="ml-auto h-4 w-24" />
                          </td>
                          <td className="py-3">
                            <Skeleton className="h-5 w-20 rounded-full" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
