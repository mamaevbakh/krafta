"use server";

/**
 * Server action for the navbar language switcher: persist the merchant's
 * dashboard-UI locale to a cookie. The switcher calls this then
 * router.refresh() so the next server render re-resolves against the new
 * cookie (see getDashboardLocale in ./server).
 */

import { cookies } from "next/headers";

import {
  DASHBOARD_LOCALE_COOKIE,
  normalizeDashboardLocale,
  type DashboardLocale,
} from "./locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setDashboardLocale(locale: DashboardLocale) {
  const normalized = normalizeDashboardLocale(locale);
  if (!normalized) return;
  const cookieStore = await cookies();
  cookieStore.set(DASHBOARD_LOCALE_COOKIE, normalized, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: false,
  });
}
