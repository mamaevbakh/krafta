import { Skeleton } from "@/components/ui/skeleton";

export default function BillingLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      {/* Hero: badges + title + metric cards */}
      <section className="rounded-2xl border bg-background p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-8 w-80 max-w-full" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/70 bg-background/80 p-3"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section className="mt-8 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-background p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="space-y-1.5 text-right">
                  <Skeleton className="ml-auto h-5 w-24" />
                  <Skeleton className="ml-auto h-3 w-16" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
