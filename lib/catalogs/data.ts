// lib/catalogs/data.ts
import { createClient } from "@/lib/supabase/server";
import type { Catalog, CategoryWithItems, Item, CatalogCategory } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getCatalogBySlug(
  slug: string
): Promise<Catalog | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalogs")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getCatalogStructure(
  catalogId: string
): Promise<CategoryWithItems[]> {
  const supabase = await createClient();

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
  if (categoriesError || !categories) return [];

  const { data: items, error: itemsError } = itemsResult;
  if (itemsError || !items) {
    return categories.map((c) => ({ ...c, items: [] }));
  }

  return categories.map((category) => ({
    ...category,
    items: items.filter((item) => item.category_id === category.id),
  }));
}