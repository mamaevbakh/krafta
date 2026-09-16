"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { buttonVariants } from "@/components/ui/button"
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, LOCALE_SHORT, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function languageLinkClass(active: boolean) {
  return cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "font-mono text-xs tabular-nums",
    active ? "bg-muted text-foreground" : "text-muted-foreground",
  )
}

/**
 * RU · UZ · EN. Switching keeps the current search (?q=) so a merchant who
 * searched in Russian can hand the same results to an Uzbek-speaking colleague,
 * and remembers the choice for the next visit.
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const q = useSearchParams().get("q")
  return <LanguageLinks current={current} label={label} query={q} />
}

/** Same links without the query, for the first paint before search params are known. */
export function LanguageLinks({
  current,
  label,
  query = null,
}: {
  current: Locale
  label: string
  query?: string | null
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-0.5">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={query ? `/${locale}?q=${encodeURIComponent(query)}` : `/${locale}`}
          hrefLang={locale === "uz" ? "uz-Latn" : locale}
          title={LOCALE_NAMES[locale]}
          aria-current={locale === current ? "true" : undefined}
          onClick={() => {
            document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
          }}
          className={languageLinkClass(locale === current)}
        >
          {LOCALE_SHORT[locale]}
        </Link>
      ))}
    </nav>
  )
}
