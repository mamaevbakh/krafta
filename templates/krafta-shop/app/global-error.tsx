"use client";

import "./globals.css";

// Backstop boundary for errors thrown by the root layout itself (it replaces
// the layout, so it renders its own <html>/<body> and re-imports the theme).
// The layout already try/catches the catalog read, so this is rarely hit — but
// it keeps any layout-level throw from surfacing Next's unstyled 500.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
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
      </body>
    </html>
  );
}
