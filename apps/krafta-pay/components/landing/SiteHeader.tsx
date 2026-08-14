"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { EDITION, HEADER_MENU } from "./editions";
import { useScrollSpy } from "./ScrollSpy";

export function SiteHeader() {
  const { surface, progress } = useScrollSpy();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const onCream = surface === "cream";
  const fg = onCream ? "text-ink" : "text-cream";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${fg}`}
    >
      <nav className="mx-auto flex h-[3.75rem] max-w-[105rem] items-center gap-4 px-5 sm:px-8">
        {/* The wordmark is the whole logo — no mark beside it — so it also has
            to hold the corner on its own at 390px, where it shares the row with
            both buttons. Hence the smaller mobile step. */}
        <a href="#top" className="flex shrink-0 items-center">
          {/* text-current beats the component's own black/white, so the wordmark
              inverts with the rest of the header over cream sections. */}
          <BrandWordmark
            text={EDITION.name}
            className="text-base text-current sm:text-xl dark:text-current"
          />
        </a>

        <div className="relative ml-auto" ref={menuRef}>
          <Button
            variant="outline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            {EDITION.menu}
            <ChevronDown
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </Button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+0.5rem)] w-60 overflow-hidden rounded-xl border border-cream/15 bg-canvas/95 p-1.5 text-cream shadow-2xl backdrop-blur-md"
            >
              {HEADER_MENU.map((entry) => (
                <a
                  key={entry.label}
                  href={entry.href}
                  role="menuitem"
                  className="flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-cream/10"
                >
                  <span>{entry.label}</span>
                  <span className="font-serif text-xs text-stone-2 italic">
                    {entry.hint}
                  </span>
                </a>
              ))}
              <div className="mt-1.5 border-t border-cream/10 px-3 py-2">
                <a
                  href="https://www.krafta.uz"
                  className="text-sm text-stone-2 link-underline"
                >
                  Krafta
                </a>
              </div>
            </div>
          )}
        </div>

        {/* /dashboard rather than the login URL directly: the dashboard layout
            already bounces a signed-out visitor to Krafta SSO with the right
            return address, and a signed-in one lands where they wanted.

            A plain <a>, not <Link>, on purpose. Most visitors here are signed
            out, so /dashboard answers with a cross-origin redirect to Krafta
            SSO — which <Link> cannot follow. Its viewport prefetch just logs a
            CORS failure on every landing view before the click falls back to a
            document navigation anyway. */}
        <Button
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          render={<a href="/dashboard" />}
        >
          Get started
        </Button>
      </nav>

      <div
        className={`h-px origin-left transition-colors duration-300 ${
          onCream ? "bg-ink/40" : "bg-cream/40"
        }`}
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden="true"
      />
    </header>
  );
}
