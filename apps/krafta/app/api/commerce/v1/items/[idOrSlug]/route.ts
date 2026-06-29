import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { getPublicItem } from "@/lib/commerce-sdk/public-shapes";

export const maxDuration = 30;

// GET /api/commerce/v1/items/{idOrSlug} — a single item (variations + modifier
// lists) in the key's bound catalog, for a product page.
export const GET = withCommerceKey(async ({ key, params }) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const idOrSlug = params ? (await params).idOrSlug : undefined;
  if (!idOrSlug) return commerceJson({ error: "not_found" }, 404);

  const item = await getPublicItem(key.catalogId, idOrSlug);
  if (!item) return commerceJson({ error: "not_found" }, 404);
  return commerceJson(item);
});

export const OPTIONS = () => corsPreflight();
