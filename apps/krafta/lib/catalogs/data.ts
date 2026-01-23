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
    next: {
      tags: [`catalog:${slug}`, "catalogs"],
    },
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

  const localesUrl = `${supabaseUrl}/rest/v1/catalog_locales?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_enabled=eq.true&select=locale,is_default,sort_order&order=sort_order.asc`;
  const categoriesUrl = `${supabaseUrl}/rest/v1/catalog_categories?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=*&order=position.asc`;
  const itemsUrl = `${supabaseUrl}/rest/v1/items?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=*&order=position.asc`;

  const [localesResponse, categoriesResponse, itemsResponse] = await Promise.all([
    fetch(localesUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
    fetch(categoriesUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
    fetch(itemsUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
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

  const locales = localesResponse.ok
    ? ((await localesResponse.json()) as Array<{
        locale: string;
        is_default: boolean;
      }>)
    : [];
  const defaultLocale =
    locales.find((locale) => locale.is_default)?.locale ??
    locales[0]?.locale ??
    null;

  const categoryIds = categories.map((category) => category.id);
  const itemIds = items.map((item) => item.id);

  const categoryTranslationUrl =
    defaultLocale && categoryIds.length
      ? `${supabaseUrl}/rest/v1/catalog_category_translations?locale=eq.${encodeURIComponent(
          defaultLocale,
        )}&category_id=in.(${categoryIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=category_id,name,description`
      : null;
  const itemTranslationUrl =
    defaultLocale && itemIds.length
      ? `${supabaseUrl}/rest/v1/item_translations?locale=eq.${encodeURIComponent(
          defaultLocale,
        )}&item_id=in.(${itemIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=item_id,name,description,image_alt`
      : null;
  const itemMediaUrl =
    itemIds.length
      ? `${supabaseUrl}/rest/v1/item_media?item_id=in.(${itemIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=item_id,storage_path,is_primary,position&order=position.asc`
      : null;

  const [categoryTranslationsResponse, itemTranslationsResponse, itemMediaResponse] =
    await Promise.all([
      categoryTranslationUrl
        ? fetch(categoryTranslationUrl, {
            headers: supabaseHeaders,
            next: {
              tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
            },
            cache: "force-cache",
          })
        : null,
      itemTranslationUrl
        ? fetch(itemTranslationUrl, {
            headers: supabaseHeaders,
            next: {
              tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
            },
            cache: "force-cache",
          })
        : null,
      itemMediaUrl
        ? fetch(itemMediaUrl, {
            headers: supabaseHeaders,
            next: {
              tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
            },
            cache: "force-cache",
          })
        : null,
    ]);

  const categoryTranslations =
    categoryTranslationsResponse?.ok
      ? ((await categoryTranslationsResponse.json()) as Array<{
          category_id: string;
          name: string | null;
          description: string | null;
        }>)
      : [];
  const itemTranslations =
    itemTranslationsResponse?.ok
      ? ((await itemTranslationsResponse.json()) as Array<{
          item_id: string;
          name: string | null;
          description: string | null;
          image_alt: string | null;
        }>)
      : [];
  const itemMedia =
    itemMediaResponse?.ok
      ? ((await itemMediaResponse.json()) as Array<{
          item_id: string;
          storage_path: string;
          is_primary: boolean;
          position: number;
        }>)
      : [];

  const categoryTranslationById = new Map(
    categoryTranslations.map((translation) => [
      translation.category_id,
      translation,
    ]),
  );
  const itemTranslationById = new Map(
    itemTranslations.map((translation) => [translation.item_id, translation]),
  );
  const mediaByItemId = new Map<string, string>();
  itemMedia.forEach((media) => {
    if (media.is_primary && !mediaByItemId.has(media.item_id)) {
      mediaByItemId.set(media.item_id, media.storage_path);
    }
  });

  const itemsByCategory = new Map<string, Item[]>();
  for (const item of items) {
    const translation = itemTranslationById.get(item.id);
    const mediaPath = item.image_path || mediaByItemId.get(item.id) || null;
    const mergedItem = {
      ...item,
      name: translation?.name ?? item.name,
      description: translation?.description ?? item.description,
      image_alt: translation?.image_alt ?? item.image_alt,
      image_path: mediaPath,
    };
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(mergedItem);
    itemsByCategory.set(item.category_id, list);
  }

  return categories.map((category) => {
    const translation = categoryTranslationById.get(category.id);
    return {
      ...category,
      name: translation?.name ?? category.name,
      items: itemsByCategory.get(category.id) ?? [],
    };
  });
}
