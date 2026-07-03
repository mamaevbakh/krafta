import { Skeleton } from "@/components/ui/skeleton";

export default function NewShopLoading() {
  return (
    <main className="min-h-screen bg-secondary-background">
      <div className="mx-auto w-full max-w-xl px-6 py-12">
        <header className="flex items-center justify-between">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-6 w-40 rounded-full" />
        </header>

        <div className="mt-12 space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-3/4 max-w-sm" />
        </div>

        <div className="mt-8 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </main>
  );
}
