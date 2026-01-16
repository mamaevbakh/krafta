"use client";

type TriggerHaptic = (duration?: number) => void;

let trigger: TriggerHaptic | null = null;
let didInit = false;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
    false;
}

async function ensureLoaded() {
  if (didInit) return;
  didInit = true;

  if (prefersReducedMotion()) return;

  try {
    const mod = await import("tactus");
    trigger = mod.triggerHaptic;
  } catch {
    // ignore
  }
}

export async function hapticTap(duration = 40) {
  await ensureLoaded();
  trigger?.(duration);
}

export async function hapticSuccess() {
  await hapticTap(70);
}

export async function hapticError() {
  await hapticTap(90);
}
