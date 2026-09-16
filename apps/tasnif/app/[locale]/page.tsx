import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { LanguageLinks, LanguageSwitcher } from "@/components/language-switcher"
import { SearchExperience, SearchFallback } from "@/components/search/search-experience"
import { dictionary, format, isLocale, type Dictionary, type Locale } from "@/lib/i18n"
import { getLastSync } from "@/lib/search"

export default async function SearchPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)

  return (
    <div className="flex min-h-dvh flex-col">
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
        <h1 className="text-[32px] leading-tight font-medium tracking-tight text-balance">{t.search.title}</h1>
        <p className="mt-3 max-w-2xl text-base text-pretty text-muted-foreground">{t.search.lead}</p>
        <Suspense fallback={<SearchFallback t={t} />}>
          <SearchExperience locale={locale} t={t} />
        </Suspense>
      </main>

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
    </div>
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
