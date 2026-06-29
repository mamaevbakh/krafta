import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { mapSearchRows } from "@/lib/commerce-sdk/public-shapes";
import { searchCatalog } from "@/lib/catalogs/search";

export const maxDuration = 30;

type SearchBody = { query?: string; limit?: number };

// POST /api/commerce/v1/search — hybrid search over the key's bound catalog.
// catalogId/orgId are injected from the key (unlike the legacy /api/search,
// which trusts a body catalogId).
export const POST = withCommerceKey(async ({ key }, request) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const body = (await request.json().catch(() => null)) as SearchBody | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) return commerceJson({ results: [] });

  const rows = await searchCatalog({
    query,
    catalogId: key.catalogId,
    orgId: key.orgId,
    limit: body?.limit,
  });

  return commerceJson({ results: mapSearchRows(rows) });
});

export const OPTIONS = () => corsPreflight();
