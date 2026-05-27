"use client";

/**
 * locale-switcher.tsx — customer-facing language picker.
 *
 * A single secondary-tone globe icon button. Tap → dropdown of enabled
 * locales as radio items (current locale shown as the selected radio).
 * On change, rewrites the current URL with a new `?lang=` param via
 * router.replace; the page root re-resolves activeLocale from
 * searchParams on the next render so the storefront re-renders against
 * the chosen locale.
 *
 * Visual: matches the rest of the storefront's secondary chrome (cart
 * trigger in the dock uses the same `variant="secondary" size="icon"`
 * pattern). The Globe is recognizable as a language affordance across
 * locales — no text needed, no separate "current locale" label leaking
 * into the header. The current selection lives inside the dropdown as a
 * radio dot; the trigger stays icon-only.
 *
 * Renders nothing when the catalog has 0 or 1 enabled locales —
 * single-locale catalogs have nothing to switch to.
 *
 * Why router.replace, not router.push: the locale param is view state,
 * not navigation history. Back-button should still go to the previous
 * page, not the previous locale of the current page.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PublicCatalogLocaleOption } from "@/lib/catalogs/data";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

type LocaleSwitcherProps = {
  /** Enabled locale rows in sort order. Length 0–1 → component renders
   *  nothing (single-locale catalogs have no switching to do). */
  options: PublicCatalogLocaleOption[];
  /** Effective active locale from the page root. Drives which radio
   *  item shows as selected inside the dropdown. */
  activeLocale: string;
  /** Optional class override on the trigger button — for header layouts
   *  that need a different margin / colour. */
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
  // Storefront locale provider wraps the page root, so this hook
  // resolves to the same activeLocale the prop carries — we pull
  // `defaultLocale` from it so the aria label can fall back correctly
  // when activeLocale is empty (catalog with no enabled locales — which
  // also short-circuits the render below, but the resolver is
  // defensive).
  const { defaultLocale } = useStorefrontLocale();

  const handleChange = React.useCallback(
    (nextLocale: string) => {
      if (!nextLocale || nextLocale === activeLocale) return;
      // Clone existing params so we preserve mode / table / preview etc.
      // — the switcher only touches `lang`. URLSearchParams handles
      // values containing `&` or `=` safely.
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

  const ariaLabel = getStorefrontMessage("language.select_aria", {
    activeLocale,
    defaultLocale,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            // Match cart-trigger tonality: bg-muted secondary surface so
            // both icon buttons read as siblings in the same visual
            // family. Rounded-full keeps the affordance consistent with
            // the dock's pill chrome.
            "rounded-full bg-muted text-foreground hover:bg-muted/80",
            className,
          )}
        >
          <Globe className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        // min-w wide enough for "O‘zbekcha" + the locale-code hint
        // without forcing the longest row to wrap. shadcn defaults
        // would be too narrow once the locale code lands on the right.
        className="min-w-[11rem]"
      >
        <DropdownMenuRadioGroup
          // value can be the empty string when activeLocale is unset;
          // radio-group treats an empty value as "no selection" which
          // matches the catalog-with-no-locales fallback. We use
          // `undefined` to coerce to that no-selection state cleanly.
          value={activeLocale || undefined}
          onValueChange={handleChange}
        >
          {options.map((option) => {
            const label =
              option.display_name && option.display_name.trim().length > 0
                ? option.display_name
                : option.locale;
            return (
              <DropdownMenuRadioItem
                key={option.locale}
                value={option.locale}
                // Body text reads as the merchant-chosen display name
                // (e.g. "Русский"); the locale code goes to the right
                // as a faint hint so screen readers + power users can
                // still see the canonical identifier. Same dual-row
                // pattern the old Combobox used.
                className="text-sm"
              >
                <span className="flex-1 truncate">{label}</span>
                <span className="ml-3 text-xs uppercase tracking-wide text-muted-foreground">
                  {option.locale}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
