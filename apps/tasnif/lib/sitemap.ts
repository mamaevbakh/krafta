import "server-only"

import type { SitemapEntry } from "@/lib/catalog"
import { localeUrl, SITE_URL } from "@/lib/site"

/**
 * Sitemaps written by hand rather than with Next's sitemap.ts: those are prerendered at
 * build, which would make every deploy read 441,000 codes from the database and fail when
 * it can't. These render on request and are cached by Vercel's CDN for a day (s-maxage),
 * so the database sees each file about once a day, whenever a crawler first asks.
 *
 * Only Russian addresses are listed: Russian is the site's first language, and each page
 * names its Uzbek and English versions itself (hreflang), which is how search engines
 * find those.
 */

const HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
}

/** The date part is enough, and keeps a 25,000-code file ~20% smaller. */
function lastmod(timestamp: string | undefined): string {
  return timestamp ? `<lastmod>${timestamp.slice(0, 10)}</lastmod>` : ""
}

export function urlsetResponse(entries: SitemapEntry[]): Response {
  const urls = entries.map((entry) => `<url><loc>${localeUrl("ru", entry.path)}</loc>${lastmod(entry.lastModified)}</url>`)
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n")
  return new Response(body, { headers: HEADERS })
}

/** A crawler retries a 503 later; a cached empty sitemap would hide every page for a day. */
export function sitemapUnavailable(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Retry-After": "3600", "Cache-Control": "no-store" },
  })
}

export function sitemapIndexResponse(files: string[]): Response {
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...files.map((file) => `<sitemap><loc>${SITE_URL}/sitemaps/${file}</loc></sitemap>`),
    `</sitemapindex>`,
  ].join("\n")
  return new Response(body, { headers: HEADERS })
}
