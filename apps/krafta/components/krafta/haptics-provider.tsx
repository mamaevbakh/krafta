"use client";

import { useEffect, useRef } from "react";

type TriggerHaptic = (duration?: number) => void;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
    false;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  const el = target.closest(
    "button, a[href], [role='button'], input[type='button'], input[type='submit'], summary",
  );
  if (!el) return false;

  if (el.getAttribute("aria-disabled") === "true") return false;

  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el instanceof HTMLInputElement && el.disabled) return false;

  return true;
}

export function HapticsProvider() {
  const triggerRef = useRef<TriggerHaptic | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (prefersReducedMotion()) return;

    void import("tactus")
      .then((mod) => {
        if (cancelled) return;
        triggerRef.current = mod.triggerHaptic;
      })
      .catch(() => {
        // noop: tactus may fail to load in some environments
      });

    const onClick = (event: MouseEvent) => {
      if (!isInteractiveTarget(event.target)) return;
      triggerRef.current?.(40);
    };

    document.addEventListener("click", onClick, { capture: true });

    return () => {
      cancelled = true;
      document.removeEventListener("click", onClick, { capture: true } as any);
    };
  }, []);

  return null;
}
