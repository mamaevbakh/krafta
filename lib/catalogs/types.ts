import type { Tables } from "@/lib/supabase/types";

export type Catalog = Tables<"catalogs">;
export type CatalogCategory = Tables<"catalog_categories">;
export type Item = Tables<"items">;

export type CategoryWithItems = CatalogCategory & {
  items: Item[];
};