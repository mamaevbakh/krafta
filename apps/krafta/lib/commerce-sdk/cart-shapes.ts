import "server-only";

import type { CartLineItem, CartSummary } from "@/lib/cart/orders";

import { getCommerceAdminClient } from "./client";

// Maps the engine cart shapes to the PUBLIC @krafta/commerce Cart contract.
// Mirror types kept local (same posture as public-shapes.ts) until the package
// is imported directly. Money stays in integer cents — the client renders it,
// never recomputes it.

export type ApiCurrency = { code: string; label: string };

export type ApiCartLine = {
  lineId: string;
  itemId: string;
  variationId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  modifiers: Array<{ name: string; priceCents: number }>;
};

export type ApiCart = {
  cartToken: string;
  lines: ApiCartLine[];
  subtotalCents: number;
  currency: ApiCurrency;
};

/** The catalog's display currency ({code,label}), matching getPublicCatalog. */
export async function getCatalogCurrency(
  catalogId: string,
): Promise<ApiCurrency> {
  const admin = getCommerceAdminClient();
  if (!admin) return { code: "UZS", label: "" };

  const { data } = await admin
    .from("catalogs")
    .select("settings_currency")
    .eq("id", catalogId)
    .maybeSingle();

  const currency = (data?.settings_currency ?? {}) as {
    defaultCurrency?: string;
    label?: string;
  };
  return {
    code: currency.defaultCurrency ?? "UZS",
    label: currency.label ?? "",
  };
}

function mapLine(line: CartLineItem): ApiCartLine {
  return {
    lineId: line.id,
    itemId: line.catalog_item_id ?? "",
    variationId: line.catalog_variation_id ?? "",
    name: line.name,
    qty: line.quantity,
    unitPriceCents: line.base_price_cents,
    lineTotalCents: line.total_price_cents,
    modifiers: line.modifiers.map((modifier) => ({
      name: modifier.name,
      priceCents: modifier.base_price_cents_delta,
    })),
  };
}

export function mapCartLines(summary: CartSummary): ApiCartLine[] {
  return summary.lineItems.map(mapLine);
}

export function mapCart(
  cartToken: string,
  summary: CartSummary,
  currency: ApiCurrency,
): ApiCart {
  return {
    cartToken,
    lines: mapCartLines(summary),
    subtotalCents: summary.subtotalCents,
    currency,
  };
}

/** An empty cart (no draft order yet) — what createCart returns. */
export function emptyCart(cartToken: string, currency: ApiCurrency): ApiCart {
  return { cartToken, lines: [], subtotalCents: 0, currency };
}
