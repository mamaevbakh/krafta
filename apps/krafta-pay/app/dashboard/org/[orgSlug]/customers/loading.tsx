import { Skeleton } from "@/components/ui/skeleton";

import { CustomersTableSkeleton } from "./customers-skeleton";

/**
 * Mirrors the Customers page exactly: toolbar, then table.
 *
 * It used to open with a title and a subtitle, which this page has not had
 * since the shell moved the page title into the header bar — so the real
 * content landed about fifty pixels higher than the skeleton and the whole
 * table jumped. A skeleton that shows something the page will not is worse
 * than no skeleton, because the shift it causes is the exact thing it exists
 * to prevent.
 *
 * The toolbar's left side is deliberately empty. The status tabs appear only
 * when they can actually split the list, so most loads have none; the "add
 * customer" button is always there and is what sets the row's height. Guessing
 * at tabs would trade a rare horizontal fill-in for a common phantom.
 */
export default function CustomersLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="flex flex-col gap-4 md:gap-6">
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div />
            <Skeleton className="h-8 w-36" />
          </div>

          <CustomersTableSkeleton />
        </section>
      </div>
    </div>
  );
}
