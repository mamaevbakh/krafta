import { createClient } from "@/lib/supabase/server";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
import { ItemsPanel } from "./_components/items-panel";

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
    const { data } = await supabase
      .from("items")
      .select(
        "id, catalog_id, category_id, name, slug, position, price_cents, description, image_path, image_alt, metadata, is_active, created_at",
      )
      .eq("catalog_id", catalog.id)
      .order("position", { ascending: true });

    items = (data ?? []) as Item[];

    const { data: categoryData } = await supabase
      .from("catalog_categories")
      .select("id, catalog_id, name, slug, position, is_active, created_at")
      .eq("catalog_id", catalog.id)
      .order("position", { ascending: true });

    categories = (categoryData ?? []) as CatalogCategory[];

    const { data: localeData } = await supabase
      .from("catalog_locales")
      .select("id, locale, is_default, is_enabled, sort_order")
      .eq("catalog_id", catalog.id)
      .order("sort_order", { ascending: true });

    locales = localeData ?? [];

    if (items.length) {
      const { data: translationData } = await supabase
        .from("item_translations")
        .select("id, item_id, locale, name, description, image_alt")
        .in(
          "item_id",
          items.map((item) => item.id),
        );

      translations = translationData ?? [];

      const { data: mediaData } = await supabase
        .from("item_media")
        .select(
          "id, item_id, bucket, storage_path, mime_type, kind, title, alt, position, is_primary",
        )
        .in(
          "item_id",
          items.map((item) => item.id),
        )
        .order("position", { ascending: true });

      media = mediaData ?? [];
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
    <ItemsPanel
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
