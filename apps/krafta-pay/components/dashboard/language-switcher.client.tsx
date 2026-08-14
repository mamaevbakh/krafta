"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setPayLocaleAction } from "@/lib/locales/actions";
import { useT } from "@/lib/locales/context";
import { PAY_LOCALES, PAY_LOCALE_NAMES, type PayLocale } from "@/lib/locales/locale";

/**
 * Language, as a real menu.
 *
 * Was a bare <select> laid invisibly over some text, which read as a label
 * rather than a control and used the platform picker instead of the app's own.
 * Now the same dropdown shape as the organisation switcher and the chart
 * range, so everything that opens a list looks like it opens a list.
 */
export function LanguageSwitcher({ locale }: { locale: PayLocale }) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between gap-2"
            disabled={pending}
            aria-label={t("nav.language")}
          >
            <span className="flex items-center gap-2">
              <Globe className="size-3.5 shrink-0 opacity-60" aria-hidden />
              {PAY_LOCALE_NAMES[locale]}
            </span>
            <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        {PAY_LOCALES.map((value) => (
          <DropdownMenuItem
            key={value}
            onClick={() =>
              startTransition(() => {
                void setPayLocaleAction(value);
              })
            }
            className="justify-between gap-2"
          >
            {PAY_LOCALE_NAMES[value]}
            {value === locale ? <Check className="size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
