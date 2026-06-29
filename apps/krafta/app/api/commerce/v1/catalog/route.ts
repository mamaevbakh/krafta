import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { getPublicCatalog } from "@/lib/commerce-sdk/public-shapes";

export const maxDuration = 30;

// GET /api/commerce/v1/catalog — the bound shop's full catalog tree + taxes.
// Org + catalog come from the publishable key, never the request.
export const GET = withCommerceKey(async ({ key }) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const catalog = await getPublicCatalog(key.catalogId);
  if (!catalog) return commerceJson({ error: "not_found" }, 404);
  return commerceJson(catalog);
});

export const OPTIONS = () => corsPreflight();
