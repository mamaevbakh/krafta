import { Suspense, type JSX } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { Skeleton } from "@/components/ui/skeleton";

import { CatalogHeader } from "@/components/catalogs/catalog-header";

import { CatalogItemCard } from "@/components/catalogs/catalog-item-card";
import { MinimalCard } from "@/components/catalogs/minimal-card";
import { BigPhotoCard } from "@/components/catalogs/big-photo-card";
import { PhotoRowCard } from "@/components/catalogs/photo-row-card";



type CatalogCategory = Tables<"catalog_categories">;
type Item = Tables<"items">;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type CatalogPageParams = { catalogSlug: string; };
type Catalog = Tables<"catalogs">;
type CategoryWithItems = CatalogCategory & { items: Item[] };

async function getCatalogBySlug(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from("catalogs")
    .select("*") // full row type matches Tables<"catalogs">
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function getCatalogStructure(
  supabase: SupabaseClient,
  catalogId: string
): Promise<CategoryWithItems[]> {
  // Fire both queries in parallel:
  const [categoriesResult, itemsResult] = await Promise.all([
    supabase
      .from("catalog_categories")
      .select("*")
      .eq("catalog_id", catalogId)
      .eq("is_active", true)
      .order("position", { ascending: true }),

    supabase
      .from("items")
      .select("*")
      .eq("catalog_id", catalogId)
      .eq("is_active", true)
      .order("position", { ascending: true }),
  ]);

  const { data: categories, error: categoriesError } = categoriesResult;
  if (categoriesError || !categories) {
    console.error("Error loading categories", categoriesError);
    return [];
  }

  const { data: items, error: itemsError } = itemsResult;
  if (itemsError || !items) {
    console.error("Error loading items", itemsError);
    return categories.map((c) => ({ ...c, items: [] }));
  }

  const categoriesWithItems: CategoryWithItems[] = categories.map((category) => ({
    ...category,
    items: items.filter((item) => item.category_id === category.id),
  }));

  return categoriesWithItems;
}


export default function CatalogPage({
  params,
}: {
  params: Promise<CatalogPageParams>;
}) {
  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <CatalogPageContent params={params} />
    </Suspense>
  );
}
function getCatalogLogoUrl(catalog: Catalog) {
  if (!catalog.logo_path) return null;

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;

  return `${baseUrl}/storage/v1/object/public/krafta/${catalog.logo_path}`;
}



function getItemImageUrl(item: Item) {
  if (!item.image_path) return null;

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;

  // public bucket "krafta"
  return `${baseUrl}/storage/v1/object/public/krafta/${item.image_path}`;
}

async function CatalogPageContent({
  params,
}: {
  params: Promise<CatalogPageParams>;
}): Promise<JSX.Element> {
  const { catalogSlug } = await params;
 

  // 1) Create Supabase client once
  const supabase = await createClient();

  // 2) Use it in helpers
  const catalog = await getCatalogBySlug(supabase, catalogSlug);
  if (!catalog) {
    notFound();
  }

  const categoriesWithItems = await getCatalogStructure(supabase, catalog.id);

  // ... render

 const logoUrl = getCatalogLogoUrl(catalog);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8 text-foreground">
      {/* Catalog header */}
      
      <CatalogHeader
      catalogName={catalog.name}
      description={catalog.description}
      tags={catalog.tags}
      logoUrl={logoUrl}
  />
      {/* Categories & items */}
      <section className="space-y-8">
        {categoriesWithItems.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No categories or items in this catalog yet.
          </p>
        )}

        {categoriesWithItems.map((category) => (
          <div key={category.id} className="space-y-3">
            <h2 className="text-lg font-semibold">{category.name}</h2>

            {category.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No items in this category yet.
              </p>
            ) : (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                {category.items.map((item) => {
           const imageUrl = getItemImageUrl(item);
            return (
              <BigPhotoCard
                key={item.id}
                item={item}
                imageUrl={imageUrl}
              />
            );
  
})}


              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}

function CatalogPageFallback() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8 text-foreground">
      <header className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </header>

      <section className="space-y-6">
        {/* Fake categories */}
        {[1, 2, 3, 4, 5].map((cat) => (
          <div key={cat} className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
