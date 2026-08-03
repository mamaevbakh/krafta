"use server";

/**
 * Server action for the navbar language switcher: persist the merchant's
 * dashboard-UI locale. Writes two places:
 *   - a cookie, so THIS device re-renders immediately (getDashboardLocale
 *     reads it on the next server render, after router.refresh()); and
 *   - the user's `user_metadata.preferred_locale`, so the choice follows them
 *     to every other device — a fresh device with no cookie still opens in the
 *     right language from the first render.
 */

import { cookies } from "next/headers";

import {
  DASHBOARD_LOCALE_COOKIE,
  normalizeDashboardLocale,
  type DashboardLocale,
} from "./locale";
import { writeUserPreferredLocale } from "@/lib/locales/user-locale";

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
  // Durable, cross-device signal. Best-effort (no-op for anon users).
  await writeUserPreferredLocale(normalized);
}
