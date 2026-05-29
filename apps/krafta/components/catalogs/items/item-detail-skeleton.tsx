import { Skeleton } from "@/components/ui/skeleton";

/**
 * item-detail-skeleton.tsx — loading fallback for the dynamically
 * imported ItemDetailFullscreen.
 *
 * Why this exists: ItemDetailFullscreen is `dynamic()`-imported in
 * item-detail-controller.tsx. The first time any customer opens a
 * detail, the ~50kB chunk has to be fetched. Without an explicit
 * `loading` option, that fetch suspends to the nearest Suspense
 * boundary — the page-level app/[...slug]/loading.tsx — which flashes
 * the whole CATALOG skeleton over the catalog for ~350ms. Returning
 * `null` instead leaves the dialog blank for that window. This
 * skeleton is the right answer: it renders INSIDE the dialog overlay
 * with the exact shape of the real detail (edge-to-edge image block,
 * title + price + description lines, a couple of modifier groups,
 * sticky bottom CTA), so the open feels instant and there's zero
 * layout shift when the real component swaps in.
 *
 * The shape mirrors ItemDetailFullscreen's root container 1:1:
 *   mx-auto flex h-dvh w-full max-w-[480px] flex-col ... md:h-[85dvh]
 * — same width clamp, same rounded/shadow on desktop, same image
 * 35-55dvh band, same px-5 body padding, same sticky footer.
 *
 * No props: `dynamic({ loading })` fallbacks are zero-arg, so we can't
 * know the item's real aspect ratio or whether it has a photo. A
 * generic image band + body is the correct generic placeholder.
 */
export function ItemDetailSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-background text-foreground md:h-[85dvh] md:rounded-sm md:shadow-xl"
    >
      {/* Floating chrome placeholders — Share + Close. Match the real
          view's sticky h-0 anchor so the circles pin top-right over
          the image band without taking vertical space. */}
      <div className="sticky top-0 z-20 h-0">
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>

      {/* Image band — same 35-55dvh clamp as the real view. bg-muted
          base with a pulsing skeleton fill so it reads as "photo
          loading" rather than an empty void. */}
      <div
        className="relative w-full shrink-0 overflow-hidden bg-muted"
        style={{ minHeight: "35dvh", maxHeight: "55dvh", aspectRatio: 4 / 5 }}
      >
        <Skeleton className="absolute inset-0 rounded-none" />
      </div>

      {/* Body — title, price, description, modifier groups. Mirrors the
          real view's `flex flex-1 flex-col gap-5 px-5 pb-28 pt-5`. */}
      <div className="flex flex-1 flex-col gap-5 px-5 pb-28 pt-5">
        <div className="space-y-2">
          {/* category eyebrow */}
          <Skeleton className="h-3 w-20" />
          {/* title (text-3xl → ~h-8) */}
          <Skeleton className="h-8 w-3/4" />
        </div>

        {/* price (text-2xl → ~h-7) */}
        <Skeleton className="h-7 w-24" />

        {/* description lines */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>

        {/* two modifier-group blocks: heading + 3 option rows each */}
        {Array.from({ length: 2 }).map((_, group) => (
          <div key={group} className="space-y-3 pt-1">
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-3"
                >
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky CTA — same chrome as the real footer (border-t +
          bg-background/95), with a full-width button-height block. */}
      <div className="sticky bottom-0 z-10 mt-auto w-full border-t border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full flex-col gap-3 px-5 py-4">
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
