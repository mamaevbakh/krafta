import type { Tables } from "@/lib/supabase/types";

export type Catalog = Tables<"catalogs">;
export type CatalogCategory = Tables<"catalog_categories">;
export type ItemRow = Tables<"items">;

// Item shape carried through the app. price_cents is sourced from the
// item's default item_variations row (Migration 1, ADR 0001 §3.1).
// Fetchers embed item_variations(...) and flatten to this shape so
// components don't need to know about variations yet.
export type Item = ItemRow & {
  price_cents: number;
};

export type CategoryWithItems = CatalogCategory & {
  items: Item[];
};

export type PublicCatalog = Pick<
  Catalog,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "logo_path"
  | "org_id"
  | "tags"
  | "settings_layout"
  | "settings_currency"
  | "settings_behavior"
>;

export type PublicCatalogCategory = Pick<
  CatalogCategory,
  "id" | "slug" | "name" | "position"
>;

export type PublicItem = Pick<
  ItemRow,
  | "id"
  | "slug"
  | "category_id"
  | "name"
  | "description"
  | "image_path"
  | "image_alt"
  | "position"
> & {
  price_cents: number;
};

export type PublicCategoryWithItems = PublicCatalogCategory & {
  items: PublicItem[];
};
