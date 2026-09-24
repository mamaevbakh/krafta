import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { CatalogList, CatalogRow } from "@/components/catalog"
import { CopyCode, DetailsBody } from "@/components/search/result-row"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { dictionary, format, isLocale, type Dictionary, type Locale } from "@/lib/i18n"
import { kindLabel, localized, readable } from "@/lib/names"
import { getCodeDetails, searchCatalog } from "@/lib/search"
import { breadcrumbList, jsonLd, localeUrl, NOT_INDEXED, pageMetadata } from "@/lib/site"
import type { CodeDetails } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * One code on its own address, /ru/code/10202001010000002: something a
 * merchant can send to their accountant, or keep next to the till. The same
 * facts as the details under a search result. A switched-off code also lists
 * the active codes of its category, since that is what its owner needs next.
 *
 * The code is only known per request, so the page body streams in under
 * Suspense; the header and footer come with the layout's static shell. Search
 * engines get the whole page in one piece instead (htmlLimitedBots in
 * next.config.ts), and find these pages through /sitemap.xml and the catalog.
 */

const IKPU = /^\d{17}$/

export async function generateMetadata({ params }: PageProps<"/[locale]/code/[ikpu]">): Promise<Metadata> {
  const { locale, ikpu } = await params
  if (!isLocale(locale)) return {}
  const t = dictionary(locale)
  // No catch: a database hiccup must fail the request (a crawler retries), not answer
  // "no such code" with a noindex that drops the page from search.
  const details = IKPU.test(ikpu) ? await getCodeDetails(ikpu) : null
  if (!details) return { title: t.code.notFoundTitle, robots: NOT_INDEXED }
  const name = localized(details.name, locale).text
  const category = details.path.at(-1)
  return pageMetadata({
    locale,
    path: `/code/${ikpu}`,
    title: format(t.code.metaTitle, { code: ikpu, name }),
    description: format(t.code.metaDescription, {
      code: ikpu,
      name,
      category: category ? readable(localized(category, locale).text) : name,
    }),
  })
}

export default function CodePage({ params }: PageProps<"/[locale]/code/[ikpu]">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
      <Suspense fallback={<CodeSkeleton />}>
        <CodeView params={params} />
      </Suspense>
    </main>
  )
}

async function CodeView({ params }: { params: PageProps<"/[locale]/code/[ikpu]">["params"] }) {
  const { locale, ikpu } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const details = IKPU.test(ikpu) ? await getCodeDetails(ikpu) : null

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${locale}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t.code.back}
      </Link>
      {details ? (
        <CodeBody details={details} locale={locale} t={t} />
      ) : (
        <Empty className="items-start border p-6 text-left">
          <EmptyHeader className="items-start">
            <EmptyTitle>{t.code.notFoundTitle}</EmptyTitle>
            <EmptyDescription>{t.code.notFoundHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

function CodeBody({ details, locale, t }: { details: CodeDetails; locale: Locale; t: Dictionary }) {
  const name = localized(details.name, locale)
  // The same path the "Category" line shows, for search engines to print instead of the URL.
  const trail = breadcrumbList([
    { name: t.catalog.root, url: localeUrl(locale, "/catalog") },
    ...details.path.map((node) => ({
      name: readable(localized(node, locale).text),
      url: localeUrl(locale, `/catalog/${node.code}`),
    })),
    { name: name.text },
  ])
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(trail) }} />
      <header className="flex flex-col gap-3">
        <h1
          className={cn("text-2xl leading-tight font-medium tracking-tight text-balance", name.fallback && "italic")}
          title={name.fallback ? t.result.fallbackName : undefined}
        >
          {name.text}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CopyCode code={details.ikpu} t={t} />
          <span className="text-sm text-muted-foreground">{kindLabel(details.kind, t)}</span>
          {details.status === "inactive" ? <Badge variant="destructive">{t.result.inactive}</Badge> : null}
          {details.brand ? <Badge variant="outline">{t.result.branded}</Badge> : null}
        </div>
      </header>

      <section className="rounded-lg border px-4 py-4 text-sm">
        <DetailsBody details={details} locale={locale} t={t} showPermalink={false} />
      </section>

      {details.status === "inactive" ? (
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <ActiveAlternatives ikpu={details.ikpu} locale={locale} t={t} />
        </Suspense>
      ) : null}
    </>
  )
}

/** The search already answers a switched-off code with its category's active generic codes. */
async function ActiveAlternatives({ ikpu, locale, t }: { ikpu: string; locale: Locale; t: Dictionary }) {
  const alternatives = (await searchCatalog(ikpu)).filter((result) => result.match === "same_category")
  return (
    <section aria-labelledby="tasnif-alternatives" className="flex flex-col gap-3">
      <h2 id="tasnif-alternatives" className="text-lg font-medium">
        {t.code.alternatives}
      </h2>
      {alternatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.code.noAlternatives}</p>
      ) : (
        <CatalogList>
          {alternatives.map((alternative) => (
            <CatalogRow
              key={alternative.ikpu}
              href={`/${locale}/code/${alternative.ikpu}`}
              name={alternative.name}
              code={alternative.ikpu}
              locale={locale}
              t={t}
            />
          ))}
        </CatalogList>
      )}
    </section>
  )
}

function CodeSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-28" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
