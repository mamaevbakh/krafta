import "server-only"

import { cacheLife, cacheTag } from "next/cache"

import { tasnifDb } from "@/lib/supabase"
import type { LocalizedName } from "@/lib/types"

/**
 * The catalog as a tree to browse (group › class › position › sub-position › code) and as
 * flat lists for the sitemaps. Page reads are cached under the same `catalog` tag as
 * search, so a sync drops them together.
 */

export type CategoryLevel = "group" | "class" | "position" | "subposition"

/** A category's level is the length of its code. */
const LEVEL_BY_LENGTH: Record<number, CategoryLevel> = { 3: "group", 5: "class", 8: "position", 11: "subposition" }

export function isCategoryCode(code: string): boolean {
  return /^\d+$/.test(code) && code.length in LEVEL_BY_LENGTH
}

export type CategoryNode = LocalizedName & { code: string; level: CategoryLevel }
export type CategoryCode = LocalizedName & { ikpu: string; isBranded: boolean }

export type Category = CategoryNode & {
  /** Ancestors, top first, without the category itself. */
  path: CategoryNode[]
  /** Sub-categories; a sub-position has none, it holds codes. */
  children: CategoryNode[]
  /** One page of a sub-position's active codes, unbranded first. */
  codes: CategoryCode[]
  codeCount: number
  pageCount: number
}

export const CODES_PER_PAGE = 100
/** Google takes 50,000 URLs per sitemap; 25,000 keeps a file near 2.5 MB, under Vercel's response limit. */
export const CODES_PER_SITEMAP = 25_000
/** PostgREST returns at most this many rows per request. */
const ROWS_PER_REQUEST = 1000

function node(row: { code: string; name_ru: string; name_uz_latn: string | null }): CategoryNode {
  return { code: row.code, level: LEVEL_BY_LENGTH[row.code.length], ru: row.name_ru, uzLatn: row.name_uz_latn }
}

export async function getGroups(): Promise<CategoryNode[]> {
  "use cache"
  cacheLife("days")
  cacheTag("catalog")

  const { data, error } = await tasnifDb()
    .from("nodes")
    .select("code, name_ru, name_uz_latn")
    .eq("level", "group")
    .order("code")
  if (error) throw new Error(`tasnif groups failed: ${error.message}`)
  return (data ?? []).map(node)
}

/** null when no such category exists. A page past the last one comes back with no codes. */
export async function getCategory(code: string, page: number): Promise<Category | null> {
  "use cache"
  cacheLife("hours")
  cacheTag("catalog")

  if (!isCategoryCode(code)) return null
  const db = tasnifDb()
  const ancestors = [3, 5, 8].filter((length) => length < code.length).map((length) => code.slice(0, length))
  const isSubposition = code.length === 11
  const [self, path, children, count] = await Promise.all([
    db.from("nodes").select("code, name_ru, name_uz_latn").eq("code", code).maybeSingle(),
    db.from("nodes").select("code, name_ru, name_uz_latn").in("code", ancestors).order("code"),
    db.from("nodes").select("code, name_ru, name_uz_latn").eq("parent_code", code).order("code"),
    isSubposition
      ? db
          .from("codes")
          .select("ikpu", { count: "exact", head: true })
          .eq("subposition_code", code)
          .eq("status", "active")
      : Promise.resolve({ count: 0, error: null }),
  ])
  for (const result of [self, path, children, count]) {
    if (result.error) throw new Error(`tasnif category ${code} failed: ${result.error.message}`)
  }
  if (!self.data) return null

  const codeCount = count.count ?? 0
  const pageCount = Math.ceil(codeCount / CODES_PER_PAGE)
  const codes = isSubposition && page <= pageCount ? await subpositionPage(code, page) : []

  return {
    ...node(self.data),
    path: (path.data ?? []).map(node),
    children: isSubposition ? [] : (children.data ?? []).map(node),
    codes,
    codeCount,
    pageCount,
  }
}

/**
 * Two steps, so a deep page stays fast: the page's codes come off codes_active_listing_idx
 * alone (the last page of the 68,674-code sub-position skips its entries in ~15 ms), and only
 * those hundred rows are then read for their names. Fetching names in the first query makes
 * Postgres read every skipped row too (0.5 s on that page).
 */
async function subpositionPage(code: string, page: number): Promise<CategoryCode[]> {
  const db = tasnifDb()
  const { data: keys, error } = await db
    .from("codes")
    .select("ikpu")
    .eq("subposition_code", code)
    .eq("status", "active")
    .order("is_branded")
    .order("ikpu")
    .range((page - 1) * CODES_PER_PAGE, page * CODES_PER_PAGE - 1)
  if (error) throw new Error(`tasnif category ${code} codes failed: ${error.message}`)
  const ikpus = (keys ?? []).map((row) => row.ikpu)
  if (ikpus.length === 0) return []

  const { data: rows, error: rowsError } = await db
    .from("codes")
    .select("ikpu, name_ru, name_uz_latn, is_branded")
    .in("ikpu", ikpus)
  if (rowsError) throw new Error(`tasnif category ${code} names failed: ${rowsError.message}`)
  const byIkpu = new Map((rows ?? []).map((row) => [row.ikpu, row]))
  return ikpus.flatMap((ikpu) => {
    const row = byIkpu.get(ikpu)
    return row ? [{ ikpu, ru: row.name_ru, uzLatn: row.name_uz_latn, isBranded: row.is_branded ?? false }] : []
  })
}

/*
 * Sitemap reads. Not cached here: a code sitemap is 25,000 rows, and holding eighteen of
 * them would push search results out of the in-memory cache. The sitemap responses are
 * cached by Vercel's CDN instead (see lib/sitemap.ts), so these run about once a day.
 */

export type SitemapEntry = { path: string; lastModified?: string }

/** Every category page, in code order (14,501 of them). */
export async function getCategorySitemap(): Promise<SitemapEntry[]> {
  const db = tasnifDb()
  const entries: SitemapEntry[] = []
  for (let from = 0; ; from += ROWS_PER_REQUEST) {
    const { data, error } = await db
      .from("nodes")
      .select("code, updated_at")
      .order("code")
      .range(from, from + ROWS_PER_REQUEST - 1)
    if (error) throw new Error(`tasnif category sitemap failed: ${error.message}`)
    entries.push(...(data ?? []).map((row) => ({ path: `/catalog/${row.code}`, lastModified: row.updated_at })))
    if (!data || data.length < ROWS_PER_REQUEST) return entries
  }
}

/**
 * The first code of each code sitemap. Sitemap n holds the active codes from starts[n] up to
 * starts[n + 1]. New codes shift the boundaries a little; a code can then sit in a
 * neighbouring file for a day, which search engines don't mind.
 */
export async function getCodeSitemapStarts(): Promise<string[]> {
  "use cache"
  cacheLife("hours")
  cacheTag("catalog")

  const { data, error } = await tasnifDb().rpc("sitemap_code_starts", { p_size: CODES_PER_SITEMAP })
  if (error) throw new Error(`tasnif sitemap starts failed: ${error.message}`)
  return (data ?? []).map((row) => row.ikpu)
}

/** null when there is no such sitemap. Reads by code range, never by offset (see the migration). */
export async function getCodeSitemap(index: number): Promise<SitemapEntry[] | null> {
  const starts = await getCodeSitemapStarts()
  if (!Number.isInteger(index) || index < 0 || index >= starts.length) return null
  const first = starts[index]
  const next = starts[index + 1]

  const db = tasnifDb()
  const entries: SitemapEntry[] = []
  let after: string | null = null
  for (;;) {
    let query = db.from("codes").select("ikpu, updated_at").eq("status", "active")
    query = after === null ? query.gte("ikpu", first) : query.gt("ikpu", after)
    if (next) query = query.lt("ikpu", next)
    const { data, error } = await query.order("ikpu").limit(ROWS_PER_REQUEST)
    if (error) throw new Error(`tasnif code sitemap ${index} failed: ${error.message}`)
    const rows = data ?? []
    entries.push(...rows.map((row) => ({ path: `/code/${row.ikpu}`, lastModified: row.updated_at })))
    if (rows.length < ROWS_PER_REQUEST) return entries
    after = rows[rows.length - 1].ikpu
  }
}
