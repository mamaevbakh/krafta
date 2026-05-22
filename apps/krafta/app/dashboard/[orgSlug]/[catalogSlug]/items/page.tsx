import { createClient } from "@/lib/supabase/server";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
// KRA-35 PR3: LibraryRoot picks between Canvas (default) and Table view
// based on merchant's localStorage preference. Mobile always renders
// Canvas. Both views consume the same data shape this page fetches.
import { LibraryRoot } from "./_components/library-root";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardItemsPage({ params }: PageProps) {
  const { catalogSlug } = await params;

  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, org_id, pricing_config, settings_currency")
    .eq("slug", catalogSlug)
    .maybeSingle();

  const currencySettings = normalizeCurrencySettings(
    (catalog?.pricing_config ??
      catalog?.settings_currency ??
      {}) as Record<string, unknown>,
  );

  let items: Item[] = [];
  let categories: CatalogCategory[] = [];
  let locales: {
    id: string;
    locale: string;
    is_default: boolean;
    is_enabled: boolean;
    sort_order: number;
  }[] = [];
  let translations: {
    id: string;
    item_id: string;
    locale: string;
    name: string;
    description: string | null;
    image_alt: string | null;
  }[] = [];
  let media: {
    id: string;
    item_id: string;
    bucket: string;
    storage_path: string;
    mime_type: string | null;
    kind: "image" | "video";
    title: string | null;
    alt: string | null;
    position: number;
    is_primary: boolean;
  }[] = [];
  // KRA-85 follow-up — Square-inspired modifier UX.
  // The richer row preview ("Choco, Strawberry, Lemon" subtitle + min/max
  // chip) needs more than just the bare list rows, so we fetch:
  //   - modifier_lists with min/max + text-mode constraints + nested
  //     modifiers (name + ordinal + is_active) so the choice preview can
  //     render the first few names per attached list
  //   - item_modifier_lists carrying ordinal + per-item override columns
  //     (min_selected_override, max_selected_override,
  //     hidden_from_customer_override). The override columns let the
  //     editor's per-row settings tweak min/max for THIS item without
  //     touching the list's catalog-wide defaults — matches Square's
  //     "customize for this item" affordance.
  let modifierLists: {
    id: string;
    name: string;
    modifier_type: "list" | "text";
    min_selected: number;
    max_selected: number | null;
    text_required: boolean;
    max_length: number | null;
    is_active: boolean;
    modifiers: Array<{
      id: string;
      name: string;
      ordinal: number;
      is_active: boolean;
    }>;
  }[] = [];
  let itemModifierLists: {
    item_id: string;
    modifier_list_id: string;
    ordinal: number;
    min_selected_override: number | null;
    max_selected_override: number | null;
    hidden_from_customer_override: boolean;
  }[] = [];
  if (catalog?.id) {
    const [itemsResponse, categoriesResponse, localesResponse] =
      await Promise.all([
        // KRA-86 — embed the FULL item_variations array per item, ordered
        // by ordinal. The legacy `!inner` + is_default filter is dropped:
        // the EditorSheet's variations editor needs every variation row,
        // and the LibraryRow / table view still derive the headline price
        // via variations.find(v => v.is_default)?.price_cents in the
        // flatten step below.
        //
        // Payload cost (per /plan-eng-review P2): ~80 bytes per variation
        // row. 50 items × 3 variations ≈ 12 KB bump. Trivial vs the
        // multi-MB image payload already in flight.
        supabase
          .from("items")
          .select(
            "id, catalog_id, category_id, product_type, name, slug, position, description, image_path, image_alt, metadata, is_active, created_at, updated_at, item_variations(id, item_id, catalog_id, name, price_cents, ordinal, is_default, is_sold_out, is_active)",
          )
          .eq("catalog_id", catalog.id)
          .eq("item_variations.is_active", true)
          .order("position", { ascending: true })
          .order("ordinal", { referencedTable: "item_variations", ascending: true }),
        supabase
          .from("catalog_categories")
          .select("id, catalog_id, name, slug, position, is_active, created_at")
          .eq("catalog_id", catalog.id)
          .order("position", { ascending: true }),
        supabase
          .from("catalog_locales")
          .select("id, locale, is_default, is_enabled, sort_order")
          .eq("catalog_id", catalog.id)
          .order("sort_order", { ascending: true }),
      ]);

    const itemsRaw = (itemsResponse.data ?? []) as Array<
      Omit<Item, "price_cents" | "variations"> & {
        item_variations: Array<{
          id: string;
          item_id: string;
          catalog_id: string;
          name: string;
          price_cents: number;
          ordinal: number;
          is_default: boolean;
          is_sold_out: boolean;
          is_active: boolean;
        }>;
      }
    >;
    items = itemsRaw.map(({ item_variations, ...rest }) => {
      const variations = item_variations ?? [];
      // Default price = the one row with is_default=true. Fallback to 0
      // for any item with a data bug (no default), so LibraryRow keeps
      // rendering "0 sum" instead of NaN.
      const defaultPrice =
        variations.find((v) => v.is_default)?.price_cents ?? 0;
      return {
        ...rest,
        price_cents: defaultPrice,
        variations: variations.map((v) => ({
          id: v.id,
          item_id: v.item_id,
          catalog_id: v.catalog_id,
          name: v.name,
          price_cents: v.price_cents,
          ordinal: v.ordinal,
          is_default: v.is_default,
          is_sold_out: v.is_sold_out,
        })),
      };
    });
    categories = (categoriesResponse.data ?? []) as CatalogCategory[];
    locales = localesResponse.data ?? [];

    if (items.length) {
      const itemIds = items.map((item) => item.id);
      // KRA-85 follow-up: fetch the catalog's modifier_lists +
      // item_modifier_lists snapshot in the same wave. The editor uses
      // both to render the ModifierListsPicker (available options +
      // currently-attached state). Cheap because list counts per catalog
      // are typically <30.
      const [
        translationsResponse,
        mediaResponse,
        modifierListsResponse,
        itemModifierListsResponse,
      ] = await Promise.all([
        supabase
          .from("item_translations")
          .select("id, item_id, locale, name, description, image_alt")
          .in("item_id", itemIds),
        supabase
          .from("item_media")
          .select(
            "id, item_id, bucket, storage_path, mime_type, kind, title, alt, position, is_primary",
          )
          .in("item_id", itemIds)
          .order("position", { ascending: true }),
        supabase
          .from("modifier_lists")
          .select(
            `id, name, modifier_type, min_selected, max_selected,
             text_required, max_length, is_active,
             modifiers!modifiers_modifier_list_id_fkey(id, name, ordinal, is_active)`,
          )
          .eq("catalog_id", catalog.id)
          .order("name", { ascending: true })
          .order("ordinal", { referencedTable: "modifiers", ascending: true }),
        supabase
          .from("item_modifier_lists")
          .select(
            `item_id, modifier_list_id, ordinal,
             min_selected_override, max_selected_override,
             hidden_from_customer_override`,
          )
          .eq("catalog_id", catalog.id)
          .eq("is_active", true)
          .in("item_id", itemIds)
          .order("ordinal", { ascending: true }),
      ]);

      translations = translationsResponse.data ?? [];
      media = mediaResponse.data ?? [];
      modifierLists = modifierListsResponse.data ?? [];
      itemModifierLists = itemModifierListsResponse.data ?? [];
    }
  }

  if (!catalog?.id) {
    return (
      <main className="w-full">
        <div className="mx-auto max-w-[1248px] px-6 py-8">
          <p className="text-sm text-muted-foreground">
            Catalog not found.
          </p>
        </div>
      </main>
    );
  }

  return (
    <LibraryRoot
      catalogId={catalog.id}
      catalogSlug={catalogSlug}
      orgId={catalog.org_id}
      categories={categories}
      items={items}
      locales={locales}
      translations={translations}
      media={media}
      modifierLists={modifierLists}
      itemModifierLists={itemModifierLists}
      currencySettings={currencySettings}
    />
  );
}
