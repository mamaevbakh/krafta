import { Skeleton } from "@/components/ui/skeleton";

/**
 * The spine of the checkout: amount, divider, card fields, pay button.
 *
 * Three blocks on this page are conditional and unknowable before the data
 * loads — the test-mode banner, the "who's paying" fields (shown only when we
 * cannot name the payer yet), and the alternative-provider list. They are
 * deliberately not drawn. A skeleton is allowed to be shorter than the page it
 * precedes; what it must never do is draw something that then disappears,
 * because that collapses the layout under the customer's cursor while they are
 * reaching for the card field.
 */
export default function PayLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
        <header>
          <Skeleton className="h-5 w-28" />
        </header>

        <main className="mt-12 flex-1">
          <Skeleton className="h-4 w-24" />
          {/* The amount is the focal point and uses a clamped display size, so the
              bar tracks the largest step of that clamp to avoid a shift down. */}
          <Skeleton className="mt-1 h-10 w-56" />
          <Skeleton className="mt-2.5 h-4 w-44" />

          <div className="my-8 h-px bg-border" />

          <section>
            <Skeleton className="h-4 w-32" />

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>

              <div className="space-y-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-11 w-28" />
              </div>

              <div className="space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>

              <Skeleton className="h-11 w-full" />
            </div>
          </section>
        </main>

        <footer className="mt-12 flex items-center gap-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </footer>
      </div>
    </div>
  );
}
