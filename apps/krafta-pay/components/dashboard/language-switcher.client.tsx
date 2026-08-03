"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setPayLocaleAction } from "@/lib/locales/actions";
import { PAY_LOCALES, PAY_LOCALE_NAMES, type PayLocale } from "@/lib/locales/locale";
import { useT } from "@/lib/locales/context";

/**
 * Language switcher for the sidebar footer.
 *
 * Same construction as the org switcher above it: a styled box with a real
 * `<select>` laid invisibly on top, so it stays keyboard-navigable and uses the
 * native picker on mobile while keeping the surrounding chrome.
 */
export function LanguageSwitcher({ locale }: { locale: PayLocale }) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <div className="pointer-events-none flex items-center gap-2 rounded-md px-1 py-1.5 text-xs text-muted-foreground">
        <Globe className="size-3.5 shrink-0" aria-hidden />
        <span className={pending ? "opacity-50" : undefined}>{PAY_LOCALE_NAMES[locale]}</span>
      </div>
      <select
        aria-label={t("nav.language")}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => {
            void setPayLocaleAction(next);
          });
        }}
        className="absolute inset-0 size-full cursor-pointer text-base opacity-0"
      >
        {PAY_LOCALES.map((value) => (
          <option key={value} value={value}>
            {PAY_LOCALE_NAMES[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
