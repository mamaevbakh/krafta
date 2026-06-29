import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { clientForCartToken } from "@/lib/commerce-sdk/cart-sessions";
import { getCatalogCurrency, mapCart } from "@/lib/commerce-sdk/cart-shapes";
import { getCartSummary } from "@/lib/cart/orders";
import { getVenueByCatalogId } from "@/lib/catalogs/data";

export const maxDuration = 30;

// GET /api/commerce/v1/carts/{token} — the current cart for an opaque cart token.
// Resolves the token to its anonymous Supabase session and reads the cart through
// the SAME RLS-scoped path as the storefront (server-computed line totals only).
export const GET = withCommerceKey(async ({ key, params }) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const token = params ? (await params).token : undefined;
  if (!token) return commerceJson({ error: "not_found" }, 404);

  const ctx = await clientForCartToken(token, key);
  if (!ctx) return commerceJson({ error: "cart_not_found" }, 404);

  const venue = await getVenueByCatalogId(ctx.catalogId);
  if (!venue) return commerceJson({ error: "venue_not_found" }, 404);

  const summary = await getCartSummary({
    orgId: ctx.orgId,
    venueId: venue.id,
    identity: ctx.identity,
    supabase: ctx.client,
  });
  const currency = await getCatalogCurrency(ctx.catalogId);
  return commerceJson(mapCart(token, summary, currency));
});

export const OPTIONS = () => corsPreflight();
