import { randomUUID } from "crypto";

import {
  commerceJson,
  corsPreflight,
  withCommerceKey,
} from "@/lib/commerce-sdk/route-helpers";
import { clientForCartToken } from "@/lib/commerce-sdk/cart-sessions";
import { getCatalogCurrency, mapCart } from "@/lib/commerce-sdk/cart-shapes";
import { upsertCartLines } from "@/lib/cart/upsert-cart-lines";
import { getVenueByCatalogId } from "@/lib/catalogs/data";

export const maxDuration = 30;

// The public client sends only ids + qty + selections — never prices. Map its
// ModifierSelection ({ modifierListId, modifierIds?, text? }) to the engine's
// per-modifier rows; the engine then re-reads every price from the catalog.
type ApiModifierSelection = {
  modifierListId?: unknown;
  modifierIds?: unknown;
  text?: unknown;
};

function toEngineModifiers(mods: unknown) {
  const out: Array<{
    modifierListId: string;
    modifierId: string | null;
    quantity: number;
    text_value: string | null;
  }> = [];
  if (!Array.isArray(mods)) return out;
  for (const raw of mods) {
    const m = raw as ApiModifierSelection;
    const listId = typeof m.modifierListId === "string" ? m.modifierListId : "";
    if (!listId) continue;
    if (typeof m.text === "string" && m.text.length > 0) {
      out.push({
        modifierListId: listId,
        modifierId: null,
        quantity: 1,
        text_value: m.text,
      });
    }
    if (Array.isArray(m.modifierIds)) {
      for (const id of m.modifierIds) {
        if (typeof id === "string" && id.length > 0) {
          out.push({
            modifierListId: listId,
            modifierId: id,
            quantity: 1,
            text_value: null,
          });
        }
      }
    }
  }
  return out;
}

// PUT /api/commerce/v1/carts/{token}/lines — absolute-quantity batch upsert. The
// engine re-reads every price server-side (a forged body price is ignored), runs
// the same RLS-scoped cart_apply_writes path as the storefront, and returns the
// re-priced cart. qty=0 removes a line.
export const PUT = withCommerceKey(async ({ key, params }, request) => {
  if (!key.catalogId) {
    return commerceJson({ error: "key_not_bound_to_catalog" }, 400);
  }
  const token = params ? (await params).token : undefined;
  if (!token) return commerceJson({ error: "not_found" }, 404);

  const body = (await request.json().catch(() => ({}))) as {
    lines?: unknown;
  };
  if (!Array.isArray(body.lines)) {
    return commerceJson({ error: "lines_required" }, 400);
  }

  const ctx = await clientForCartToken(token, key);
  if (!ctx) return commerceJson({ error: "cart_not_found" }, 404);

  const venue = await getVenueByCatalogId(ctx.catalogId);
  if (!venue) return commerceJson({ error: "venue_not_found" }, 404);

  const lines = body.lines.map((raw) => {
    const l = raw as {
      itemId?: unknown;
      variationId?: unknown;
      qty?: unknown;
      modifiers?: unknown;
    };
    return {
      itemId: typeof l.itemId === "string" ? l.itemId : "",
      variationId: typeof l.variationId === "string" ? l.variationId : "",
      qty: Number.isFinite(Number(l.qty)) ? Number(l.qty) : 0,
      modifiers: toEngineModifiers(l.modifiers),
    };
  });

  try {
    const summary = await upsertCartLines({
      orgId: ctx.orgId,
      venueId: venue.id,
      clientId: randomUUID(),
      lines,
      identity: ctx.identity,
      supabase: ctx.client,
    });
    const currency = await getCatalogCurrency(ctx.catalogId);
    return commerceJson(mapCart(token, summary, currency));
  } catch {
    // Bad item/variation/modifier selection (client-supplied) → 422, not a 500.
    // Money is never accepted from the body, so this can only be a bad reference.
    return commerceJson({ error: "invalid_cart_lines" }, 422);
  }
});

export const OPTIONS = () => corsPreflight();
