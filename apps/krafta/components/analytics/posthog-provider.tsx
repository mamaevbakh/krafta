"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

import { createClient } from "@/lib/supabase/client";

// The instance itself is initialized in instrumentation-client.ts before
// hydration; this provider only shares that singleton via React context (so
// descendants can use usePostHog() / feature-flag hooks) and syncs the
// analytics identity to the Supabase auth session.
const posthogEnabled = Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN);

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!posthogEnabled) return;

    const supabase = createClient();

    // onAuthStateChange emits INITIAL_SESSION on subscribe, so this covers the
    // first-load identity AND every later sign-in/out without a separate
    // getUser() round-trip.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Fresh anonymous id so the next account on a shared device isn't
        // merged into the previous merchant's person.
        posthog.reset();
        return;
      }

      // Tie events to the logged-in merchant. Skip anonymous sessions (guest
      // storefront carts/orders use is_anonymous) — those stay anonymous.
      const user = session?.user;
      if (user && !user.is_anonymous) {
        posthog.identify(
          user.id,
          user.email ? { email: user.email } : undefined,
        );
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!posthogEnabled) return <>{children}</>;

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
