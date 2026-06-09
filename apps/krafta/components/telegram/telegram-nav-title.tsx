"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * TelegramNavTitle — the shop name (+ logo) as a native-style nav-bar title,
 * centered in Telegram's controls row (between Закрыть and ⋯). Hidden at the
 * top of the page; fades in once the hero header scrolls out of view (the iOS
 * large-title-collapse pattern), so the name never shows twice at once.
 *
 * Positioned with the split insets from TelegramFrame: top = the status-bar
 * height (--tg-safe-area-device), height = the controls strip
 * (--tg-content-safe-top). Both resolve to 0 on the web, so this collapses to a
 * zero-height invisible bar off-Telegram. Reveal is driven by an
 * IntersectionObserver on #tma-title-sentinel (placed right after the hero
 * header in the storefront layout).
 */
export function TelegramNavTitle({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl?: string | null;
}) {
  const [revealed, setRevealed] = React.useState(false);

  React.useEffect(() => {
    const sentinel = document.getElementById("tma-title-sentinel");
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      // Reveal only when the sentinel has scrolled ABOVE the viewport (header
      // passed), not when it's still below the fold.
      ([entry]) =>
        setRevealed(
          !entry.isIntersecting && entry.boundingClientRect.top < 0,
        ),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        // Centered between Telegram's leading/trailing controls; px keeps the
        // title clear of them, truncating long names.
        "pointer-events-none fixed inset-x-0 z-40 flex items-center justify-center gap-1.5 px-28",
        "transition-opacity duration-200 ease-out",
        revealed ? "opacity-100" : "opacity-0",
      )}
      style={{
        // Flush with the device inset top. To nudge the title up/down to line
        // up with Telegram's controls, wrap in calc(... + Npx) here.
        top: "var(--tg-safe-area-device, 0px)",
        height: "var(--tg-content-safe-top, 0px)",
      }}
    >
      {logoUrl ? (
        <span className="relative size-5 shrink-0 overflow-hidden rounded-full border border-border/60">
          <Image
            src={logoUrl}
            alt=""
            fill
            sizes="20px"
            className="object-cover"
          />
        </span>
      ) : null}
      <span className="truncate text-[15px] font-medium leading-none text-foreground">
        {name}
      </span>
    </div>
  );
}
