import { cn } from "@/lib/utils";

/**
 * TelegramSafeAreaBlur — a fixed frosted strip pinned to the very top of the
 * viewport, covering the Telegram safe-area (status bar + floating
 * back/close/more controls). Without it, content scrolling up renders SHARP
 * behind those controls and collides with them; this blurs + tints that strip
 * so the controls always sit on a clean surface, like a native nav bar under
 * the status bar.
 *
 * Height is driven by `--tg-safe-top` (set by TelegramFrame from the Telegram
 * insets), which is 0 on the public web — so this collapses to nothing and is
 * invisible off-Telegram. It's a uniform blur (not progressive): the strip is
 * narrow and always behind the opaque-ish nav surface, so a simple frosted bar
 * reads clean and seamless where it meets the category nav.
 *
 * pointer-events-none so Telegram's native controls still receive taps.
 */
export function TelegramSafeAreaBlur({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        // Match the category-nav surface (bg-background/92 + 8px blur) so the
        // strip and the nav read as one continuous bar where they meet.
        "pointer-events-none fixed inset-x-0 top-0 z-40 bg-background/92 backdrop-blur",
        className,
      )}
      style={{ height: "var(--tg-safe-top, 0px)" }}
    />
  );
}
