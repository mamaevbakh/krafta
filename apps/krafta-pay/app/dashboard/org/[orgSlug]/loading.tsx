import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The loading state, tracing the real page.
 *
 * The previous version described a page that no longer exists — a title
 * header, an MRR card, three setup steps and a payment-link form — so the
 * dashboard visibly rearranged itself on every load. A skeleton that does not
 * match its page is worse than none: it promises a layout and then withdraws
 * it.
 *
 * Shapes and spacing are copied from the components themselves, including the
 * layout-level px-4 lg:px-6, so nothing shifts when the real content lands.
 */
export default function OrgOverviewLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="flex flex-col gap-4 md:gap-6">
        {/* Four figure cards — same grid, same container breakpoints. */}
        <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
          {["collected", "outstanding", "failed", "attention"].map((k) => (
            <Card key={k} className="@container/card">
              <CardHeader>
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="mt-1 h-8 w-40" />
              </CardHeader>
              <CardFooter className="flex-col items-start gap-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3.5 w-44" />
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* The chart card: header, range toggle, and the 240px plot area. */}
        <div>
          <Card className="@container/card">
            <CardHeader>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-1 h-3.5 w-36" />
            </CardHeader>
            <div className="px-6 pb-6">
              <Skeleton className="h-[240px] w-full" />
            </div>
          </Card>
        </div>

        {/* Tabs and controls, then the table itself. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-9 w-72" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
            <Skeleton className="size-4" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="ml-auto h-3.5 w-24" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-6 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
