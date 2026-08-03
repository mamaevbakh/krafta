"use client";

/**
 * context.tsx — client-side locale context.
 *
 * The layout resolves the locale once on the server and hands it down; client
 * components read `useT()`. Both sides go through the same createTranslator, so
 * a key renders identically whether it is called from a server or client
 * component.
 */

import * as React from "react";
import { createTranslator, type TranslateFn } from "./messages";
import { DEFAULT_PAY_LOCALE, type PayLocale } from "./locale";

type PayLocaleValue = { locale: PayLocale; t: TranslateFn };

const PayLocaleContext = React.createContext<PayLocaleValue | null>(null);

export function PayLocaleProvider({
  locale,
  children,
}: {
  locale: PayLocale;
  children: React.ReactNode;
}) {
  const value = React.useMemo<PayLocaleValue>(
    () => ({ locale, t: createTranslator(locale) }),
    [locale],
  );
  return <PayLocaleContext.Provider value={value}>{children}</PayLocaleContext.Provider>;
}

/**
 * Falls back to the default locale rather than throwing when used outside a
 * provider, so an isolated render (a test, a stray component) degrades to
 * readable Russian instead of crashing.
 */
export function useT(): TranslateFn {
  const ctx = React.useContext(PayLocaleContext);
  if (!ctx) return createTranslator(DEFAULT_PAY_LOCALE);
  return ctx.t;
}

export function usePayLocale(): PayLocale {
  return React.useContext(PayLocaleContext)?.locale ?? DEFAULT_PAY_LOCALE;
}
