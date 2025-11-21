// components/catalogs/catalog-page-fallback.tsx
import { Skeleton } from "@/components/ui/skeleton";

export function CatalogPageFallback() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8 text-foreground">
      <header className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </header>

      <section className="space-y-6">
        {[1, 2, 3, 4, 5].map((cat) => (
          <div key={cat} className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}