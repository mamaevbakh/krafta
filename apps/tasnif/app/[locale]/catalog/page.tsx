import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { CatalogList, CatalogListSkeleton, CatalogRow } from "@/components/catalog"
import { getGroups } from "@/lib/catalog"
import { dictionary, isLocale, type Dictionary, type Locale } from "@/lib/i18n"
import { pageMetadata } from "@/lib/site"

/**
 * /ru/catalog: the 115 groups at the top of the catalog. With the category pages under
 * it, every code is a few links from the home page, which is how search engines (and
 * people who'd rather browse than search) reach the whole catalog.
 */

export async function generateMetadata({ params }: PageProps<"/[locale]/catalog">): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = dictionary(locale)
  return pageMetadata({ locale, path: "/catalog", title: t.catalog.metaTitle, description: t.catalog.metaDescription })
}

export default async function CatalogPage({ params }: PageProps<"/[locale]/catalog">) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = dictionary(locale)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
      <h1 className="text-[32px] leading-tight font-medium tracking-tight text-balance">{t.catalog.title}</h1>
      <p className="mt-3 max-w-2xl text-base text-pretty text-muted-foreground">{t.catalog.lead}</p>
      <Suspense fallback={<CatalogListSkeleton rows={12} className="mt-8" />}>
        <Groups locale={locale} t={t} />
      </Suspense>
    </main>
  )
}

async function Groups({ locale, t }: { locale: Locale; t: Dictionary }) {
  // Read on request, not at build: a deploy must not depend on the database answering.
  await connection()
  const groups = await getGroups()
  return (
    <CatalogList className="mt-8">
      {groups.map((group) => (
        <CatalogRow
          key={group.code}
          href={`/${locale}/catalog/${group.code}`}
          name={group}
          code={group.code}
          locale={locale}
          t={t}
        />
      ))}
    </CatalogList>
  )
}
