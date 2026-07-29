"use client";

/**
 * item-photo-viewer.tsx — Telegram-inspired fullscreen photo viewer.
 *
 * Opened by tapping any photo in the item detail carousel. The design
 * follows Telegram's media viewer, adapted to Krafta's minimal chrome:
 *
 *   • Opaque black canvas, photo centered with object-contain.
 *   • Top bar: "2 / 5" counter (font-mono tabular-nums per DESIGN.md
 *     numerals rule) left, close button right, over a functional
 *     legibility scrim. Respects the Telegram Mini App safe-area.
 *   • Horizontal swipe (embla) between photos, starting at the photo
 *     the customer tapped. Desktop gets hover arrows + arrow keys.
 *   • Swipe DOWN to dismiss — the photo follows the finger and the
 *     backdrop fades, Telegram's signature gesture. Releasing past the
 *     threshold closes; otherwise it springs back.
 *   • Escape closes. Inside Telegram, the native Back button closes
 *     the viewer first (pushBackHandler is a LIFO stack, so the item
 *     detail's Back handler resumes after).
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

export type ItemPhotoViewerProps = {
  images: ItemGalleryImage[];
  initialIndex: number;
  fallbackAlt: string;
  onClose: () => void;
  activeLocale: string;
  defaultLocale: string | null;
};

export function ItemPhotoViewer({
  images,
  initialIndex,
  fallbackAlt,
  onClose,
  activeLocale,
  defaultLocale,
}: ItemPhotoViewerProps) {
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  const [api, setApi] = React.useState<CarouselApi>();
  const [selected, setSelected] = React.useState(initialIndex);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  // Inside Telegram, the hardware-style Back closes the viewer (stacked
  // above the item detail's own Back handler).
  useTelegramBackButton(true, onClose);

  React.useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  // Keyboard: Escape closes, arrows navigate. Window-level because the
  // viewer isn't a focus-trapping dialog primitive.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowLeft") {
        api?.scrollPrev();
      } else if (event.key === "ArrowRight") {
        api?.scrollNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [api, onClose]);

  React.useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  // ── Swipe-down to dismiss ────────────────────────────────────────────
  // Touch-only. The gesture engages once movement is clearly vertical-
  // downward (embla owns horizontal); the photo strip then follows the
  // finger and the backdrop fades. No preventDefault needed: the body
  // is scroll-locked under the item modal, so vertical touchmove has no
  // native effect to suppress.
  const [dragY, setDragY] = React.useState(0);
  const [snapBack, setSnapBack] = React.useState(false);
  const gesture = React.useRef<{
    startX: number;
    startY: number;
    tracking: boolean;
    engaged: boolean;
  } | null>(null);

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) {
      gesture.current = null;
      return;
    }
    gesture.current = {
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      tracking: true,
      engaged: false,
    };
    setSnapBack(false);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const g = gesture.current;
    if (!g?.tracking) return;
    const dx = event.touches[0].clientX - g.startX;
    const dy = event.touches[0].clientY - g.startY;

    if (!g.engaged) {
      // Horizontal intent → embla's swipe; stop tracking entirely.
      if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
        g.tracking = false;
        return;
      }
      if (dy > 10 && Math.abs(dy) > Math.abs(dx) * VERTICAL_INTENT_RATIO) {
        g.engaged = true;
      } else {
        return;
      }
    }

    setDragY(Math.max(0, dy));
  };

  const handleTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.engaged) return;
    if (dragY > DISMISS_THRESHOLD_PX) {
      onClose();
      return;
    }
    setSnapBack(true);
    setDragY(0);
  };

  const backdropOpacity = 1 - Math.min(dragY / 400, 0.5);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
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
        className="absolute inset-0 bg-black"
        style={{ opacity: backdropOpacity }}
        aria-hidden
      />

      {/* Photo strip — follows the finger during swipe-down. */}
      <div
        className="relative flex h-full w-full flex-col"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: snapBack ? "transform 200ms ease-out" : undefined,
        }}
      >
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

      {/* Desktop arrows — hidden on touch; swipe is the touch affordance. */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => api?.scrollPrev()}
            aria-label={t("gallery.prev_photo")}
            className={cn(
              "absolute left-4 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full",
              "text-white transition-colors hover:bg-white/10 md:flex",
              selected === 0 && "pointer-events-none opacity-0",
            )}
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => api?.scrollNext()}
            aria-label={t("gallery.next_photo")}
            className={cn(
              "absolute right-4 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full",
              "text-white transition-colors hover:bg-white/10 md:flex",
              selected === images.length - 1 && "pointer-events-none opacity-0",
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
