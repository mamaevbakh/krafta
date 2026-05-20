"use client";

/**
 * locale-context.tsx — active locale state for the Library Canvas (KRA-35 PR3 / P2).
 *
 * Holds:
 *   - activeLocale: the locale tab the merchant is currently editing in
 *   - defaultLocale: the catalog's default (from catalog_locales row with
 *     is_default=true) — passed through for routeLocaleWrite dispatch
 *
 * Read by:
 *   - LocaleTabStrip — renders TabsTrigger per enabled locale, sets active
 *     via context
 *   - EditableItemCard save callbacks (via CategorySection) — dispatch
 *     through updateItemField with the active locale
 *   - Inspector (future) — picks the right translation row to display
 *
 * Defaults to the catalog's default locale on first render. If the catalog
 * has zero locales (legacy data — shouldn't happen for new catalogs), we
 * fall back to "ru" since Krafta's primary target market is Tashkent.
 */

import * as React from "react";

type CanvasLocaleValue = {
  activeLocale: string;
  defaultLocale: string;
  setActiveLocale: (next: string) => void;
};

const CanvasLocaleContext = React.createContext<CanvasLocaleValue | null>(null);

export function useCanvasLocale(): CanvasLocaleValue {
  const ctx = React.useContext(CanvasLocaleContext);
  if (!ctx) {
    throw new Error(
      "useCanvasLocale must be used inside <CanvasLocaleProvider>",
    );
  }
  return ctx;
}

export type LocaleOption = {
  id: string;
  locale: string;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
};

export function CanvasLocaleProvider({
  locales,
  children,
}: {
  locales: LocaleOption[];
  children: React.ReactNode;
}) {
  // Pick the default locale once on mount. Memoized so re-renders don't
  // re-search the array on every read.
  const defaultLocale = React.useMemo(() => {
    const def = locales.find((l) => l.is_default);
    return def?.locale ?? locales[0]?.locale ?? "ru";
  }, [locales]);

  const [activeLocale, setActiveLocale] = React.useState<string>(defaultLocale);

  // If the catalog's default locale changes (extremely rare; only if the
  // merchant flips it via Settings while the canvas is open), reset active
  // to the new default. This avoids the merchant accidentally writing to
  // a stale-default item_translations row.
  React.useEffect(() => {
    setActiveLocale((current) => {
      const stillValid = locales.find((l) => l.locale === current);
      return stillValid ? current : defaultLocale;
    });
  }, [defaultLocale, locales]);

  const value = React.useMemo(
    () => ({ activeLocale, defaultLocale, setActiveLocale }),
    [activeLocale, defaultLocale],
  );

  return (
    <CanvasLocaleContext.Provider value={value}>
      {children}
    </CanvasLocaleContext.Provider>
  );
}
