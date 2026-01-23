import { createClient } from "@/lib/supabase/server";
import type { CatalogCategory } from "@/lib/catalogs/types";
import { CategoriesPanel } from "./_components/categories-panel";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardCategoriesPage({ params }: PageProps) {
  const { catalogSlug } = await params;

  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id")
    .eq("slug", catalogSlug)
    .maybeSingle();

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
    category_id: string;
    locale: string;
    name: string;
    description: string | null;
  }[] = [];
  if (catalog?.id) {
    const { data } = await supabase
      .from("catalog_categories")
      .select("id, catalog_id, name, slug, position, is_active, created_at")
      .eq("catalog_id", catalog.id)
      .order("position", { ascending: true });

    categories = (data ?? []) as CatalogCategory[];

    const { data: localeData } = await supabase
      .from("catalog_locales")
      .select("id, locale, is_default, is_enabled, sort_order")
      .eq("catalog_id", catalog.id)
      .order("sort_order", { ascending: true });

    locales = localeData ?? [];

    if (categories.length) {
      const { data: translationData } = await supabase
        .from("catalog_category_translations")
        .select("id, category_id, locale, name, description")
        .in(
          "category_id",
          categories.map((category) => category.id),
        );

      translations = translationData ?? [];
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
    <CategoriesPanel
      catalogId={catalog.id}
      catalogSlug={catalogSlug}
      categories={categories}
      locales={locales}
      translations={translations}
    />
  );
}
