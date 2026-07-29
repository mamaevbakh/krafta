import "server-only";

/**
 * user-locale.ts — the signed-in user's explicit UI-language preference.
 *
 * Stored on the auth user's `user_metadata.preferred_locale` (there is no
 * separate profiles table; the app already keeps per-user fields like
 * full_name / avatar_url here). This is the durable, cross-device signal: a
 * merchant on an English phone who picks Russian gets Russian everywhere,
 * on every device, until they change it.
 *
 * The stored value is a raw BCP-47 string (e.g. "ru", "uz-Latn"). Each surface
 * interprets it against what it can actually offer — the dashboard normalizes
 * to ru/uz-Latn/en; the storefront checks it against the catalog's enabled
 * locales — so an unavailable preference falls through to the next signal
 * instead of showing a half-translated UI.
 *
 * Reads are cached per request. Both read and write are defensive: anonymous
 * or logged-out visitors, or any auth hiccup, yield null / no-op rather than
 * throwing — locale resolution must never break a page render.
 */

import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@krafta/supabase/auth";

export const PREFERRED_LOCALE_META_KEY = "preferred_locale";

/**
 * Read the current session user's stored language preference, or null when
 * there's no user or no preference set. Request-cached so the dashboard layout
 * and any nested server component share one lookup.
 */
export const getUserPreferredLocale = cache(
  async (): Promise<string | null> => {
    try {
      // Cheap guard: no Supabase auth cookie → no user → no preference. This
      // keeps the hot customer-storefront path (first-time, session-less
      // visitors) from paying an auth round-trip on every render; those
      // visitors resolve their locale from Accept-Language instead.
      const cookieStore = await cookies();
      const hasSession = cookieStore
        .getAll()
        .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
      if (!hasSession) return null;

      const supabase = await createClient();
      const { user } = await getUserSafely(supabase);
      const raw = (
        user?.user_metadata as { preferred_locale?: unknown } | undefined
      )?.preferred_locale;
      return typeof raw === "string" && raw.trim().length > 0
        ? raw.trim()
        : null;
    } catch {
      return null;
    }
  },
);

/**
 * Persist a language preference onto the current user's metadata. No-op for
 * anonymous/logged-out visitors (nothing to attach it to) and swallows errors
 * so a failed write never breaks the switch — the cookie / ?lang still applies
 * for the current session.
 */
export async function writeUserPreferredLocale(locale: string): Promise<void> {
  const value = locale.trim();
  if (!value) return;
  try {
    const supabase = await createClient();
    const { user } = await getUserSafely(supabase);
    if (!user) return;
    await supabase.auth.updateUser({
      data: { [PREFERRED_LOCALE_META_KEY]: value },
    });
  } catch {
    // Best-effort: preference is a convenience, not a correctness requirement.
  }
}
