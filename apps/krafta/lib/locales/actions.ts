"use server";

/**
 * Shared "save my language preference" action for the storefront locale
 * switcher (the dashboard switcher persists via setDashboardLocale instead).
 *
 * Fire-and-forget from the client: it records the customer's choice on their
 * user record so it carries to other shops / devices. No-op for session-less
 * visitors — the ?lang param + the page's Accept-Language resolution cover
 * them for the current visit.
 */

import { writeUserPreferredLocale } from "@/lib/locales/user-locale";

export async function saveUserLocalePreference(locale: string) {
  await writeUserPreferredLocale(locale);
}
