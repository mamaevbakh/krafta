"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal focus management for the cart drawer + item sheet. While `active`:
 *  - moves focus into the panel on open (first focusable, else the panel),
 *  - traps Tab / Shift+Tab so it cycles within the panel instead of escaping
 *    behind the scrim,
 *  - restores focus to whatever was focused before (the trigger) on close.
 *
 * Attach the returned ref to the panel root and give it `tabIndex={-1}` so the
 * panel itself is a focus fallback. Keeps keyboard + screen-reader users inside
 * the dialog — `aria-modal` alone is advisory and does not stop Tab.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus in. Done synchronously in the effect (the panel is committed
    // by now) rather than via requestAnimationFrame — rAF is throttled to never
    // when the tab isn't painting (backgrounded / headless), which would leave
    // focus stranded outside the dialog.
    const first = focusables()[0];
    (first ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === first || activeEl === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger if it's still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
