"use client";

/**
 * storefront-locale.tsx — client-only locale context.
 *
 * Companion to storefront-locale.ts (pure server-safe resolver). This
 * module is "use client" so it can hold the React context. Importing
 * resolveStorefrontLocale from here would pull "use client" into the
 * server bundle — use the bare `./storefront-locale` module on the
 * server side instead.
 *
 * See lib/catalogs/i18n.ts for pickLocalizedField — the read-side
 * helper each component calls with the activeLocale + defaultLocale
 * carried by this provider.
 */

import * as React from "react";

// Re-export the resolver type/fn for the rare client-side caller that
// doesn't want a separate import. The implementation still lives in
// storefront-locale.ts so the server bundle keeps a server-only path.
export type {
  ResolveStorefrontLocaleParams,
} from "./storefront-locale";
export { resolveStorefrontLocale } from "./storefront-locale";

type StorefrontLocaleValue = {
  /** Effective active locale (the one components should render in).
   *  Empty string when the catalog has no enabled locales — guards the
   *  pickLocalizedField call sites, which treat empty strings as the
   *  no-localization case. */
  activeLocale: string;
  /** The catalog's default locale (same source as activeLocale's
   *  fallback). pickLocalizedField uses this to decide whether to
   *  short-circuit to the canonical defaults. */
  defaultLocale: string;
};

const StorefrontLocaleContext =
  React.createContext<StorefrontLocaleValue | null>(null);

export function StorefrontLocaleProvider({
  activeLocale,
  defaultLocale,
  children,
}: StorefrontLocaleValue & { children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ activeLocale, defaultLocale }),
    [activeLocale, defaultLocale],
  );
  return (
    <StorefrontLocaleContext.Provider value={value}>
      {children}
    </StorefrontLocaleContext.Provider>
  );
}

/**
 * useStorefrontLocale — reads the active + default locale.
 *
 * Returns sentinel empty strings when called outside the provider so
 * client components that happen to render in a context that never wraps
 * them (legacy preview paths, tests) degrade gracefully — every name
 * field becomes the canonical default. Throwing here would be too
 * aggressive: a hard error from a deep component is worse than a
 * non-localized render.
 */
export function useStorefrontLocale(): StorefrontLocaleValue {
  const ctx = React.useContext(StorefrontLocaleContext);
  if (!ctx) return { activeLocale: "", defaultLocale: "" };
  return ctx;
}
