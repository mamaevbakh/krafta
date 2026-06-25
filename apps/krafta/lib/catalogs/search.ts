import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * The single retrieval interface for storefront search AND the conversational
 * assistant.
 *
 * Everything that needs to "find items/categories" — the storefront search
 * dialog (`/api/search`) and the AI agent's `searchCatalog` tool — calls this
 * one function. The retrieval BACKEND lives entirely behind it: today an
 * `embed_query` edge function (OpenAI text-embedding-3-large @1536) feeding the
 * `catalog_search_auto` RRF hybrid RPC over Supabase/pgvector. Because callers
 * only see this typed interface, the backend can be re-pointed later
 * (pg_search/ParadeDB, Meilisearch, …) without touching the storefront UI, the
 * route handlers, or the agent. See the Typesense decision memo: keep one
 * source of truth now, keep the option open behind a clean seam.
 *
 * The writer side of this index lives in `./search-documents.ts`.
 */

type CatalogSearchRpc = Database["public"]["Functions"]["catalog_search_auto"];
export type CatalogSearchRow = CatalogSearchRpc["Returns"][number];

export type SearchCatalogParams = {
  /** Natural-language query in any language (ru / uz / en / mixed). */
  query: string;
  /** Scope to a single catalog (the storefront always does). */
  catalogId?: string | null;
  /** Optional org scope. */
  orgId?: string | null;
  /** 1..50, default 20. */
  limit?: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function resolveAdminCredentials(): { url: string; key: string } {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Search configuration is missing (Supabase URL / secret key).",
    );
  }
  return { url, key };
}

/**
 * Produce the query embedding via the `embed_query` edge function — the SAME
 * model + dimensions as the corpus embeddings (lockstep is required for the
 * vectors to be comparable). Queries shorter than 3 chars are skipped
 * server-side, which degrades `catalog_search_auto` to keyword-only mode.
 */
async function embedQuery(
  url: string,
  key: string,
  query: string,
): Promise<string | null> {
  const res = await fetch(`${url}/functions/v1/embed_query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error("Failed to create search embedding.");
  }

  const data = (await res.json()) as {
    embedding?: string | null;
    skipped?: boolean;
  };
  return data?.skipped ? null : data?.embedding ?? null;
}

/**
 * Hybrid (semantic + keyword) catalog retrieval. Returns ranked rows — one per
 * logical entity (server-side deduped) — ordered by relevance. Throws on
 * misconfiguration / embedding / query failure so callers can map to the right
 * HTTP status; returns `[]` for an empty query.
 */
export async function searchCatalog(
  params: SearchCatalogParams,
): Promise<CatalogSearchRow[]> {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  if (!query) return [];

  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.min(Math.max(params.limit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
  const catalogId = params.catalogId ?? null;
  const orgId = params.orgId ?? null;

  const { url, key } = resolveAdminCredentials();
  const embedding = await embedQuery(url, key, query);

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("catalog_search_auto", {
    p_query: query,
    p_query_embedding: embedding,
    p_limit: limit,
    p_org_id: orgId ?? undefined,
    p_catalog_id: catalogId ?? undefined,
  });

  if (error) {
    throw new Error("Search query failed.");
  }

  const rows = (data ?? []) as CatalogSearchRow[];

  // Best-effort analytics — never blocks or fails the response.
  void (async () => {
    try {
      await supabase.rpc("log_search", {
        p_query: query,
        p_mode: rows[0]?.mode ?? "none",
        p_has_embedding: !!embedding,
        p_results_count: rows.length,
        p_top_result_id: rows[0]?.id ?? "",
        p_org_id: orgId ?? "",
        p_catalog_id: catalogId ?? "",
      });
    } catch {
      // swallow — logging is non-critical.
    }
  })();

  return rows;
}
