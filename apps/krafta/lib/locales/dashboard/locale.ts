/**
 * dashboard/locale.ts — server-safe dashboard UI-locale resolution.
 *
 * Counterpart to the storefront's per-catalog locale (storefront-locale.ts).
 * The dashboard is merchant-facing, so its language is a *per-merchant*
 * preference, not a per-catalog setting: it follows a cookie the merchant
 * sets from the navbar switcher, falling back to their browser's
 * Accept-Language, then to Russian (Krafta's primary market).
 *
 * Pure functions only — no "use client", no next/headers. The request-time
 * plumbing (reading the cookie / header) lives in server.ts so RSC pages can
 * import this resolver without dragging server-only APIs into shared code.
 */

/** BCP-47 codes the dashboard chrome ships translations for. `uz-Latn`
 *  (Latin-script Uzbek) is the modern default script; Cyrillic Uzbek is a
 *  storefront-only concern for now. */
export type DashboardLocale = "ru" | "uz-Latn" | "en";

/** Cookie the navbar switcher writes and the layout reads. Distinct from any
 *  storefront `?lang=` param — the dashboard locale is device/merchant scoped,
 *  not catalog scoped. */
export const DASHBOARD_LOCALE_COOKIE = "krafta_dash_locale";

/** Display order for the switcher — market-first (RU, UZ) then EN. */
export const DASHBOARD_LOCALES: readonly DashboardLocale[] = [
  "ru",
  "uz-Latn",
  "en",
] as const;

/** Fallback when neither a cookie nor a matchable Accept-Language is present.
 *  Russian is the lingua franca of the Tashkent market Krafta serves. */
export const DEFAULT_DASHBOARD_LOCALE: DashboardLocale = "ru";

/**
 * Native display names for the switcher. Each language names itself in its
 * own script — the universal pattern for language pickers.
 */
export const DASHBOARD_LOCALE_NAMES: Record<DashboardLocale, string> = {
  ru: "Русский",
  "uz-Latn": "Oʻzbekcha",
  en: "English",
};

/**
 * Normalize an arbitrary locale string to a supported DashboardLocale, or
 * null if it maps to none. Case-insensitive; matches on the primary subtag so
 * `uz`, `uz-UZ`, `uz-Cyrl` all resolve to `uz-Latn` (we only ship Latin), and
 * `ru-RU` → `ru`, `en-US` → `en`.
 */
export function normalizeDashboardLocale(
  raw: string | null | undefined,
): DashboardLocale | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  const primary = lower.split(/[-_]/)[0];
  if (primary === "ru") return "ru";
  if (primary === "uz") return "uz-Latn";
  if (primary === "en") return "en";
  return null;
}

/**
 * Parse an Accept-Language header and return the first supported locale,
 * honoring q-weights. Returns null when nothing matches.
 */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
): DashboardLocale | null {
  if (!header) return null;
  const parsed = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of parsed) {
    const match = normalizeDashboardLocale(tag);
    if (match) return match;
  }
  return null;
}

/**
 * resolveDashboardLocale — decides which language the dashboard renders in.
 *
 * Resolution order:
 *   1. cookie (explicit choice from the switcher on THIS device)
 *   2. preference (the user's stored cross-device choice — user_metadata)
 *   3. Accept-Language (best-guess from the browser, for point-0 localization)
 *   4. DEFAULT_DASHBOARD_LOCALE (Russian)
 *
 * cookie sits above preference because they're kept in sync on every switch
 * (the switcher writes both), so for a user's own devices they always agree —
 * and honoring the cookie first keeps the fast path from having to hit auth.
 * The preference is what makes a brand-new device correct from the first
 * render even before any cookie exists.
 */
export function resolveDashboardLocale({
  cookie,
  preference,
  acceptLanguage,
}: {
  cookie?: string | null;
  preference?: string | null;
  acceptLanguage?: string | null;
}): DashboardLocale {
  return (
    normalizeDashboardLocale(cookie) ??
    normalizeDashboardLocale(preference) ??
    localeFromAcceptLanguage(acceptLanguage) ??
    DEFAULT_DASHBOARD_LOCALE
  );
}
