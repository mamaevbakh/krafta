import { NextResponse } from "next/server";

import { searchCatalog } from "@/lib/catalogs/search";

type SearchRequest = {
  query?: string;
  catalogId?: string | null;
  orgId?: string | null;
  limit?: number;
};

// The storefront search dialog posts here. Retrieval (query embedding + the
// catalog_search_auto RRF hybrid) lives in lib/catalogs/search.ts so this route
// and the AI assistant's searchCatalog tool share one backend-swappable path.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SearchRequest | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    const rows = await searchCatalog({
      query,
      catalogId: body?.catalogId ?? null,
      orgId: body?.orgId ?? null,
      limit: typeof body?.limit === "number" ? body.limit : undefined,
    });
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json(
      { error: "Search request failed." },
      { status: 500 },
    );
  }
}
