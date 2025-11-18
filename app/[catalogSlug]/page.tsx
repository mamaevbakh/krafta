// app/[catalogSlug]/page.tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { Skeleton } from "@/components/ui/skeleton";

type Catalog = Tables<"catalogs">;
type CatalogCategory = Tables<"catalog_categories">;
type Item = Tables<"items">;

type CatalogPageParams = {
  catalogSlug: string;
};

type CategoryWithItems = CatalogCategory & { items: Item[] };

async function getCatalogBySlug(slug: string) {
  const supabase = await createClient(); // keep await if your helper is async

  const { data, error } = await supabase
    .from("catalogs")
    .select("*") // full row type matches Tables<"catalogs">
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Catalog;
}

async function getCatalogStructure(catalogId: string): Promise<CategoryWithItems[]> {
  const supabase = await createClient();

  // Categories
  const { data: categories, error: categoriesError } = await supabase
    .from("catalog_categories")
    .select("*")
    .eq("catalog_id", catalogId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (categoriesError || !categories) {
    console.error("Error loading categories", categoriesError);
    return [];
  }

  // Items
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("*")
    .eq("catalog_id", catalogId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (itemsError || !items) {
    console.error("Error loading items", itemsError);
    return categories.map((c) => ({ ...c, items: [] }));
  }

  // Group items by category
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
}) {
  const { catalogSlug } = await params;

  const catalog = await getCatalogBySlug(catalogSlug);
  if (!catalog) {
    notFound();
  }

  const categoriesWithItems = await getCatalogStructure(catalog.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8 text-foreground">
      {/* Catalog header */}
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Catalog
        </p>
        <h1 className="text-2xl font-semibold">
          {catalog.name}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({catalog.slug})
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Simple public view of your catalog. Later we&apos;ll plug in themes,
          templates, and section builders on top of this data.
        </p>
      </header>

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
              <div className="space-y-2">
                {category.items.map((item) => {
  const imageUrl = getItemImageUrl(item);

  return (
    <div
      key={item.id}
      className="flex gap-3 rounded-xs border px-3 py-3"
    >
      {/* Image on the left (mobile) */}
      {imageUrl && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xs bg-muted">
          <Image
            src={imageUrl}
            alt={item.image_alt ?? item.name}
            fill
            className="object-cover"
          />
        </div>
      )}

      {/* Text + price */}
      <div className="flex flex-1 items-start gap-3">
        {/* Name + description */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 text-sm font-medium">
            {item.name}
          </span>
          {item.description && (
            <span className="mt-1 line-clamp-3 text-xs text-muted-foreground">
              {item.description}
            </span>
          )}
        </div>

        {/* Price – stays tight, doesn’t break layout */}
        <div className="ml-1 flex shrink-0 flex-col items-end">
          <span className="text-sm font-semibold leading-none whitespace-nowrap">
            $ {(item.price_cents / 100).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
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
        {[1, 2].map((cat) => (
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
