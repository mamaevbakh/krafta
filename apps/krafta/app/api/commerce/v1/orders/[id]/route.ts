import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { clientForCartToken } from "@/lib/commerce-sdk/cart-sessions";
import { getPublicOrder } from "@/lib/commerce-sdk/order-shapes";

export const maxDuration = 30;

// GET /api/commerce/v1/orders/{id}?cartToken=… — read a placed order, scoped to
// the cart token that created it (RLS keys off the token's anon customer, so one
// shopper can never read another's order).
export const GET = withCommerceKey(async ({ key, params }, request) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const id = params ? (await params).id : undefined;
  if (!id) return commerceJson({ error: "not_found" }, 404);

  const cartToken = new URL(request.url).searchParams.get("cartToken");
  if (!cartToken) return commerceJson({ error: "cart_token_required" }, 400);

  const ctx = await clientForCartToken(cartToken, key);
  if (!ctx) return commerceJson({ error: "cart_not_found" }, 404);

  const order = await getPublicOrder(ctx, id);
  if (!order) return commerceJson({ error: "order_not_found" }, 404);
  return commerceJson(order);
});

export const OPTIONS = () => corsPreflight();
