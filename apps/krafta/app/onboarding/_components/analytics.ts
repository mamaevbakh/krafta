// KRA-42 wizard PR3 — onboarding funnel instrumentation.
//
// One thin wrapper over Vercel Analytics' track() (mounted app-wide in
// app/layout.tsx). At 11+ screens the funnel can only be tuned if every
// step-enter and the key conversions are measured — this is the data the
// "more screens" bet rests on. track() is a no-op when analytics isn't
// initialised (dev, or when the visitor opted out), so callers never guard.

import { track } from "@vercel/analytics";

export function trackWizard(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  try {
    track(`onboarding_${event}`, props ?? {});
  } catch {
    // Analytics must never break the wizard.
  }
}
