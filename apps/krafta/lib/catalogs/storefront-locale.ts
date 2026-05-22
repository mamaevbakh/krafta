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
  /** The catalog's enabled locale codes, from getCatalogLocales(). The
   *  requested locale must be in this set to be honored. */
  enabled: string[];
  /** The catalog's default locale, from getCatalogLocales(). Used as
   *  fallback when the request is missing or invalid. May be null when
   *  the catalog has no enabled locales — the function returns null too. */
  default: string | null;
};

/**
 * resolveStorefrontLocale — decides which locale the storefront renders in.
 *
 * Returns the effective locale string, or null if no enabled locale exists
 * (catalog misconfiguration — render with canonical values, no fallback).
 *
 * Resolution order:
 *   1. requested (when a string in `enabled`)
 *   2. default
 *   3. null
 *
 * Locale matching is exact-string. Callers normalize upstream if needed
 * (e.g. uppercase → lowercase) — silent normalization here would mask
 * merchant misconfiguration.
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
  if (params.default && enabledSet.has(params.default)) return params.default;
  return params.default ?? null;
}
