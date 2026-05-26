"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders a numeric value with a brief scale + color flash whenever the
 * value changes — Linear's "the cart just settled" affordance.
 *
 * Pattern: `key={value}` forces React to remount the inner span on every
 * change, restarting the `cart-qty-pulse` CSS animation defined in
 * globals.css. Hiding the animation behind a remount keeps the React
 * surface trivial — no useEffect, no timer cleanup, no flicker if the
 * value rapid-fires (each remount cancels the prior animation cleanly).
 *
 * The animation is intentionally subtle (~280ms, scale to 1.18, brief
 * primary-color tint) — present enough that the customer notices their
 * tap registered, quiet enough not to feel jittery during rapid +/-.
 *
 * Renders nothing observable until first mount, but uses the inline-block
 * + tabular-nums combo so it behaves identically to a stock <span> in
 * line layouts (no width jitter when digits change).
 */
export function AnimatedQty({
  value,
  className,
  ...rest
}: {
  value: number;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      key={value}
      aria-live="polite"
      className={cn(
        "inline-block tabular-nums animate-cart-qty-pulse",
        className,
      )}
      {...rest}
    >
      {value}
    </span>
  );
}
