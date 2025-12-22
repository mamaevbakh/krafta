// lib/catalogs/data.ts
import { cacheTag } from "next/cache";
import type { Catalog, CategoryWithItems, Item, CatalogCategory } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseHeaders = {
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
};

export async function getCatalogBySlug(
  slug: string
): Promise<Catalog | null> {
  "use cache";
  cacheTag(`catalog:${slug}`, "catalogs");

  const url = `${supabaseUrl}/rest/v1/catalogs?slug=eq.${encodeURIComponent(
    slug,
  )}&select=*`;
  const response = await fetch(url, {
    headers: supabaseHeaders,
    cache: "force-cache",
  });

  if (!response.ok) return null;
  const data = (await response.json()) as Catalog[];
  const catalog = data[0] ?? null;
  if (catalog?.id) {
    cacheTag(`catalog:${catalog.id}`);
  }
  return catalog;
}

export async function getCatalogStructure(
  catalogId: string
): Promise<CategoryWithItems[]> {
  "use cache";
  cacheTag(`catalog:${catalogId}`, `catalog-structure:${catalogId}`);

  const categoriesUrl = `${supabaseUrl}/rest/v1/catalog_categories?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=*&order=position.asc`;
  const itemsUrl = `${supabaseUrl}/rest/v1/items?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=*&order=position.asc`;

  const [categoriesResponse, itemsResponse] = await Promise.all([
    fetch(categoriesUrl, {
      headers: supabaseHeaders,
      cache: "force-cache",
    }),
    fetch(itemsUrl, {
      headers: supabaseHeaders,
      cache: "force-cache",
    }),
  ]);

  if (!categoriesResponse.ok) return [];
  const categories = (await categoriesResponse.json()) as CatalogCategory[];

  if (!itemsResponse.ok) {
    return categories.map((category) => ({
      ...category,
      items: [],
    }));
  }
  const items = (await itemsResponse.json()) as Item[];

  const itemsByCategory = new Map<string, Item[]>();
  for (const item of items) {
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(item);
    itemsByCategory.set(item.category_id, list);
  }

  return categories.map((category) => ({
    ...category,
    items: itemsByCategory.get(category.id) ?? [],
  }));
}
