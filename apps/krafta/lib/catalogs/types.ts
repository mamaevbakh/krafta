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

export type PublicModifier = {
  id: string;
  name: string;
  price_cents: number;
  ordinal: number;
  on_by_default: boolean;
  version: number;
};

// Per-item view of a modifier_list, with overrides resolved against defaults.
// The `hidden_from_customer` flag lets the picker skip rendering while the
// server still applies on_by_default modifiers from the same list.
export type PublicModifierList = {
  id: string;
  name: string;
  modifier_type: "list" | "text";
  min_selected: number;
  max_selected: number | null;
  hidden_from_customer: boolean;
  ordinal: number;
  version: number;
  modifiers: PublicModifier[];
};

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
  modifier_lists: PublicModifierList[];
};

export type PublicCategoryWithItems = PublicCatalogCategory & {
  items: PublicItem[];
};

// Active taxes/service fees for a catalog, filtered to the v1-supported shape:
// applies_to='all_items', inclusion_type='additive', calculation_phase='subtotal'.
// The `kind` discriminator lets the UI label them distinctly ('Tax' vs
// 'Service fee') and lets reporting split the two.
export type PublicTax = {
  id: string;
  name: string;
  kind: "tax" | "service_fee";
  // Stored as a fraction (0.1200 = 12.00%). UI converts to display percentage.
  percentage: number;
  version: number;
};
