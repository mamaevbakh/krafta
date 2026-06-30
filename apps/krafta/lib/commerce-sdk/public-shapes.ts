import "server-only";

import {
  getCatalogStructure,
  getCatalogTaxes,
  getVenueByCatalogId,
} from "@/lib/catalogs/data";
import type { PublicItem } from "@/lib/catalogs/types";
import { getCatalogAssetUrl } from "@/lib/catalogs/media";

import { getCommerceAdminClient } from "./client";

// Maps the internal storefront shapes to the PUBLIC @krafta/commerce response
// shapes (the client contract). The HTTP/JSON boundary decouples them, so these
// mirror types are intentionally local; keep them in sync with packages/commerce
// (follow-up: import the types directly once the package is wired into the app).
// Money stays in integer cents; the client renders it, never recomputes it.

type ApiVariation = {
  id: string;
  name: string;
  priceCents: number;
  isDefault: boolean;
  isSoldOut: boolean;
};

type ApiModifier = {
  id: string;
  name: string;
  priceCents: number;
  onByDefault: boolean;
};

type ApiModifierList = {
  id: string;
  name: string;
  type: "list" | "text";
  minSelected: number;
  maxSelected: number | null;
  textRequired: boolean;
  maxLength: number | null;
  modifiers: ApiModifier[];
};

type ApiItem = {
  id: string;
  slug: string | null;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  variations: ApiVariation[];
  modifierLists: ApiModifierList[];
};

type ApiCategory = {
  id: string;
  slug: string | null;
  name: string;
  items: ApiItem[];
};

type ApiTax = {
  id: string;
  name: string;
  kind: "tax" | "service_fee";
  inclusionType: "additive" | "included";
  /** Fraction (0.12 = 12%), matching the engine; the client formats it. */
  percentage: number;
};

type ApiCatalog = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: { code: string; label: string };
  orderModes: string[];
  categories: ApiCategory[];
  taxes: ApiTax[];
};

export type ApiSearchResult = {
  entityId: string;
  kind: "item" | "category";
  title: string;
  category: string | null;
  description: string | null;
  score: number;
};

function mapItem(item: PublicItem): ApiItem {
  return {
    id: item.id,
    slug: item.slug,
    categoryId: item.category_id,
    name: item.name,
    description: item.description,
    imageUrl: item.image_path ? getCatalogAssetUrl(item.image_path) : null,
    priceCents: item.price_cents,
    variations: item.variations.map((variation) => ({
      id: variation.id,
      name: variation.name,
      priceCents: variation.price_cents,
      isDefault: variation.is_default,
      isSoldOut: variation.is_sold_out,
    })),
    // Hidden lists (e.g. an auto-applied service charge) are applied by the
    // engine server-side and REJECT any client selection — the storefront's own
    // picker skips them, so the public API must not leak them either, or a
    // generated shop would send a selection the cart endpoint 422s on.
    modifierLists: item.modifier_lists
      .filter((list) => !list.hidden_from_customer)
      .map((list) => ({
        id: list.id,
        name: list.name,
        type: list.modifier_type,
        minSelected: list.min_selected,
        maxSelected: list.max_selected,
        textRequired: list.text_required,
        maxLength: list.max_length,
        modifiers: list.modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          priceCents: modifier.price_cents,
          onByDefault: modifier.on_by_default,
        })),
      })),
  };
}

export async function getPublicCatalog(catalogId: string): Promise<ApiCatalog | null> {
  const admin = getCommerceAdminClient();
  if (!admin) return null;

  const { data: catalog } = await admin
    .from("catalogs")
    .select("id, slug, name, description, settings_currency")
    .eq("id", catalogId)
    .maybeSingle();

  if (!catalog) return null;

  const [structure, taxes, venue] = await Promise.all([
    getCatalogStructure(catalogId),
    getCatalogTaxes(catalogId),
    getVenueByCatalogId(catalogId),
  ]);

  const currency = (catalog.settings_currency ?? {}) as {
    defaultCurrency?: string;
    label?: string;
  };

  return {
    id: catalog.id,
    slug: catalog.slug,
    name: catalog.name,
    description: catalog.description,
    currency: {
      code: currency.defaultCurrency ?? "UZS",
      label: currency.label ?? "",
    },
    orderModes: venue?.modes_enabled ?? [],
    categories: structure.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      items: category.items.map(mapItem),
    })),
    taxes: taxes.map((tax) => ({
      id: tax.id,
      name: tax.name,
      kind: tax.kind,
      inclusionType: tax.inclusion_type,
      percentage: tax.percentage,
    })),
  };
}

export async function getPublicItem(
  catalogId: string,
  idOrSlug: string,
): Promise<ApiItem | null> {
  const structure = await getCatalogStructure(catalogId);
  for (const category of structure) {
    for (const item of category.items) {
      if (item.id === idOrSlug || item.slug === idOrSlug) return mapItem(item);
    }
  }
  return null;
}

type SearchRow = {
  entity_id: string;
  source_table?: string | null;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  score?: number | null;
};

export function mapSearchRows(rows: SearchRow[]): ApiSearchResult[] {
  return rows.map((row) => ({
    entityId: row.entity_id,
    kind: (row.source_table ?? "").includes("categor") ? "category" : "item",
    title: row.title,
    category: row.subtitle ?? null,
    description: row.description ?? null,
    score: Number((row.score ?? 0).toFixed(4)),
  }));
}
