import type { createClient } from "@/lib/supabase/client";

type BrowserClient = ReturnType<typeof createClient>;

/**
 * Threads the current user's JWT onto the Supabase Realtime connection so
 * `postgres_changes` events get RLS-evaluated against the merchant's identity
 * rather than `anon`. Must be called BEFORE `.subscribe()` — otherwise events
 * for tables without an anon SELECT policy silently never arrive (the
 * channel reports SUBSCRIBED but RLS filters everything out).
 *
 * Why this isn't automatic: `createBrowserClient` (@supabase/ssr) wires the
 * Realtime token after the WebSocket has already connected, so the first
 * subscribe races the auth handshake. Calling `setAuth` explicitly before
 * subscribing makes the timing deterministic.
 *
 * Failures are non-fatal: subscribing without a token will surface
 * `CHANNEL_ERROR` if the policy actually bites — more useful than crashing
 * the page on a transient `getSession` hiccup.
 *
 * Usage:
 *
 *   const supabase = createClient();
 *   await pinRealtimeAuth(supabase);
 *   const channel = supabase.channel(...).on(...).subscribe();
 */
export async function pinRealtimeAuth(supabase: BrowserClient): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (token) {
      await supabase.realtime.setAuth(token);
    }
  } catch {
    // Non-fatal — see header comment.
  }
}
