// app/[...slug]/loading.tsx

import { Skeleton } from "@/components/ui/skeleton";

export default function CatalogLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 text-foreground">
      {/* Header skeleton */}
      <header className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </header>

      {/* Category nav skeleton */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-7 w-16 rounded-full" />
        ))}
      </div>

      {/* Sections skeleton */}
      <section className="space-y-6">
        {Array.from({ length: 3 }).map((_, sectionIndex) => (
          <div key={sectionIndex} className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, itemIndex) => (
                <div
                  key={itemIndex}
                  className="flex flex-col gap-2 rounded-lg border px-3 py-2"
                >
                  <Skeleton className="h-24 w-full rounded-md" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
