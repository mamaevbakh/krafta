import "server-only";
import { PostHog } from "posthog-node";

/**
 * Server-side PostHog client for capturing events that happen without a browser
 * — Server Actions, Route Handlers, webhooks (e.g. `order_placed`,
 * `subscription_charged`).
 *
 * On serverless this is NOT a long-lived singleton: create one per operation,
 * capture, then `await client.shutdown()` so the event flushes before the
 * function suspends/returns. flushAt/flushInterval force an immediate send
 * instead of buffering.
 *
 *   const posthog = getPostHogServer();
 *   if (posthog) {
 *     posthog.capture({
 *       distinctId: userId,          // same id used for client identify()
 *       event: "order_placed",
 *       properties: { orderId, totalCents, currency },
 *     });
 *     await posthog.shutdown();
 *   }
 *
 * Returns null when unconfigured (no key) so callers no-op cleanly.
 */
export function getPostHogServer(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!key) return null;

  return new PostHog(key, {
    // Server events bypass the browser proxy, so hit the real ingest host.
    // Flip eu→us here if the project lives in the US region.
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
