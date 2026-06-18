"use client";

/**
 * lang-switcher.tsx — landing-page language picker (RU / UZ / EN).
 *
 * Mirrors the storefront LocaleSwitcher: a single globe icon button that opens
 * a radio dropdown and rewrites the current URL's `?lang=` param via
 * router.replace. The page root re-resolves the active locale from searchParams
 * on the next render, so the whole landing re-renders against the chosen copy.
 *
 * router.replace (not push) keeps the locale out of history — switching language
 * is view state, not navigation.
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
import { cn } from "@/lib/utils";
import {
  LANDING_LOCALES,
  LANDING_LOCALE_LABELS,
  type LandingLocale,
} from "./content";

type LangSwitcherProps = {
  activeLocale: LandingLocale;
  className?: string;
};

export function LangSwitcher({ activeLocale, className }: LangSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = React.useCallback(
    (next: string) => {
      if (!next || next === activeLocale) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("lang", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [activeLocale, pathname, router, searchParams],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Change language"
          // Match ModeToggle tonality so the language + theme icon buttons
          // read as siblings in the same cluster (the storefront pattern).
          className={cn(
            "rounded-full bg-muted text-foreground hover:bg-muted/80",
            className,
          )}
        >
          <Globe className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup value={activeLocale} onValueChange={handleChange}>
          {LANDING_LOCALES.map((locale) => (
            <DropdownMenuRadioItem
              key={locale}
              value={locale}
              className="text-sm"
            >
              <span className="flex-1 truncate">
                {LANDING_LOCALE_LABELS[locale]}
              </span>
              <span className="ml-3 text-xs uppercase tracking-wide text-muted-foreground">
                {locale}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
