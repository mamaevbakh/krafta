import type { Metadata } from "next"

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n"

/**
 * The public address, and what search engines need to tell the three languages apart.
 *
 * Russian is the site's first language: most people who search for IKPU codes do it in
 * Russian, so /ru is the x-default and the only language listed in the sitemaps. Uzbek and
 * English pages are announced as its alternates in every page's <head> (hreflang).
 */
export const SITE_URL = "https://tasnif.krafta.uz"
export const SITE_NAME = "Tasnif"

/** hreflang values. Uzbek here is Latin script; Google reads plain "uz". */
const HREFLANG: Record<Locale, string> = { ru: "ru", uz: "uz", en: "en" }

const OPEN_GRAPH_LOCALE: Record<Locale, string> = { ru: "ru_RU", uz: "uz_UZ", en: "en_US" }

export function localeUrl(locale: Locale, path = ""): string {
  return `${SITE_URL}/${locale}${path}`
}

/**
 * Everything a page tells search engines and link previews about itself: its title and
 * description, its own address (canonical) and the same page in the other languages.
 *
 * Every page sets this itself. The layout must not: Next.js hands a layout's `alternates`
 * to every page that doesn't override them, and 441,000 code pages naming the home page as
 * their canonical would tell Google they are all copies of it.
 *
 * `path` may carry a query string (`/catalog/068?page=2`); pages beyond the first are
 * their own canonical, as Google asks for paginated lists.
 */
export function pageMetadata({
  locale,
  path = "",
  title,
  description,
}: {
  locale: Locale
  path?: string
  /** The page's own title; the layout's template adds " · Tasnif". */
  title: string | { absolute: string }
  description: string
}): Metadata {
  const url = localeUrl(locale, path)
  const shareTitle = typeof title === "string" ? `${title} · ${SITE_NAME}` : title.absolute
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(LOCALES.map((l) => [HREFLANG[l], localeUrl(l, path)])),
        "x-default": localeUrl(DEFAULT_LOCALE, path),
      },
    },
    // A page's openGraph replaces the layout's whole object rather than merging into
    // it, so each page carries the full set.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OPEN_GRAPH_LOCALE[locale],
      url,
      title: shareTitle,
      description,
    },
    twitter: { card: "summary", title: shareTitle, description },
  }
}

/** For a page that answers "not found" with a 200 and a friendly explanation: never indexed. */
export const NOT_INDEXED: Metadata["robots"] = { index: false, follow: true }

/**
 * Structured data goes out as a <script type="application/ld+json">. JSON.stringify leaves
 * "<" alone, so a catalog name containing "</script>" could break out of the tag; escaping it
 * is the Next.js guide's recommendation.
 */
export function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

/** schema.org BreadcrumbList: the trail search engines may show instead of the bare URL. */
export function breadcrumbList(trail: { name: string; url?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      ...(crumb.url ? { item: crumb.url } : {}),
    })),
  }
}
