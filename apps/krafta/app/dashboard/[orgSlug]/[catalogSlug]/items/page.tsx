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
  if (catalog?.id) {
    const [itemsResponse, categoriesResponse, localesResponse] =
      await Promise.all([
        // Price is now sourced from the default item_variations row (Migration
        // 1, ADR 0001 §3.1). Embed it filtered to is_default=true; PostgREST
        // returns it as an array, we flatten below.
        supabase
          .from("items")
          .select(
            "id, catalog_id, category_id, product_type, name, slug, position, description, image_path, image_alt, metadata, is_active, created_at, updated_at, item_variations!inner(price_cents)",
          )
          .eq("catalog_id", catalog.id)
          .eq("item_variations.is_default", true)
          .eq("item_variations.is_active", true)
          .order("position", { ascending: true }),
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
      Omit<Item, "price_cents"> & {
        item_variations: Array<{ price_cents: number }>;
      }
    >;
    items = itemsRaw.map(({ item_variations, ...rest }) => ({
      ...rest,
      price_cents: item_variations[0]?.price_cents ?? 0,
    }));
    categories = (categoriesResponse.data ?? []) as CatalogCategory[];
    locales = localesResponse.data ?? [];

    if (items.length) {
      const itemIds = items.map((item) => item.id);
      const [translationsResponse, mediaResponse] = await Promise.all([
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
      ]);

      translations = translationsResponse.data ?? [];
      media = mediaResponse.data ?? [];
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
      currencySettings={currencySettings}
    />
  );
}
