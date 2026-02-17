import type { Tables } from "@/lib/supabase/types";

export type Catalog = Tables<"catalogs">;
export type CatalogCategory = Tables<"catalog_categories">;
export type Item = Tables<"items">;

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
>;

export type PublicCatalogCategory = Pick<
  CatalogCategory,
  "id" | "slug" | "name" | "position"
>;

export type PublicItem = Pick<
  Item,
  | "id"
  | "slug"
  | "category_id"
  | "name"
  | "description"
  | "price_cents"
  | "image_path"
  | "image_alt"
  | "position"
>;

export type PublicCategoryWithItems = PublicCatalogCategory & {
  items: PublicItem[];
};
