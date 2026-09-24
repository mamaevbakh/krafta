import { Fragment } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { format, type Dictionary, type Locale } from "@/lib/i18n"
import { localized, readable } from "@/lib/names"
import type { LocalizedName } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * The pieces the catalog pages and a code's page share: a list of catalog entries,
 * the path back up the tree, and paging through a long sub-position.
 */

export function CatalogList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn("flex flex-col divide-y rounded-lg border", className)}>{children}</ul>
}

/** One entry: the name, then the code in mono, the whole row a link. */
export function CatalogRow({
  href,
  name,
  code,
  badge,
  locale,
  t,
}: {
  href: string
  name: LocalizedName
  code: string
  badge?: string
  locale: Locale
  t: Dictionary
}) {
  const shown = localized(name, locale)
  return (
    <li>
      <Link
        href={href}
        className="flex flex-col gap-1 px-4 py-3 transition-colors duration-150 hover:bg-muted/50 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
      >
        <span
          className={cn("text-[15px] text-pretty", shown.fallback && "italic")}
          title={shown.fallback ? t.result.fallbackName : undefined}
        >
          {readable(shown.text)}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
          <span className="font-mono text-sm text-muted-foreground tabular-nums">{code}</span>
        </span>
      </Link>
    </li>
  )
}

export function CatalogListSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col divide-y rounded-lg border", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-baseline justify-between gap-4 px-4 py-3.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  )
}

/** Catalog › group › class › …: every step a link up the tree. */
export function CatalogBreadcrumb({
  trail,
  locale,
  t,
  className,
}: {
  trail: (LocalizedName & { code: string })[]
  locale: Locale
  t: Dictionary
  className?: string
}) {
  return (
    <Breadcrumb aria-label={t.catalog.breadcrumb} className={className}>
      <BreadcrumbList className="gap-y-1 sm:gap-y-1">
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href={`/${locale}/catalog`} />}>{t.catalog.root}</BreadcrumbLink>
        </BreadcrumbItem>
        {trail.map((node) => (
          <Fragment key={node.code}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={`/${locale}/catalog/${node.code}`} />}>
                {readable(localized(node, locale).text)}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Previous / next through a sub-position's codes. Page 1 is the bare address, so it has one URL. */
export function CatalogPager({
  basePath,
  page,
  pageCount,
  t,
}: {
  basePath: string
  page: number
  pageCount: number
  t: Dictionary
}) {
  const href = (target: number) => (target === 1 ? basePath : `${basePath}?page=${target}`)
  const button = buttonVariants({ variant: "outline", size: "sm" })
  return (
    <nav aria-label={format(t.catalog.page, { page, pages: pageCount })} className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={href(page - 1)} className={button}>
          <ChevronLeftIcon aria-hidden />
          {t.catalog.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground tabular-nums">{format(t.catalog.page, { page, pages: pageCount })}</span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={button}>
          {t.catalog.next}
          <ChevronRightIcon aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
