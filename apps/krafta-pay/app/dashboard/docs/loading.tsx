import { Skeleton } from "@/components/ui/skeleton";

const TABS = [0, 1];
const BODY_BLOCKS = [0, 1, 2];

export default function DocsLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Skeleton className="h-7 w-56" />
            <Skeleton className="mt-2 h-4 w-96" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>

        <div className="flex gap-1 border-b">
          {TABS.map((tab) => (
            <div key={tab} className="px-3 py-2">
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="mt-3 h-9 w-80" />
            <Skeleton className="mt-2 h-4 w-full max-w-3xl" />
          </div>

          <div className="rounded-xl border bg-background p-6 md:p-8">
            <div className="mx-auto max-w-4xl space-y-8">
              {BODY_BLOCKS.map((block) => (
                <div key={block} className="space-y-4">
                  <Skeleton className="h-7 w-64" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                  <Skeleton className="h-28 w-full rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
