"use client";

/**
 * dashboard-language-switcher.tsx — merchant-facing UI language picker.
 *
 * Globe-icon dropdown in the dashboard navbar. On change it persists the
 * choice to the locale cookie (server action) and refreshes so every server
 * component re-renders in the new language. Mirrors the storefront's
 * locale-switcher affordance for consistency.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDashboardLocale,
  useT,
} from "@/lib/locales/dashboard/context";
import {
  DASHBOARD_LOCALES,
  DASHBOARD_LOCALE_NAMES,
  type DashboardLocale,
} from "@/lib/locales/dashboard/locale";
import { setDashboardLocale } from "@/lib/locales/dashboard/actions";
import { cn } from "@/lib/utils";

export function DashboardLanguageSwitcher({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const activeLocale = useDashboardLocale();
  const t = useT();
  const [isPending, startTransition] = React.useTransition();

  const handleChange = React.useCallback(
    (next: string) => {
      if (!next || next === activeLocale) return;
      startTransition(async () => {
        await setDashboardLocale(next as DashboardLocale);
        router.refresh();
      });
    },
    [activeLocale, router],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={isPending}
          aria-label={t("nav.language.select_aria")}
          className={cn("rounded-md", className)}
        >
          <Globe className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuRadioGroup
          value={activeLocale}
          onValueChange={handleChange}
        >
          {DASHBOARD_LOCALES.map((locale) => (
            <DropdownMenuRadioItem
              key={locale}
              value={locale}
              className="text-sm"
            >
              <span className="flex-1 truncate">
                {DASHBOARD_LOCALE_NAMES[locale]}
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
