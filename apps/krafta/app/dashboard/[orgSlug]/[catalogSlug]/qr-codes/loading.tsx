import { Skeleton } from "@/components/ui/skeleton";

function QrCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="aspect-square w-full rounded-md" />
      <Skeleton className="h-3 w-28" />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

export default function QrCodesLoading() {
  return (
    <div className="mx-auto flex max-w-[1248px] flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </header>

      {/* QR studio (style controls + live preview) */}
      <Skeleton className="h-64 w-full rounded-xl" />

      <section className="flex flex-col gap-4">
        <Skeleton className="h-4 w-24" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <QrCardSkeleton key={i} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-72 max-w-[70vw]" />
          </div>
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <QrCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
