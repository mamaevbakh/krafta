import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CatalogBreadcrumb, CatalogList, CatalogListSkeleton, CatalogPager, CatalogRow } from "@/components/catalog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { getCategory, type Category, type CategoryLevel } from "@/lib/catalog"
import { dictionary, format, isLocale, plural, type Dictionary, type Locale } from "@/lib/i18n"
import { localized, readable } from "@/lib/names"
import { breadcrumbList, jsonLd, localeUrl, NOT_INDEXED, pageMetadata } from "@/lib/site"
import { cn } from "@/lib/utils"

/**
 * /ru/catalog/068 and down: one category of the catalog tree. A group, class or position
 * lists the categories under it; a sub-position lists its active codes, 100 per page,
 * unbranded first. Each page is a place search engines can land on for a category name
 * ("молочная продукция икпу"), and the chain of them links every code to the home page.
 */

type Props = PageProps<"/[locale]/catalog/[code]">

const CHILD_LEVEL: Record<CategoryLevel, CategoryLevel | null> = {
  group: "class",
  class: "position",
  position: "subposition",
  subposition: null,
}

/** ?page=2 → 2. Anything else is page 1, whose address carries no query at all. */
function pageNumber(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

function pagePath(code: string, page: number): string {
  return `/catalog/${code}${page > 1 ? `?page=${page}` : ""}`
}

/** The category exists and, past its first page, this page still has codes on it. */
function found(category: Category | null, page: number): category is Category {
  return category !== null && (page === 1 || category.codes.length > 0)
}

function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, code } = await params
  if (!isLocale(locale)) return {}
  const t = dictionary(locale)
  const page = pageNumber((await searchParams).page)
  const category = await getCategory(code, page)
  if (!found(category, page)) return { title: t.catalog.notFoundTitle, robots: NOT_INDEXED }

  const name = readable(localized(category, locale).text)
  const description =
    category.level === "subposition"
      ? format(t.catalog.subpositionMetaDescription, {
          name,
          code,
          count: plural(t.catalog.codeCount, category.codeCount, locale),
        })
      : format(t.catalog.categoryMetaDescription, { name, code, level: t.catalog.level[category.level] })
  const title =
    format(t.catalog.categoryMetaTitle, { name }) +
    (page > 1 ? ` — ${format(t.catalog.page, { page, pages: category.pageCount })}` : "")
  return pageMetadata({ locale, path: pagePath(code, page), title, description })
}

export default function CategoryPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
      <Suspense fallback={<CategorySkeleton />}>
        <CategoryView params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function CategoryView({ params, searchParams }: Props) {
  const { locale, code } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)
  const page = pageNumber((await searchParams).page)
  const category = await getCategory(code, page)

  if (!found(category, page)) {
    return (
      <div className="flex flex-col gap-6">
        <CatalogBreadcrumb trail={[]} locale={locale} t={t} />
        <Empty className="items-start border p-6 text-left">
          <EmptyHeader className="items-start">
            <EmptyTitle>{t.catalog.notFoundTitle}</EmptyTitle>
            <EmptyDescription>{t.catalog.notFoundHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const name = localized(category, locale)
  const trail = breadcrumbList([
    { name: t.catalog.root, url: localeUrl(locale, "/catalog") },
    ...category.path.map((node) => ({
      name: readable(localized(node, locale).text),
      url: localeUrl(locale, `/catalog/${node.code}`),
    })),
    { name: readable(name.text) },
  ])

  return (
    <div className="flex flex-col gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(trail) }} />
      <CatalogBreadcrumb trail={category.path} locale={locale} t={t} />
      <header className="flex flex-col gap-2">
        <h1
          className={cn("text-2xl leading-tight font-medium tracking-tight text-balance", name.fallback && "italic")}
          title={name.fallback ? t.result.fallbackName : undefined}
        >
          {readable(name.text)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {capitalized(t.catalog.level[category.level])}{" "}
          <span className="font-mono tabular-nums">{category.code}</span>
          {category.level === "subposition" ? <> · {plural(t.catalog.codeCount, category.codeCount, locale)}</> : null}
        </p>
      </header>
      <CategoryContents category={category} page={page} locale={locale} t={t} />
    </div>
  )
}

function CategoryContents({
  category,
  page,
  locale,
  t,
}: {
  category: Category
  page: number
  locale: Locale
  t: Dictionary
}) {
  const childLevel = CHILD_LEVEL[category.level]
  if (childLevel) {
    return (
      <section aria-labelledby="catalog-children" className="flex flex-col gap-3">
        <h2 id="catalog-children" className="text-lg font-medium">
          {t.catalog.children[childLevel]}
        </h2>
        {category.children.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.catalog.empty}</p>
        ) : (
          <CatalogList>
            {category.children.map((child) => (
              <CatalogRow
                key={child.code}
                href={`/${locale}/catalog/${child.code}`}
                name={child}
                code={child.code}
                locale={locale}
                t={t}
              />
            ))}
          </CatalogList>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby="catalog-codes" className="flex flex-col gap-3">
      <h2 id="catalog-codes" className="text-lg font-medium">
        {t.catalog.codes}
      </h2>
      {category.codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.catalog.empty}</p>
      ) : (
        <CatalogList>
          {category.codes.map((code) => (
            <CatalogRow
              key={code.ikpu}
              href={`/${locale}/code/${code.ikpu}`}
              name={code}
              code={code.ikpu}
              badge={code.isBranded ? t.result.branded : undefined}
              locale={locale}
              t={t}
            />
          ))}
        </CatalogList>
      )}
      {category.pageCount > 1 ? (
        <CatalogPager basePath={`/${locale}/catalog/${category.code}`} page={page} pageCount={category.pageCount} t={t} />
      ) : null}
    </section>
  )
}

function CategorySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-64" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-40" />
      </div>
      <CatalogListSkeleton rows={10} />
    </div>
  )
}
