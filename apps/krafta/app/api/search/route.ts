import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type SearchRequest = {
  query?: string;
  catalogId?: string | null;
  orgId?: string | null;
  limit?: number;
};

const DEFAULT_LIMIT = 20;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SearchRequest | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json([]);
  }

  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Search configuration is missing." },
      { status: 500 },
    );
  }

  const limit =
    typeof body?.limit === "number" && Number.isFinite(body.limit)
      ? Math.min(Math.max(body.limit, 1), 50)
      : DEFAULT_LIMIT;

  const catalogId = body?.catalogId ?? null;
  const orgId = body?.orgId ?? null;

  const embedResponse = await fetch(
    `${supabaseUrl}/functions/v1/embed_query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );

  if (!embedResponse.ok) {
    return NextResponse.json(
      { error: "Failed to create search embedding." },
      { status: 500 },
    );
  }

  const embedData = (await embedResponse.json()) as {
    embedding?: string | null;
    skipped?: boolean;
  };

  const embedding = embedData?.skipped ? null : embedData?.embedding ?? null;

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: results, error } = await supabase.rpc(
    "catalog_search_auto",
    {
      p_query: query,
      p_query_embedding: embedding,
      p_limit: limit,
      p_org_id: orgId ?? undefined,
      p_catalog_id: catalogId ?? undefined,
    },
  );

  if (error) {
    return NextResponse.json(
      { error: "Search query failed." },
      { status: 500 },
    );
  }

  await supabase.rpc("log_search", {
    p_query: query,
    p_mode: results?.[0]?.mode ?? "none",
    p_has_embedding: !!embedding,
    p_results_count: results?.length ?? 0,
    p_top_result_id: results?.[0]?.id ?? null,
    p_org_id: orgId ?? null,
    p_catalog_id: catalogId ?? null,
  });

  return NextResponse.json(results ?? []);
}
