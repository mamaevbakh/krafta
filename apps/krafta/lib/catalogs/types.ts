import type { Tables } from "@/lib/supabase/types";

export type Catalog = Tables<"catalogs">;
export type CatalogCategory = Tables<"catalog_categories">;
export type ItemRow = Tables<"items">;
export type ItemVariationRow = Tables<"item_variations">;

// Subset of item_variations columns the admin UI (KRA-86) needs. We embed
// only what the EditorSheet's VariationsEditor consumes — pricing_type,
// sku, metadata, version, created_at, updated_at, is_active stay on the
// row but aren't surfaced through this projection. Keep this list tight
// so the page-level fetch payload doesn't bloat unnecessarily (per
// /plan-eng-review P2 budget).
export type ItemVariation = Pick<
  ItemVariationRow,
  | "id"
  | "item_id"
  | "catalog_id"
  | "name"
  | "price_cents"
  | "ordinal"
  | "is_default"
  | "is_sold_out"
>;

// Item shape carried through the app.
// - `price_cents` is the DEFAULT variation's price (legacy flatten, kept
//   on Item so LibraryRow / table view / customer-side don't need to
//   know about variations).
// - `variations` is the full array of variation rows for this item, in
//   ordinal order. Sourced from the same embed as price_cents (KRA-86).
//   EditorSheet's variations editor consumes this.
export type Item = ItemRow & {
  price_cents: number;
  variations: ItemVariation[];
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

// Translation rows attached to each translatable entity on the storefront.
// One row per active locale carried through render so components can call
// pickLocalizedField with the row + canonical defaults. The shape is the
// same as i18n.ts's TranslationRow — non-applicable fields are nulled
// (e.g. description=null for variations/modifiers, image_alt=null for
// categories) so consumers can use one helper uniformly.
export type PublicTranslationRow = {
  locale: string;
  name: string | null;
  description: string | null;
  image_alt: string | null;
};

export type PublicCatalogCategory = Pick<
  CatalogCategory,
  "id" | "slug" | "name" | "position"
> & {
  description?: string | null;
  translations: PublicTranslationRow[];
};

export type PublicModifier = {
  id: string;
  name: string;
  price_cents: number;
  ordinal: number;
  on_by_default: boolean;
  version: number;
  translations: PublicTranslationRow[];
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
  /** Text-mode only: when true, the customer MUST type a non-empty value. */
  text_required: boolean;
  /** Text-mode only: max character cap on the typed value. `null` = no limit. */
  max_length: number | null;
  hidden_from_customer: boolean;
  ordinal: number;
  version: number;
  modifiers: PublicModifier[];
  translations: PublicTranslationRow[];
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
  translations: PublicTranslationRow[];
};

export type PublicCategoryWithItems = PublicCatalogCategory & {
  items: PublicItem[];
};

// Active taxes/service fees for a catalog. v1 supports applies_to='all_items'
// + calculation_phase='subtotal'; the `inclusion_type` discriminator drives
// math + UI:
//   - additive: amount = subtotal * pct, added to the customer's total
//   - included: amount = subtotal * pct / (1 + pct), informational only
//     (the menu price already includes the tax — common for UZ VAT)
// The `kind` discriminator labels them ('Tax' / 'Service fee') and lets
// reporting split the two.
export type PublicTax = {
  id: string;
  name: string;
  kind: "tax" | "service_fee";
  inclusion_type: "additive" | "included";
  // Stored as a fraction (0.1200 = 12.00%). UI converts to display percentage.
  percentage: number;
  version: number;
};
