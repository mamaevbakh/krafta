import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { createCartSession } from "@/lib/commerce-sdk/cart-sessions";
import { emptyCart, getCatalogCurrency } from "@/lib/commerce-sdk/cart-shapes";

export const maxDuration = 30;

// POST /api/commerce/v1/carts — mint a new cart for the key's bound shop. Creates
// a fresh anonymous Supabase user behind the scenes (the RLS identity for every
// later cart/checkout call) and returns the opaque cartToken. The shop persists
// the token; it is shown only once. Publishable keys are allowed (browser-safe).
export const POST = withCommerceKey(async ({ key }) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }

  const result = await createCartSession(key);
  if (!result) return commerceJson({ error: "cart_create_failed" }, 500);

  const currency = await getCatalogCurrency(key.catalogId);
  return commerceJson(emptyCart(result.cartToken, currency));
});

export const OPTIONS = () => corsPreflight();
