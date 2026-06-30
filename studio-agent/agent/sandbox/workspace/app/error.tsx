"use client";

// Route-level error boundary. The pages read the catalog at request time
// (force-dynamic); if the engine is unreachable or the key is wrong, the render
// throws and lands here instead of Next's raw 500. Uses only semantic theme
// tokens so it reskins with the rest of the shop. The layout chrome (header,
// cart) stays mounted around this.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Shop temporarily unavailable
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        We couldn&apos;t load the shop right now. Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
