import { Skeleton } from "@/components/ui/skeleton";

// One row per business type the first step offers, so the column does not grow
// when the real tiles arrive.
const TILE_WIDTHS = ["w-32", "w-28", "w-24", "w-36", "w-24", "w-32", "w-20"];

export default function OnboardingLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div aria-hidden="true" className="min-h-dvh bg-background">
        <div className="mx-auto flex w-full max-w-md flex-col px-6 py-10 sm:py-16">
          <Skeleton className="h-6 w-32" />

          <div className="mt-10">
            <Skeleton className="h-1 w-full rounded-full" />

            <Skeleton className="mt-8 h-7 w-56" />
            <Skeleton className="mt-1 h-4 w-64" />

            <div className="mt-6 flex flex-col gap-2">
              {TILE_WIDTHS.map((width, i) => (
                <div
                  key={i}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3"
                >
                  <Skeleton className="size-5 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className={`h-4 ${width}`} />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="size-4 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
