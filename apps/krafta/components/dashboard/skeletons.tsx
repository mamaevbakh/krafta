import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared dashboard loading-state primitives, all built on the `Skeleton`
 * component. Route `loading.tsx` files compose these so every dashboard page
 * shows a layout-matching skeleton (not a bare spinner) while its server data
 * streams in.
 *
 * The measurements here intentionally mirror the real panels:
 *   - header band: full-width `border-b` shell + max-w-[1248px] inner row at
 *     h-[120px] (see items-panel / orders-panel / settings-panel).
 *   - data table: the TanStack `DataTable` shape (status tabs, toolbar,
 *     bordered table, pagination footer).
 */

/** Standard page header band: title (+ optional subtitle) left, optional action right. */
export function DashboardHeaderSkeleton({
  subtitle = true,
  action = false,
  className,
}: {
  subtitle?: boolean;
  action?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full border-b", className)}>
      <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between px-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          {subtitle ? <Skeleton className="h-4 w-72 max-w-[70vw]" /> : null}
        </div>
        {action ? <Skeleton className="h-9 w-32 shrink-0" /> : null}
      </div>
    </div>
  );
}

/** Row of clickable stat/status cards that sit above a data table (All / Active / …). */
export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex w-full gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="min-w-0 flex-1 rounded-lg border px-3 py-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-2 h-7 w-10" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for the shared TanStack `DataTable` used by Items, Orders,
 * Categories and Modifiers. Optional status tabs on top, then the toolbar
 * (search + row count + column controls), the bordered table (header + rows),
 * and the pagination footer.
 */
export function DataTableSkeleton({
  statusTabs = false,
  tabCount = 3,
  rows = 8,
  /** Width classes per column; the array length is the column count. */
  columns = ["flex-1", "w-24", "w-24", "w-16", "w-10"],
  toolbar = true,
}: {
  statusTabs?: boolean;
  tabCount?: number;
  rows?: number;
  columns?: string[];
  toolbar?: boolean;
}) {
  return (
    <div className="w-full space-y-4">
      {statusTabs ? <StatCardsSkeleton count={tabCount} /> : null}

      {toolbar ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-[220px]" />
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border bg-background">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          {columns.map((width, i) => (
            <Skeleton key={i} className={cn("h-4", width)} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0"
          >
            {columns.map((width, i) => (
              <Skeleton key={i} className={cn("h-4", width)} />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 py-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

/**
 * A generic "picker" grid used by the org / catalog chooser pages: a header
 * (wordmark + badge), a title block, a search box, and a responsive card grid.
 */
export function PickerPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <main className="min-h-screen bg-secondary-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </header>

        <div className="mt-10 flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-[80vw]" />
        </div>

        <div className="mt-6">
          <Skeleton className="h-9 w-full max-w-md" />
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-4 w-40" />
              <div className="mt-6 flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-3" />
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
