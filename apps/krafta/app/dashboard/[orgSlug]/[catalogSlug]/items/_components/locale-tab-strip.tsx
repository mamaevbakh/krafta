"use client";

/**
 * locale-tab-strip.tsx — RU/UZ/EN tab strip above the Library Canvas (KRA-35 PR3 / P2).
 *
 * Renders one TabsTrigger per enabled catalog_locales row. Active tab
 * drives the CanvasLocaleProvider's activeLocale, which descendants
 * (EditableItemCard saves + Inspector reads) consume via useCanvasLocale.
 *
 * Visual: shadcn Tabs (TabsList + TabsTrigger). The locale code (uppercase)
 * is the label — "RU", "UZ", "EN". Compact, scannable. PR 4 / future
 * polish can add the locale's display name as a tooltip.
 *
 * Hidden when the catalog has only one enabled locale (no point showing a
 * single-tab strip).
 */

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe } from "lucide-react";

import { useCanvasLocale, type LocaleOption } from "./locale-context";

export function LocaleTabStrip({ locales }: { locales: LocaleOption[] }) {
  const { activeLocale, setActiveLocale } = useCanvasLocale();

  const enabled = React.useMemo(
    () =>
      locales
        .filter((l) => l.is_enabled)
        .sort((a, b) => a.sort_order - b.sort_order),
    [locales],
  );

  // Single-locale catalogs don't need a tab strip. Hide entirely so the
  // merchant doesn't see a one-tab control that does nothing.
  if (enabled.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 px-1">
      <Globe
        className="size-4 text-muted-foreground"
        aria-hidden
      />
      <Tabs
        value={activeLocale}
        onValueChange={setActiveLocale}
        className="w-auto"
      >
        <TabsList>
          {enabled.map((locale) => (
            <TabsTrigger
              key={locale.id}
              value={locale.locale}
              className="uppercase"
            >
              {locale.locale}
              {locale.is_default && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  default
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
