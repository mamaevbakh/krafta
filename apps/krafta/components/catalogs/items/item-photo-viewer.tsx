"use client";

/**
 * item-photo-viewer.tsx — Telegram-inspired fullscreen photo viewer.
 *
 * Opened by tapping any photo in the item detail carousel. The design
 * follows Telegram's media viewer, adapted to Krafta's minimal chrome:
 *
 *   • Opaque black canvas, photo centered with object-contain.
 *   • Top bar: "2 / 3" counter (font-mono tabular-nums per DESIGN.md
 *     numerals rule) left, close button right, over a functional
 *     legibility scrim. Respects the Telegram Mini App safe-area.
 *   • Horizontal swipe (embla) between photos, starting at the photo
 *     the customer tapped. Desktop gets arrows + arrow keys.
 *   • Swipe DOWN to dismiss — the photo follows the finger and the
 *     backdrop fades, Telegram's signature gesture. Releasing past the
 *     threshold closes; otherwise it springs back. The drag is applied
 *     IMPERATIVELY (style writes on refs, no per-touchmove setState) so
 *     low-end Android phones don't re-render N full-viewport images at
 *     touch-event rate.
 *   • Escape closes; Tab cycles inside the viewer (lightweight focus
 *     trap — the content behind the opaque backdrop is unreachable).
 *     Inside Telegram, the native Back button closes the viewer first
 *     (pushBackHandler is a LIFO stack, so the item detail's Back
 *     handler resumes after).
 *
 * Rendered through a portal to <body> so the fixed overlay can't be
 * trapped by the item modal's scroll/stacking context. z-[60] sits
 * above the item detail overlay (z-50).
 */

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarouselSelectedIndex,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import type { ItemGalleryImage } from "@/lib/catalogs/media";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { useTelegramBackButton } from "@/components/telegram/telegram-back-button";

/** Drag distance (px) past which releasing the swipe-down closes. */
const DISMISS_THRESHOLD_PX = 90;
/** Vertical intent gate: dy must beat dx by this factor to engage. */
const VERTICAL_INTENT_RATIO = 1.2;
/** Movement (px) below which a touch is still an undecided tap. */
const INTENT_SLOP_PX = 10;
/** Drag distance over which the backdrop fades toward its floor. */
const BACKDROP_FADE_DISTANCE_PX = 400;
/** The backdrop never fades below this opacity mid-drag. */
const BACKDROP_MIN_OPACITY = 0.5;

export type ItemPhotoViewerProps = {
  images: ItemGalleryImage[];
  initialIndex: number;
  fallbackAlt: string;
  onClose: () => void;
  /** Reports the photo the customer is currently viewing — lets the
   *  parent sync the inline carousel to it on close (Telegram returns
   *  you to the photo you were viewing). */
  onSelectedChange?: (index: number) => void;
  activeLocale: string;
  defaultLocale: string | null;
};

export function ItemPhotoViewer({
  images,
  initialIndex,
  fallbackAlt,
  onClose,
  onSelectedChange,
  activeLocale,
  defaultLocale,
}: ItemPhotoViewerProps) {
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  const [api, setApi] = React.useState<CarouselApi>();
  const selected = useCarouselSelectedIndex(api, initialIndex);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const backdropRef = React.useRef<HTMLDivElement | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  // Inside Telegram, the hardware-style Back closes the viewer (stacked
  // above the item detail's own Back handler).
  useTelegramBackButton(true, onClose);

  // Report the current photo to the parent (carousel sync on close).
  // The browser-back-closes-the-viewer-first behavior lives in the
  // PARENT (item-detail-fullscreen-view): the history entry is pushed
  // in the open ACTION, not in a mount effect — a mount-effect push
  // double-fires under React StrictMode and self-closes the viewer.
  React.useEffect(() => {
    onSelectedChange?.(selected);
  }, [selected, onSelectedChange]);

  // Keyboard: Escape closes, arrows navigate, Tab cycles inside the
  // viewer. Window-level because the viewer isn't a Radix dialog; the
  // Tab handling is the focus trap (everything behind the opaque
  // backdrop is visually unreachable, so focus must not walk out).
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Ignore key auto-repeat — a held Escape must close ONCE (the
        // parent's close path consumes a history entry per call).
        if (event.repeat) return;
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowLeft") {
        api?.scrollPrev();
      } else if (event.key === "ArrowRight") {
        api?.scrollNext();
      } else if (event.key === "Tab") {
        const container = containerRef.current;
        if (!container) return;
        const focusable = Array.from(
          container.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
          // display:none buttons (the md-only arrows on phones) must not
          // count — an invisible `last` would let Tab walk out of the
          // viewer. offsetParent is null for display:none elements.
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const inside =
          active instanceof HTMLElement && container.contains(active);
        if (!inside) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [api, onClose]);

  React.useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  // Chrome Android's pull-to-refresh fires on exactly our signature
  // gesture (downward drag at scroll-top). overscroll-behavior on the
  // viewer itself wouldn't help — P2R is governed by the root scroller,
  // so suppress it there while the viewer is open.
  React.useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";
    return () => {
      root.style.overscrollBehaviorY = previous;
    };
  }, []);

  // ── Swipe-down to dismiss ────────────────────────────────────────────
  // Touch-only. The gesture engages once movement is clearly vertical-
  // downward (embla owns horizontal); the photo strip then follows the
  // finger and the backdrop fades. Applied via direct style writes on
  // refs — a setState per touchmove would re-render every full-viewport
  // slide at touch-event rate (60-120Hz), visible jank on the low-end
  // Android phones common in the customer base. No preventDefault
  // needed: the body is scroll-locked under the item modal, so vertical
  // touchmove has no native effect to suppress.
  const gesture = React.useRef<{
    startX: number;
    startY: number;
    tracking: boolean;
    engaged: boolean;
    dragY: number;
  } | null>(null);

  const applyDrag = (dragY: number) => {
    const strip = stripRef.current;
    const backdrop = backdropRef.current;
    if (strip) {
      strip.style.transition = "none";
      strip.style.transform = dragY ? `translateY(${dragY}px)` : "";
    }
    if (backdrop) {
      backdrop.style.transition = "none";
      backdrop.style.opacity = String(
        1 -
          Math.min(dragY / BACKDROP_FADE_DISTANCE_PX, 1 - BACKDROP_MIN_OPACITY),
      );
    }
  };

  const snapBack = () => {
    const strip = stripRef.current;
    const backdrop = backdropRef.current;
    if (strip) {
      strip.style.transition = "transform 200ms ease-out";
      strip.style.transform = "";
    }
    if (backdrop) {
      backdrop.style.transition = "opacity 200ms ease-out";
      backdrop.style.opacity = "1";
    }
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) {
      // A second finger (palm edge, stray tap) aborts the gesture — but
      // an ENGAGED drag must snap back first, or the strip stays frozen
      // half-dismissed with no touch state left to recover it.
      if (gesture.current?.engaged) snapBack();
      gesture.current = null;
      return;
    }
    gesture.current = {
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      tracking: true,
      engaged: false,
      dragY: 0,
    };
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const g = gesture.current;
    if (!g?.tracking) return;
    const dx = event.touches[0].clientX - g.startX;
    const dy = event.touches[0].clientY - g.startY;

    if (!g.engaged) {
      // Horizontal intent → embla's swipe; stop tracking entirely.
      if (Math.abs(dx) > INTENT_SLOP_PX && Math.abs(dx) >= Math.abs(dy)) {
        g.tracking = false;
        return;
      }
      if (
        dy > INTENT_SLOP_PX &&
        Math.abs(dy) > Math.abs(dx) * VERTICAL_INTENT_RATIO
      ) {
        g.engaged = true;
      } else {
        return;
      }
    }

    g.dragY = Math.max(0, dy);
    applyDrag(g.dragY);
  };

  const handleTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.engaged) return;
    if (g.dragY > DISMISS_THRESHOLD_PX) {
      onClose();
      return;
    }
    snapBack();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("gallery.open_photo")}
      className="fixed inset-0 z-[60] flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Backdrop — fades as the swipe-down progresses. */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black"
        aria-hidden
      />

      {/* Photo strip — follows the finger during swipe-down. */}
      <div ref={stripRef} className="relative flex h-full w-full flex-col">
        <Carousel
          setApi={setApi}
          opts={{ startIndex: initialIndex }}
          className="h-full w-full [&>div]:h-full"
        >
          <CarouselContent className="ml-0 h-full">
            {images.map((image, index) => (
              <CarouselItem
                key={`${image.url}-${index}`}
                className="relative h-dvh pl-0"
              >
                <Image
                  src={image.url}
                  alt={image.alt ?? fallbackAlt}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  priority={index === initialIndex}
                  loading={
                    Math.abs(index - initialIndex) <= 1 ? "eager" : undefined
                  }
                />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>

      {/* Top chrome — counter + close over a functional legibility scrim.
          Clears the Telegram status bar via --tg-safe-top. */}
      <div
        className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/60 to-transparent pb-6"
        style={{ paddingTop: "var(--tg-safe-top, 0px)" }}
      >
        <div className="flex items-center justify-between px-3 py-3">
          {images.length > 1 ? (
            <span className="px-2 font-mono text-sm font-medium tabular-nums text-white/90">
              {selected + 1} / {images.length}
            </span>
          ) : (
            <span />
          )}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("gallery.close")}
            className="flex size-10 items-center justify-center rounded-full text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <XIcon className="size-5" />
          </button>
        </div>
      </div>

      {/* Desktop arrows — hidden on touch; swipe is the touch
          affordance. `disabled` at the ends so the invisible button
          also leaves the tab order. */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => api?.scrollPrev()}
            disabled={selected === 0}
            aria-label={t("gallery.prev_photo")}
            className={cn(
              "absolute left-4 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full",
              "text-white outline-none transition-colors hover:bg-white/10",
              "focus-visible:ring-2 focus-visible:ring-white/60",
              "disabled:pointer-events-none disabled:opacity-0",
              "md:flex",
            )}
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => api?.scrollNext()}
            disabled={selected === images.length - 1}
            aria-label={t("gallery.next_photo")}
            className={cn(
              "absolute right-4 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full",
              "text-white outline-none transition-colors hover:bg-white/10",
              "focus-visible:ring-2 focus-visible:ring-white/60",
              "disabled:pointer-events-none disabled:opacity-0",
              "md:flex",
            )}
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
