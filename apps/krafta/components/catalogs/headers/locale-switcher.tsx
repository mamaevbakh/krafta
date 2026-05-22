"use client";

/**
 * locale-switcher.tsx — customer-facing language picker.
 *
 * Reads the enabled locales surfaced by getCatalogLocales(), shows them
 * in a Combobox, and on change rewrites the current URL with a new
 * `?lang=` param via next/navigation's router.replace. The page root
 * re-resolves activeLocale from searchParams on the next render, so
 * the storefront re-renders against the chosen locale.
 *
 * Renders nothing when the catalog has 0 or 1 enabled locales — a
 * single-locale catalog has nothing to switch to, and showing the
 * picker would just be noise.
 *
 * The combobox label uses `display_name` (merchant-curated on
 * catalog_locales — e.g. "Русский", "O‘zbekcha") with the raw locale
 * code as a faint hint, so the merchant's chosen label drives the UI
 * while the code is still visible for debugging / accessibility.
 *
 * Why router.replace, not router.push: the locale param is view state,
 * not navigation history. Back-button should still go to the previous
 * page, not the previous locale of the current page.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Languages } from "lucide-react";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import type { PublicCatalogLocaleOption } from "@/lib/catalogs/data";
import { cn } from "@/lib/utils";

type LocaleSwitcherProps = {
  /** Enabled locale rows in sort order. Length 0–1 → component renders
   *  nothing (single-locale catalogs have no switching to do). */
  options: PublicCatalogLocaleOption[];
  /** Effective active locale from the page root. Empty string when the
   *  catalog has no enabled locales — Combobox treats it as no
   *  selection and shows the placeholder. */
  activeLocale: string;
  /** Visual sizing. Headers want a compact trigger that doesn't compete
   *  with the catalog title; the dialog can use the same component at
   *  default size if needed later. */
  className?: string;
};

export function LocaleSwitcher({
  options,
  activeLocale,
  className,
}: LocaleSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const comboboxOptions = React.useMemo<ComboboxOption[]>(
    () =>
      options.map((option) => ({
        value: option.locale,
        // display_name is the merchant's chosen label; fall back to the
        // locale code so we never render an empty row. The code goes in
        // `hint` so the trigger stays compact while the dropdown shows
        // the full identifier for clarity.
        label: option.display_name && option.display_name.trim().length > 0
          ? option.display_name
          : option.locale,
        hint: option.locale,
      })),
    [options],
  );

  const handleChange = React.useCallback(
    (nextLocale: string) => {
      if (!nextLocale || nextLocale === activeLocale) return;
      // Clone existing params so we preserve mode / table / preview etc.
      // — the switcher only touches `lang`. Use URLSearchParams over
      // string templating so values containing `&` or `=` stay safe.
      const params = new URLSearchParams(searchParams.toString());
      params.set("lang", nextLocale);
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, {
        scroll: false,
      });
    },
    [activeLocale, pathname, router, searchParams],
  );

  if (options.length < 2) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-muted-foreground",
        className,
      )}
    >
      <Languages aria-hidden className="size-4 shrink-0" />
      <Combobox
        value={activeLocale || null}
        onChange={handleChange}
        options={comboboxOptions}
        placeholder="Language"
        searchPlaceholder="Search language…"
        emptyMessage="No matching language."
        aria-label="Select language"
        // Compact trigger — language code typically fits in ~10ch, but
        // give it a little breathing room for "Русский" / "O‘zbekcha"
        // labels. Headers position this in a corner so we cap the
        // visual width.
        className="h-8 w-auto min-w-[7.5rem] gap-2 px-3 text-xs"
        contentClassName="min-w-[12rem]"
      />
    </div>
  );
}
