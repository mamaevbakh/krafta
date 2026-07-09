"use client";

/**
 * context.tsx — client-side dashboard locale context.
 *
 * The dashboard layout resolves the locale once on the server (from the
 * cookie) and hands it to this provider. Client components read it via
 * `useT()` for a locale-bound translate fn, or `useDashboardLocale()` for the
 * raw code (e.g. to pass to Intl formatters).
 *
 * Server components don't use this — they call `getDashboardT()` from
 * ./server directly. Both paths resolve through the same createTranslator, so
 * a key renders identically regardless of where it's called.
 */

import * as React from "react";

import { createTranslator, type TranslateFn } from "./messages";
import { DEFAULT_DASHBOARD_LOCALE, type DashboardLocale } from "./locale";

type DashboardLocaleValue = {
  locale: DashboardLocale;
  t: TranslateFn;
};

const DashboardLocaleContext =
  React.createContext<DashboardLocaleValue | null>(null);

export function DashboardLocaleProvider({
  locale,
  children,
}: {
  locale: DashboardLocale;
  children: React.ReactNode;
}) {
  const value = React.useMemo<DashboardLocaleValue>(
    () => ({ locale, t: createTranslator(locale) }),
    [locale],
  );
  return (
    <DashboardLocaleContext.Provider value={value}>
      {children}
    </DashboardLocaleContext.Provider>
  );
}

/**
 * useT — locale-bound translate function for client components.
 *
 * Falls back to the default locale (not a throw) when used outside the
 * provider so isolated renders (tests, storybook-style previews) degrade to a
 * sensible language instead of crashing.
 */
export function useT(): TranslateFn {
  const ctx = React.useContext(DashboardLocaleContext);
  if (!ctx) return createTranslator(DEFAULT_DASHBOARD_LOCALE);
  return ctx.t;
}

/** useDashboardLocale — the active locale code for Intl formatters etc. */
export function useDashboardLocale(): DashboardLocale {
  const ctx = React.useContext(DashboardLocaleContext);
  return ctx?.locale ?? DEFAULT_DASHBOARD_LOCALE;
}
