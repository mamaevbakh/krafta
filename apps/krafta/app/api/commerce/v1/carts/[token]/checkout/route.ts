import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { clientForCartToken } from "@/lib/commerce-sdk/cart-sessions";
import { placeOrder } from "@/lib/cart/checkout";
import { getVenueByCatalogId } from "@/lib/catalogs/data";

export const maxDuration = 30;

// Engine error messages the storefront should branch on (CheckoutErrorCode). The
// engine throws these as the head of the message (e.g. "price_changed:names");
// everything else is an internal failure mapped to a generic code.
const CHECKOUT_ERROR_CODES = new Set([
  "price_changed",
  "out_of_zone",
  "below_min_order",
  "phone_invalid",
  "tip_too_high",
  "cart_empty",
]);

// POST /api/commerce/v1/carts/{token}/checkout — place the order. The engine
// re-validates everything server-side (price drift, delivery zone, min order,
// tip cap) and recomputes all money; the body carries no prices. Cash/COD (v1).
export const POST = withCommerceKey(async ({ key, params }, request) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const token = params ? (await params).token : undefined;
  if (!token) return commerceJson({ error: "not_found" }, 404);

  const body = (await request.json().catch(() => ({}))) as {
    mode?: unknown;
    fields?: Record<string, unknown>;
    tipCents?: unknown;
  };
  const mode = body.mode;
  if (mode !== "dine_in" && mode !== "pickup" && mode !== "delivery") {
    return commerceJson({ error: "invalid_mode" }, 400);
  }

  const ctx = await clientForCartToken(token, key);
  if (!ctx) return commerceJson({ error: "cart_not_found" }, 404);
  const venue = await getVenueByCatalogId(ctx.catalogId);
  if (!venue) return commerceJson({ error: "venue_not_found" }, 404);

  const f = (body.fields ?? {}) as {
    name?: string;
    phone?: string;
    table?: string;
    address?: string;
    note?: string;
    coords?: { lat?: number; lng?: number };
    scheduledFor?: string;
  };
  const tipCents = Number.isFinite(Number(body.tipCents))
    ? Math.max(0, Math.floor(Number(body.tipCents)))
    : 0;
  const base = {
    orgId: ctx.orgId,
    venueId: venue.id,
    tipCents,
    identity: ctx.identity,
    supabase: ctx.client,
  };

  try {
    const result =
      mode === "dine_in"
        ? await placeOrder({
            ...base,
            mode: "dine_in",
            fields: { tableLabel: f.table ?? "" },
          })
        : mode === "pickup"
          ? await placeOrder({
              ...base,
              mode: "pickup",
              fields: {
                scheduleType: f.scheduledFor ? "scheduled" : "asap",
                pickupAt: f.scheduledFor ?? null,
                recipientName: f.name ?? null,
                recipientPhone: f.phone ?? null,
                note: f.note ?? null,
              },
            })
          : await placeOrder({
              ...base,
              mode: "delivery",
              fields: {
                address: f.address ?? "",
                latitude: f.coords?.lat ?? null,
                longitude: f.coords?.lng ?? null,
                district: null,
                street: null,
                building: null,
                recipientName: f.name ?? "",
                recipientPhone: f.phone ?? "",
                scheduledFor: f.scheduledFor ?? null,
                note: f.note ?? null,
              },
            });

    return commerceJson({ orderId: result.orderId, state: result.state });
  } catch (e) {
    const head = String((e as Error)?.message ?? "").split(":")[0];
    const code = CHECKOUT_ERROR_CODES.has(head) ? head : "checkout_failed";
    return commerceJson({ error: code }, code === "checkout_failed" ? 400 : 422);
  }
});

export const OPTIONS = () => corsPreflight();
