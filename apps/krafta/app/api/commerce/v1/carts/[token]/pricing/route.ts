import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { clientForCartToken } from "@/lib/commerce-sdk/cart-sessions";
import { previewCartPricing } from "@/lib/commerce-sdk/cart-pricing";
import { getVenueByCatalogId } from "@/lib/catalogs/data";

export const maxDuration = 30;

// POST /api/commerce/v1/carts/{token}/pricing — server-authoritative pricing
// preview (taxes + tip + delivery fee) for the current cart. Same computePricing
// as checkout, so the previewed total matches what the engine will charge.
export const POST = withCommerceKey(async ({ key, params }, request) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const token = params ? (await params).token : undefined;
  if (!token) return commerceJson({ error: "not_found" }, 404);

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "dine_in" | "pickup" | "delivery";
    tipCents?: number;
    deliveryCoords?: { lat: number; lng: number };
  };

  const ctx = await clientForCartToken(token, key);
  if (!ctx) return commerceJson({ error: "cart_not_found" }, 404);
  const venue = await getVenueByCatalogId(ctx.catalogId);
  if (!venue) return commerceJson({ error: "venue_not_found" }, 404);

  const breakdown = await previewCartPricing(ctx, venue.id, {
    mode: body.mode,
    tipCents: body.tipCents,
    deliveryCoords: body.deliveryCoords,
  });
  return commerceJson(breakdown);
});

export const OPTIONS = () => corsPreflight();
