"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ProgressiveBlurProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Edge the blur band sits against. Defaults to "bottom" — the iOS
   *  home-indicator-style fade where scrolled content gradually blurs
   *  as it approaches a sticky bottom dock. */
  position?: "top" | "bottom";
  /** Total band height. Larger = more vertical room for the fade. */
  height?: string;
  /** CSS `blur(...)` value applied via backdrop-filter. Higher numbers
   *  blur heavier; 4-8px is the sweet spot for the iOS look. */
  blurAmount?: string;
  /** Override the background color the gradient fades into. Defaults to
   *  the theme's `--background` token (light or dark, locale-aware
   *  inversion via packages/theme). Pass a hex/oklch when the dock
   *  sits over a custom-color surface. */
  backgroundColor?: string;
};

/**
 * Progressive backdrop blur — a vertical fade where content scrolled
 * underneath gradually blurs as it approaches the dock at the chosen
 * edge. Pure CSS via a stacked gradient + mask + backdrop-filter
 * combo; no JS, no animation frames, no scroll listeners.
 *
 * Pattern adapted from Skiper UI 41 (devouringdetails.com inspired) +
 * iOS / Apple Music. Wires straight into the theme by defaulting to
 * `var(--background)` so light + dark stay coherent without two
 * separate instances.
 *
 * Use under floating bottom docks, sticky top headers, or modal sheets
 * where the customer's eye should be drawn to the chrome and the
 * underlying scroll should recede.
 */
export function ProgressiveBlur({
  className,
  position = "bottom",
  height = "40px",
  blurAmount = "1px",
  backgroundColor,
  style,
  ...rest
}: ProgressiveBlurProps) {
  const isTop = position === "top";
  // Default to the theme token so light/dark just work. Callers that
  // really need a fixed color pass it explicitly.
  const bg = backgroundColor ?? "var(--background)";

  // The composition has two layers in one element:
  //   - background: a linear-gradient that fades the theme bg into
  //     transparent, giving the "color drift" look near the edge
  //   - backdrop-filter: blur(N) applied across the whole element
  //   - mask-image: another linear-gradient that fades the blur layer's
  //     OPACITY from full at the edge to zero ~50% across the band, so
  //     the blur intensity reads as progressive even though it's a
  //     single uniform blur value under the hood
  const maskGradient = isTop
    ? "linear-gradient(to bottom, black 50%, transparent)"
    : "linear-gradient(to top, black 50%, transparent)";

  const bgGradient = isTop
    ? `linear-gradient(to top, transparent, ${bg})`
    : `linear-gradient(to bottom, transparent, ${bg})`;

  return (
    <div
      aria-hidden
      className={cn(
        // `fixed` (not `absolute`) so the band stays glued to the
        // viewport edge while the page scrolls. With `absolute` the
        // blur anchors to the nearest positioned ancestor (the body
        // in storefront usage), which means it moves with the
        // scrolled content instead of with the chrome it's supposed
        // to be reinforcing.
        "pointer-events-none fixed left-0 right-0 select-none",
        className,
      )}
      style={{
        [isTop ? "top" : "bottom"]: 0,
        height,
        background: bgGradient,
        maskImage: maskGradient,
        WebkitMaskImage: maskGradient,
        backdropFilter: `blur(${blurAmount})`,
        WebkitBackdropFilter: `blur(${blurAmount})`,
        WebkitUserSelect: "none",
        userSelect: "none",
        ...style,
      }}
      {...rest}
    />
  );
}
