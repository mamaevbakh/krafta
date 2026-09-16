import "server-only"

import { cacheLife, cacheTag } from "next/cache"

import { tasnifDb } from "@/lib/supabase"
import type { CodeDetails, Kind, Match, PackageCode, SearchResult } from "@/lib/types"

/**
 * The catalog changes when an import runs, not between requests, so every read
 * here is cached under the `catalog` tag and can be dropped in one call after
 * a sync (revalidateTag("catalog")).
 */

// Must match what the documents were embedded with (scripts/embed_documents.py).
const EMBEDDING_MODEL = "text-embedding-3-large"
const EMBEDDING_DIMENSIONS = 1536
const MAX_QUERY_LENGTH = 120
const RESULT_LIMIT = 30

export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH)
}

/** Throws on failure, so a failed call is never cached. */
async function cachedEmbedding(query: string): Promise<string> {
  "use cache"
  cacheLife("weeks")
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: query, dimensions: EMBEDDING_DIMENSIONS }),
  })
  if (!response.ok) {
    throw new Error(`OpenAI embeddings ${response.status}`)
  }
  const data = (await response.json()) as { data: { embedding: number[] }[] }
  return `[${data.data[0].embedding.map((value) => value.toFixed(5)).join(",")}]`
}

/**
 * Meaning search is an extra, not a dependency: without a key, for a pasted
 * number, or when OpenAI is down, the database still searches by words and
 * typos.
 */
async function queryEmbedding(query: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY || !/\p{L}/u.test(query)) return null
  try {
    return await cachedEmbedding(query)
  } catch (error) {
    console.error("tasnif: query embedding failed, searching without meaning", error)
    return null
  }
}

export async function searchCatalog(rawQuery: string): Promise<SearchResult[]> {
  const query = normalizeQuery(rawQuery)
  if (query.length < 2) return []
  return cachedSearch(query)
}

async function cachedSearch(query: string): Promise<SearchResult[]> {
  "use cache"
  cacheLife("hours")
  cacheTag("catalog")

  const db = tasnifDb()
  const embedding = await queryEmbedding(query)
  const { data, error } = await db.rpc("search", {
    p_query: query,
    p_query_embedding: embedding,
    p_limit: RESULT_LIMIT,
  })
  if (error) throw new Error(`tasnif.search failed: ${error.message}`)
  const rows = data ?? []

  const categoryCodes = [...new Set(rows.map((row) => row.subposition_code).filter(Boolean))]
  const categories = new Map<string, { ru: string; uzLatn: string | null }>()
  if (categoryCodes.length > 0) {
    const { data: nodes, error: nodesError } = await db
      .from("nodes")
      .select("code, name_ru, name_uz_latn")
      .in("code", categoryCodes)
    if (nodesError) throw new Error(`tasnif.nodes failed: ${nodesError.message}`)
    for (const node of nodes ?? []) {
      categories.set(node.code, { ru: node.name_ru, uzLatn: node.name_uz_latn })
    }
  }

  return rows.map((row) => {
    const category = categories.get(row.subposition_code)
    return {
      ikpu: row.ikpu,
      status: row.status === "inactive" ? "inactive" : "active",
      match: row.match as Match,
      kind: row.kind as Kind,
      isBranded: row.is_branded,
      name: { ru: row.name_ru, uzLatn: row.name_uz_latn },
      category: category ? { code: row.subposition_code, ...category } : null,
    }
  })
}

export async function getCodeDetails(ikpu: string): Promise<CodeDetails | null> {
  "use cache"
  cacheLife("hours")
  cacheTag("catalog")

  const db = tasnifDb()
  const pathCodes = [3, 5, 8, 11].map((length) => ikpu.slice(0, length))
  const [code, inactive, packages, nodes] = await Promise.all([
    db
      .from("codes")
      .select(
        "ikpu, kind, status, name_ru, name_uz_latn, name_uz_cyrl, brand_name, barcode, fixed_measure_ru, benefit_id, benefit_name_ru",
      )
      .eq("ikpu", ikpu)
      .maybeSingle(),
    db.from("inactive_codes").select("ikpu, name_ru, brand_name").eq("ikpu", ikpu).maybeSingle(),
    db
      .from("packages")
      .select("package_code, name_ru, origin")
      .eq("ikpu", ikpu)
      .order("origin")
      .order("package_code"),
    db.from("nodes").select("code, name_ru, name_uz_latn").in("code", pathCodes),
  ])
  for (const result of [code, inactive, packages, nodes]) {
    if (result.error) throw new Error(`tasnif details failed: ${result.error.message}`)
  }

  const path = pathCodes.flatMap((pathCode) => {
    const node = nodes.data?.find((candidate) => candidate.code === pathCode)
    return node ? [{ code: node.code, ru: node.name_ru, uzLatn: node.name_uz_latn }] : []
  })
  const packageCodes: PackageCode[] = (packages.data ?? []).map((row) => {
    const origin = row.origin
    return {
      code: row.package_code,
      name: row.name_ru ?? "",
      origin: origin === "fixed" || origin === "user" ? origin : null,
    }
  })

  if (code.data) {
    const row = code.data
    return {
      ikpu: row.ikpu,
      status: row.status === "inactive" ? "inactive" : "active",
      kind: row.kind as Kind,
      name: { ru: row.name_ru, uzLatn: row.name_uz_latn, uzCyrl: row.name_uz_cyrl },
      brand: row.brand_name,
      barcode: row.barcode,
      units: row.fixed_measure_ru,
      benefit: row.benefit_name_ru ?? row.benefit_id,
      path,
      packages: packageCodes,
    }
  }
  if (inactive.data) {
    return {
      ikpu: inactive.data.ikpu,
      status: "inactive",
      kind: ikpu.startsWith("10202") ? "catering" : ikpu.startsWith("1") ? "service" : "goods",
      name: { ru: inactive.data.name_ru, uzLatn: null, uzCyrl: null },
      brand: inactive.data.brand_name,
      barcode: null,
      units: null,
      benefit: null,
      path,
      packages: [],
    }
  }
  return null
}

/** When the Russian catalog export last finished importing cleanly. */
export async function getLastSync(): Promise<string | null> {
  "use cache"
  cacheLife("hours")
  cacheTag("catalog")

  const { data, error } = await tasnifDb()
    .from("sync_runs")
    .select("finished_at")
    .eq("source", "excel")
    .is("error", null)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`tasnif.sync_runs failed: ${error.message}`)
  return data?.finished_at ?? null
}
