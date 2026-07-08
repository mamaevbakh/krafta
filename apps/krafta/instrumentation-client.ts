// Client-side PostHog bootstrap. Next.js auto-loads `instrumentation-client.ts`
// on the browser BEFORE the app hydrates, which is the earliest safe point to
// initialize analytics — no provider round-trip, no missed first pageview.
//
// Ingestion is sent to the first-party reverse proxy at `/ingest` (see the
// rewrites in next.config.ts) so ad-blockers that block `*.posthog.com` don't
// silently drop events. `ui_host` still points at the real PostHog app so the
// in-page toolbar and "view in PostHog" links resolve.
//
// Region note: everything here assumes the EU cloud. If the PostHog project is
// created in the US region instead, flip `eu`→`us` in THREE places: `ui_host`
// below, the two proxy destinations in next.config.ts, and
// NEXT_PUBLIC_POSTHOG_HOST in the environment.
import posthog from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// No key (e.g. local dev before the key is set, or a preview without it) → skip
// init entirely. posthog-js turns every subsequent `capture`/`identify` into a
// safe no-op, so callers never need to null-check.
if (posthogKey) {
  posthog.init(posthogKey, {
    // First-party proxy path, resolved against the current origin — works
    // across every host the app serves (www.krafta.uz, dev.krafta.org, LAN IP).
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    // Modern posthog-js defaults preset (autocapture, sensible masking, etc.).
    defaults: "2025-05-24",
    // Only materialize person profiles for users we explicitly identify
    // (logged-in merchants). Anonymous storefront shoppers stay anonymous —
    // cheaper, and no PII by accident.
    person_profiles: "identified_only",
    // App Router does client-side navigations, not full reloads. `history_change`
    // hooks the History API so every route change fires a $pageview WITHOUT
    // needing useSearchParams() (which would force a Suspense boundary under
    // cacheComponents). Captures the initial load too.
    capture_pageview: "history_change",
    capture_pageleave: true,
  });
}
