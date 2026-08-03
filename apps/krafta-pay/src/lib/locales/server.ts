import "server-only";

/**
 * server.ts — request-time locale for RSC / server components.
 *
 * Cookie first (an explicit switcher choice on this device beats everything),
 * then Accept-Language so a merchant's very first render is already in a
 * sensible language rather than English-by-default.
 *
 * Cached per request so a layout and its nested pages don't each re-read
 * headers. "server-only" keeps next/headers out of the client bundle.
 */

import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  PAY_LOCALE_COOKIE,
  normalizePayLocale,
  resolvePayLocale,
  type PayLocale,
} from "./locale";
import { createTranslator, type TranslateFn } from "./messages";

export const getPayLocale = cache(async (): Promise<PayLocale> => {
  const cookieStore = await cookies();
  const fromCookie = normalizePayLocale(cookieStore.get(PAY_LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;

  const headerStore = await headers();
  return resolvePayLocale({ acceptLanguage: headerStore.get("accept-language") });
});

/** Locale-bound `t()` for server components. */
export async function getPayT(): Promise<TranslateFn> {
  return createTranslator(await getPayLocale());
}
