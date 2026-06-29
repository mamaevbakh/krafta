import { createCommerceClient } from "@krafta/commerce";

/**
 * The single commerce client for this shop. Every catalog read, cart op, and
 * checkout flows through here — Krafta's engine keeps pricing server-authoritative,
 * so the shop renders commerce and restyles 100% but never recomputes money.
 *
 * Configured from two PUBLIC env values (read-only + scoped to this one shop):
 *   NEXT_PUBLIC_KRAFTA_API_URL          — the Krafta engine base URL
 *   NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY  — krc_pub_… (binds this shop's catalog)
 */
export const commerce = createCommerceClient({
  apiUrl: process.env.NEXT_PUBLIC_KRAFTA_API_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY ?? "",
});
