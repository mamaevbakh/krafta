/**
 * storefront-locale.ts — server-safe locale resolution.
 *
 * Pure function only. Lives in a non-"use client" module so RSC page
 * roots can import it. The companion React context + provider live in
 * storefront-locale-context.tsx — keep those two split to avoid pulling
 * the React runtime into the server bundle.
 *
 * See storefront-locale-context.tsx for the StorefrontLocaleProvider /
 * useStorefrontLocale that client components consume.
 */

export type ResolveStorefrontLocaleParams = {
  /** Raw ?lang= value from the URL. May be undefined, an array (Next.js
   *  searchParams type), or an empty string. The function normalizes all
   *  of those to "no request" and falls back to the default. */
  requested: string | string[] | undefined | null;
  /** The catalog's enabled locale codes, from getCatalogLocales(). Any
   *  candidate must be in this set to be honored — this is the built-in
   *  "prefers ru but this shop doesn't offer ru" fallback. */
  enabled: string[];
  /** The catalog's default locale, from getCatalogLocales(). Final fallback
   *  when nothing else matches. May be null when the catalog has no enabled
   *  locales — the function returns null too. */
  default: string | null;
  /** The signed-in customer's stored language preference
   *  (user_metadata.preferred_locale), if any. Honored when it's an enabled
   *  locale — so a customer who prefers ru sees ru on every shop that offers
   *  it, regardless of device language. */
  preference?: string | null;
  /** The request's Accept-Language header, for point-0 localization: a
   *  first-time visitor with no explicit choice or stored preference still
   *  opens the shop in their device language when the shop offers it. */
  acceptLanguage?: string | null;
};

/**
 * resolveStorefrontLocale — decides which locale the storefront renders in.
 *
 * Returns the effective locale string, or null if no enabled locale exists
 * (catalog misconfiguration — render with canonical values, no fallback).
 *
 * Resolution order (each candidate must be an *enabled* locale to win):
 *   1. requested   — explicit ?lang= (the switcher / a shared link)
 *   2. preference  — the customer's stored cross-device choice
 *   3. Accept-Language — the browser's language, best-matched to an enabled
 *      locale (exact tag, else primary-subtag: "ru-RU"→"ru", "uz"→"uz-Latn")
 *   4. default     — the merchant's configured catalog default
 *   5. null
 *
 * Exact-string matching for requested/preference/default (callers normalize
 * upstream if needed); Accept-Language gets primary-subtag matching since
 * browsers send region/script-tagged values the catalog rarely stores verbatim.
 */
export function resolveStorefrontLocale(
  params: ResolveStorefrontLocaleParams,
): string | null {
  const enabledSet = new Set(params.enabled);
  const requested =
    typeof params.requested === "string" && params.requested.length > 0
      ? params.requested
      : null;

  if (requested && enabledSet.has(requested)) return requested;

  const preference =
    typeof params.preference === "string" && params.preference.length > 0
      ? params.preference
      : null;
  if (preference && enabledSet.has(preference)) return preference;

  const fromAcceptLanguage = matchAcceptLanguage(
    params.acceptLanguage,
    params.enabled,
  );
  if (fromAcceptLanguage) return fromAcceptLanguage;

  if (params.default && enabledSet.has(params.default)) return params.default;
  return params.default ?? null;
}

/**
 * Pick the best enabled locale for an Accept-Language header. Honors q-weights;
 * tries an exact tag match first, then a primary-subtag match (so "en-US"
 * matches enabled "en", and "uz" matches enabled "uz-Latn"). Returns null when
 * nothing lines up. Preserves `enabled` order for the primary-subtag fallback,
 * so if a shop enables both uz-Latn and uz-Cyrl, the merchant's ordering breaks
 * the "uz" tie.
 */
function matchAcceptLanguage(
  header: string | null | undefined,
  enabled: string[],
): string | null {
  if (!header || enabled.length === 0) return null;
  const enabledSet = new Set(enabled);

  const tags = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (enabledSet.has(tag)) return tag;
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    const match = enabled.find(
      (locale) => locale.toLowerCase().split(/[-_]/)[0] === primary,
    );
    if (match) return match;
  }
  return null;
}
