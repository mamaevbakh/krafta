import { Suspense } from "react"
import { notFound } from "next/navigation"

import { SearchExperience, SearchFallback } from "@/components/search/search-experience"
import { dictionary, isLocale } from "@/lib/i18n"

export default async function SearchPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
      <h1 className="text-[32px] leading-tight font-medium tracking-tight text-balance">{t.search.title}</h1>
      <p className="mt-3 max-w-2xl text-base text-pretty text-muted-foreground">{t.search.lead}</p>
      <Suspense fallback={<SearchFallback t={t} />}>
        <SearchExperience locale={locale} t={t} />
      </Suspense>
    </main>
  )
}
