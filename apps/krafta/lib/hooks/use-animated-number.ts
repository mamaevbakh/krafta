"use client";

import * as React from "react";

/**
 * Smoothly tweens between value changes. Used in the localization
 * workbench header so when an AI translation lands and the catalog
 * jumps from 3% → 4% complete, the displayed number animates rather
 * than snapping. Returns the currently-displayed fractional value;
 * callers `Math.round` for integer display.
 *
 * Implementation notes:
 *   - ease-out cubic feels right for "value just arrived" motion
 *     (decelerates into rest, no overshoot)
 *   - 400ms duration matches the "medium / sheet enter" budget in
 *     DESIGN.md §Motion — perceptible but never blocking
 *   - prefers-reduced-motion respected: returns target instantly
 *   - Animations are interruptible: starting a new tween reads the
 *     CURRENT displayed value as the from-anchor, so a value flipping
 *     mid-tween doesn't snap back to the previous from
 *
 * Why not framer-motion: framer ships an entire animation runtime
 * for what's a 20-line rAF loop here. Krafta has no other framer
 * dependency; pulling it in for a counter would be a tax.
 */
export function useAnimatedNumber(target: number, duration = 400): number {
  const [displayed, setDisplayed] = React.useState(target);
  // Track the value the tween is animating *from*. Updated to the
  // current displayed value on every effect cleanup so re-targeting
  // mid-flight reads from the latest visible position.
  const fromRef = React.useRef(target);
  const displayedRef = React.useRef(target);
  displayedRef.current = displayed;

  // Static check + reactive listener for reduced motion. SSR-safe
  // (window guard) so the hook doesn't crash on server render.
  const [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    if (reduceMotion) {
      // Honor the OS-level preference: snap, don't tween.
      setDisplayed(target);
      fromRef.current = target;
      return;
    }
    if (target === displayedRef.current) {
      fromRef.current = target;
      return;
    }

    const from = displayedRef.current;
    const to = target;
    const startedAt = performance.now();
    let frameId: number | null = null;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic — fast start, soft landing.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplayed(next);
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      // Capture wherever the value happens to be when interrupted so
      // the next tween starts from a visually-honest position.
      fromRef.current = displayedRef.current;
    };
  }, [target, duration, reduceMotion]);

  return displayed;
}
