import "server-only";

/**
 * server.ts — request-time dashboard locale for RSC/server components.
 *
 * Reads the merchant's locale cookie (falling back to Accept-Language, then
 * Russian) and hands back either the raw locale or a bound `t()`. Isolated in
 * a "server-only" module so the next/headers dependency never leaks into
 * shared code or the client bundle.
 *
 * Cached per request via React.cache so repeated calls across a render tree
 * (layout + nested pages) don't re-read headers.
 */

import { cache } from "react";
import { cookies, headers } from "next/headers";

import {
  DASHBOARD_LOCALE_COOKIE,
  normalizeDashboardLocale,
  resolveDashboardLocale,
  type DashboardLocale,
} from "./locale";
import { getUserPreferredLocale } from "@/lib/locales/user-locale";
import { createTranslator, type TranslateFn } from "./messages";

export const getDashboardLocale = cache(
  async (): Promise<DashboardLocale> => {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(DASHBOARD_LOCALE_COOKIE)?.value;

    // Fast path: a switcher choice on this device. Set on every switch, so
    // returning visitors skip the auth lookup below entirely.
    const fromCookie = normalizeDashboardLocale(cookieValue);
    if (fromCookie) return fromCookie;

    // No cookie (fresh device / first visit) — consult the user's stored
    // cross-device preference, then fall back to the browser's Accept-Language
    // so the very first render is already in a sensible language.
    const [preference, headerStore] = await Promise.all([
      getUserPreferredLocale(),
      headers(),
    ]);
    return resolveDashboardLocale({
      preference,
      acceptLanguage: headerStore.get("accept-language"),
    });
  },
);

/** Locale-bound `t()` for server components. */
export async function getDashboardT(): Promise<TranslateFn> {
  return createTranslator(await getDashboardLocale());
}
