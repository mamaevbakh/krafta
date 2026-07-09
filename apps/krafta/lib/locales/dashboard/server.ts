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
  resolveDashboardLocale,
  type DashboardLocale,
} from "./locale";
import { createTranslator, type TranslateFn } from "./messages";

export const getDashboardLocale = cache(
  async (): Promise<DashboardLocale> => {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    return resolveDashboardLocale({
      cookie: cookieStore.get(DASHBOARD_LOCALE_COOKIE)?.value,
      acceptLanguage: headerStore.get("accept-language"),
    });
  },
);

/** Locale-bound `t()` for server components. */
export async function getDashboardT(): Promise<TranslateFn> {
  return createTranslator(await getDashboardLocale());
}
