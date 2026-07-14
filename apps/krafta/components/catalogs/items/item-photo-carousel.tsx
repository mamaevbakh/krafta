"use client";

/**
 * item-photo-carousel.tsx — the image band of the item detail view,
 * multi-photo edition.
 *
 * Replaces the single <Image> band in item-detail-fullscreen-view with
 * an embla carousel over the item's full gallery (main photo first —
 * ordering happens in lib/catalogs/data.ts). Design contract carries
 * over from the single-photo band verbatim:
 *
 *   • Every slide is the catalog's configured aspect ratio, clamped to
 *     35–55dvh (no postage stamps, price stays above the fold).
 *   • object-contain — the detail view always shows the WHOLE photo;
 *     bg-muted letterbox bars fill the gap.
 *   • Chrome is the always-dark glass convention (bg-black/50 white
 *     icons) the detail view already uses for Share/Close.
 *
 * Multi-photo chrome (only when images.length > 1):
 *   • Dot indicators bottom-center in a translucent dark pill so they
 *     survive light letterbox bars. Tappable.
 *   • Desktop hover arrows (hidden on touch) — customers with a mouse
 *     shouldn't have to drag.
 *
 * Every slide is a button that opens the fullscreen viewer at that
 * photo (Telegram-style full view — see item-photo-viewer.tsx). Embla
 * suppresses the click when the pointer actually dragged, so swiping
 * never accidentally opens the viewer.
 */

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

export type ItemPhotoCarouselProps = {
  /** Resolved gallery, main photo first. Must be non-empty. */
  images: ItemGalleryImage[];
  /** Alt fallback when a photo has no per-photo alt (localized name). */
  fallbackAlt: string;
  /** Catalog's configured card ratio — every slide renders this shape. */
  aspectRatio: number;
  onOpenViewer: (index: number) => void;
  /** Exposes the embla api so the parent can sync the carousel to the
   *  photo the fullscreen viewer was on when it closed. */
  onApi?: (api: CarouselApi) => void;
  activeLocale: string;
  defaultLocale: string | null;
};

/** Above this many photos the dot strip would overflow a 375px
 *  viewport (each dot carries a ~22px hit area) — show a counter pill
 *  instead, like Telegram does for long albums. */
const MAX_DOTS = 8;

/** Shared slide sizing — the 35–55dvh clamp from the single-photo band. */
const slideStyle = (ratio: number): React.CSSProperties => ({
  aspectRatio: ratio,
  minHeight: "35dvh",
  maxHeight: "55dvh",
});

export function ItemPhotoCarousel({
  images,
  fallbackAlt,
  aspectRatio,
  onOpenViewer,
  onApi,
  activeLocale,
  defaultLocale,
}: ItemPhotoCarouselProps) {
  const t = (
    key: Parameters<typeof getStorefrontMessage>[0],
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  const [api, setApi] = React.useState<CarouselApi>();
  const selected = useCarouselSelectedIndex(api);

  React.useEffect(() => {
    if (api) onApi?.(api);
  }, [api, onApi]);

  // Single photo — no carousel machinery, just the tappable band.
  if (images.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onOpenViewer(0)}
        aria-label={t("gallery.open_photo")}
        className="relative block w-full cursor-zoom-in overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        style={slideStyle(aspectRatio)}
      >
        <Image
          src={images[0].url}
          alt={images[0].alt ?? fallbackAlt}
          fill
          sizes="(max-width: 640px) 100vw, 480px"
          className="h-full w-full object-contain"
          priority
        />
      </button>
    );
  }

  return (
    <Carousel setApi={setApi} className="w-full bg-muted">
      <CarouselContent className="ml-0">
        {images.map((image, index) => (
          <CarouselItem key={`${image.url}-${index}`} className="pl-0">
            <button
              type="button"
              onClick={() => onOpenViewer(index)}
              aria-label={t("gallery.open_photo")}
              className="relative block w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              style={slideStyle(aspectRatio)}
            >
              <Image
                src={image.url}
                alt={image.alt ?? fallbackAlt}
                fill
                sizes="(max-width: 640px) 100vw, 480px"
                className="h-full w-full object-contain"
                priority={index === 0}
              />
            </button>
          </CarouselItem>
        ))}
      </CarouselContent>

      {/* Desktop arrows — glass chrome, inside the band. Touch users
          swipe. `disabled` (not opacity-only hiding) at the ends so the
          invisible button also leaves the tab order. */}
      <button
        type="button"
        onClick={() => api?.scrollPrev()}
        disabled={selected === 0}
        aria-label={t("gallery.prev_photo")}
        className={cn(
          "absolute left-2 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full",
          "border border-white/15 bg-black/50 text-white shadow-md backdrop-blur-md transition-opacity hover:bg-black/65",
          "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          "disabled:pointer-events-none disabled:opacity-0",
          "md:flex",
        )}
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => api?.scrollNext()}
        disabled={selected === images.length - 1}
        aria-label={t("gallery.next_photo")}
        className={cn(
          "absolute right-2 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full",
          "border border-white/15 bg-black/50 text-white shadow-md backdrop-blur-md transition-opacity hover:bg-black/65",
          "outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          "disabled:pointer-events-none disabled:opacity-0",
          "md:flex",
        )}
      >
        <ChevronRight className="size-5" />
      </button>

      {/* Dot indicators — dark pill so they read over light letterbox
          bars. The visual dot stays 6px; the padded button around it
          gives each dot a ~22px hit area so adjacent-dot mistaps on
          375px phones stay rare. Past MAX_DOTS the strip would overflow
          the viewport, so a mono counter takes its place. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center">
        {images.length <= MAX_DOTS ? (
          <div className="pointer-events-auto flex items-center rounded-full bg-black/35 px-1 backdrop-blur-sm">
            {images.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => api?.scrollTo(index)}
                aria-label={t("gallery.go_to_photo", { index: index + 1 })}
                aria-current={index === selected}
                className="group/dot flex items-center justify-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-colors duration-150",
                    index === selected
                      ? "bg-white"
                      : "bg-white/40 group-hover/dot:bg-white/60",
                  )}
                />
              </button>
            ))}
          </div>
        ) : (
          <span className="rounded-full bg-black/35 px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-white/90 backdrop-blur-sm">
            {selected + 1} / {images.length}
          </span>
        )}
      </div>
    </Carousel>
  );
}
