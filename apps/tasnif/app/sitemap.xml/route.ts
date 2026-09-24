import { connection } from "next/server"

import { getCodeSitemapStarts } from "@/lib/catalog"
import { sitemapIndexResponse, sitemapUnavailable } from "@/lib/sitemap"

/**
 * GET /sitemap.xml, the one address robots.txt and the search consoles are given: the
 * catalog pages, then every active code in files of 25,000 (see lib/sitemap.ts).
 */
export async function GET() {
  await connection() // render per request, never at build: see lib/sitemap.ts
  try {
    const starts = await getCodeSitemapStarts()
    return sitemapIndexResponse(["catalog.xml", ...starts.map((_, index) => `codes-${index}.xml`)])
  } catch (error) {
    console.error("tasnif: sitemap index failed", error)
    return sitemapUnavailable()
  }
}
