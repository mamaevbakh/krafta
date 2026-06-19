/**
 * QR-source attribution cookie name.
 *
 * Set by the `/q/[code]` route handler (cookie value = the QR's shortcode,
 * 15-minute TTL, httpOnly, sameSite=lax). Read by `lib/cart/orders.ts`
 * when creating a draft order so we can stamp
 * `commerce.orders.source = 'qr_scan'` on scan-driven orders.
 *
 * Shared module so the cart pipeline isn't reaching into a route-handler
 * file for a constant.
 */
export const QR_SOURCE_COOKIE = "krafta.qr.src";

/** 15-minute attribution window. Long enough for a hungry customer to
 *  browse + commit, short enough that yesterday's scan doesn't attribute
 *  tomorrow's order. */
export const QR_SOURCE_COOKIE_MAX_AGE_SECONDS = 60 * 15;
