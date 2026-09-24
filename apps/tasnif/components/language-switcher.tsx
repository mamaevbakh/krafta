"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { buttonVariants } from "@/components/ui/button"
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, LOCALE_SHORT, isLocale, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function languageLinkClass(active: boolean) {
  return cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "font-mono text-xs tabular-nums",
    active ? "bg-muted text-foreground" : "text-muted-foreground",
  )
}

/**
 * RU · UZ · EN. Switching keeps the visitor where they are: the same code page,
 * the same page of a category, or the same search (?q=), so a merchant who
 * searched in Russian can hand the same results to an Uzbek-speaking colleague.
 * Remembers the choice for the next visit.
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const segments = usePathname().split("/")
  // "/ru/code/1020…" → "/code/1020…"; the search page is "".
  const path = isLocale(segments[1]) ? segments.slice(2).filter(Boolean).map((s) => `/${s}`).join("") : ""
  const params = useSearchParams()
  const kept = new URLSearchParams()
  for (const key of ["q", "page"]) {
    const value = params.get(key)
    if (value) kept.set(key, value)
  }
  return <LanguageLinks current={current} label={label} path={path} query={kept.toString()} />
}

/** Same links from what the server knows, for the first paint before the address bar is readable. */
export function LanguageLinks({
  current,
  label,
  path = "",
  query = "",
}: {
  current: Locale
  label: string
  path?: string
  /** Already encoded, without the "?". */
  query?: string
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-0.5">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}${path}${query ? `?${query}` : ""}`}
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
