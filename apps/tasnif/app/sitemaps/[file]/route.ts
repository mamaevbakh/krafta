import { connection } from "next/server"

import { getCategorySitemap, getCodeSitemap } from "@/lib/catalog"
import { sitemapUnavailable, urlsetResponse } from "@/lib/sitemap"

/**
 * GET /sitemaps/catalog.xml — the home page, the catalog index and every category page.
 * GET /sitemaps/codes-0.xml … — every active code, 25,000 per file, in code order.
 * /sitemap.xml lists them all.
 */
export async function GET(_request: Request, { params }: RouteContext<"/sitemaps/[file]">) {
  await connection()
  const { file } = await params
  const codes = /^codes-(\d{1,3})\.xml$/.exec(file)
  if (file !== "catalog.xml" && !codes) return new Response("Not found", { status: 404 })

  try {
    if (codes) {
      const entries = await getCodeSitemap(Number(codes[1]))
      return entries ? urlsetResponse(entries) : new Response("Not found", { status: 404 })
    }
    return urlsetResponse([{ path: "" }, { path: "/catalog" }, ...(await getCategorySitemap())])
  } catch (error) {
    console.error(`tasnif: sitemap ${file} failed`, error)
    return sitemapUnavailable()
  }
}
