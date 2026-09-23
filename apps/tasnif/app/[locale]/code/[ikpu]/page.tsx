import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { CopyCode, DetailsBody } from "@/components/search/result-row"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { dictionary, format, isLocale, type Dictionary, type Locale } from "@/lib/i18n"
import { kindLabel, localized } from "@/lib/names"
import { getCodeDetails, searchCatalog } from "@/lib/search"
import type { CodeDetails } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * One code on its own address, /ru/code/10202001010000002: something a
 * merchant can send to their accountant, or keep next to the till. The same
 * facts as the details under a search result. A switched-off code also lists
 * the active codes of its category, since that is what its owner needs next.
 *
 * The code is only known per request, so the page body streams in under
 * Suspense; the header and footer come with the layout's static shell.
 */

const IKPU = /^\d{17}$/

export async function generateMetadata({ params }: PageProps<"/[locale]/code/[ikpu]">): Promise<Metadata> {
  const { locale, ikpu } = await params
  if (!isLocale(locale)) return {}
  const t = dictionary(locale)
  const details = IKPU.test(ikpu) ? await getCodeDetails(ikpu).catch(() => null) : null
  if (!details) return { title: t.code.notFoundTitle }
  const name = localized(details.name, locale).text
  return {
    title: format(t.code.metaTitle, { code: ikpu, name }),
    description: format(t.code.metaDescription, { code: ikpu, name }),
  }
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
  return (
    <>
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
        <ul className="flex flex-col divide-y rounded-lg border">
          {alternatives.map((alternative) => {
            const name = localized(alternative.name, locale)
            return (
              <li key={alternative.ikpu}>
                <Link
                  href={`/${locale}/code/${alternative.ikpu}`}
                  className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-muted/50 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className={cn("text-[15px] text-pretty", name.fallback && "italic")}>{name.text}</span>
                  <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">{alternative.ikpu}</span>
                </Link>
              </li>
            )
          })}
        </ul>
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
