import { Suspense } from "react"
import Link from "next/link"

import { LanguageLinks, LanguageSwitcher } from "@/components/language-switcher"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { getLastSync } from "@/lib/search"

/** Wordmark and language switch, the same on every page. */
export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={`/${locale}`} aria-label={t.header.home} className="text-[15px] font-medium tracking-tight">
          tasnif<span className="text-muted-foreground">.krafta.uz</span>
        </Link>
        <Suspense fallback={<LanguageLinks current={locale} label={t.header.language} />}>
          <LanguageSwitcher current={locale} label={t.header.language} />
        </Suspense>
      </div>
    </header>
  )
}

/** The disclaimer every page carries: unofficial, check before the receipt, where the data comes from. */
export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-4 py-6 text-xs text-muted-foreground sm:px-6">
        <p>{t.footer.unofficial}</p>
        <p>{t.footer.check}</p>
        <p>
          {t.footer.source}:{" "}
          <a href="https://tasnif.soliq.uz" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            tasnif.soliq.uz
          </a>
          <Suspense fallback={null}>
            <SyncedAt locale={locale} t={t} />
          </Suspense>
        </p>
      </div>
    </footer>
  )
}

async function SyncedAt({ locale, t }: { locale: Locale; t: Dictionary }) {
  const finishedAt = await getLastSync().catch(() => null)
  if (!finishedAt) return null
  const date = new Intl.DateTimeFormat(locale === "uz" ? "uz-Latn" : locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Tashkent",
  }).format(new Date(finishedAt))
  return <> · {format(t.footer.synced, { date })}</>
}
