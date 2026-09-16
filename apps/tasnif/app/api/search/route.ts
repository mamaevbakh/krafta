import { normalizeQuery, searchCatalog } from "@/lib/search"
import type { SearchResponse } from "@/lib/types"

/**
 * GET /api/search?q=капучино
 *
 * The page calls this as the visitor types; it is also the seed of the public
 * API. Responses are cacheable at the edge for an hour: results only change
 * when the catalog is re-imported, and a repeated query should never reach the
 * database, which is shared with Krafta's shops and payments.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q") ?? ""
  if (raw.length > 200) {
    return Response.json({ error: "query_too_long" }, { status: 400 })
  }
  const query = normalizeQuery(raw)
  try {
    const body: SearchResponse = { query, results: await searchCatalog(query) }
    return Response.json(body, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    })
  } catch (error) {
    console.error("tasnif: search failed", error)
    return Response.json({ error: "search_failed" }, { status: 502 })
  }
}
