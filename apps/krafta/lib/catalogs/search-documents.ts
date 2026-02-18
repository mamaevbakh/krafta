import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type SearchClient = SupabaseClient<Database>;
type SearchDocumentInsert =
  Database["public"]["Tables"]["catalog_search_documents"]["Insert"];

function getAdminSearchClient(): SearchClient | null {
  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function resolveSearchClient(fallbackClient: SearchClient): SearchClient {
  return getAdminSearchClient() ?? fallbackClient;
}

export async function deleteSearchDocumentsBySourceIds(params: {
  sourceIds: string[];
  client: SearchClient;
}) {
  const client = resolveSearchClient(params.client);
  const sourceIds = Array.from(
    new Set(params.sourceIds.map((id) => id.trim()).filter(Boolean)),
  );

  if (!sourceIds.length) {
    return { ok: true as const };
  }

  const { error } = await client
    .from("catalog_search_documents")
    .delete()
    .in("source_id", sourceIds);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

export async function syncCategorySearchDocuments(params: {
  categoryId: string;
  client: SearchClient;
}) {
  const client = resolveSearchClient(params.client);

  const { data: category, error: categoryError } = await client
    .from("catalog_categories")
    .select("id, catalog_id, name, slug")
    .eq("id", params.categoryId)
    .maybeSingle();

  if (categoryError) {
    return { ok: false as const, error: categoryError.message };
  }

  if (!category) {
    return { ok: true as const };
  }

  const { data: catalog, error: catalogError } = await client
    .from("catalogs")
    .select("id, org_id")
    .eq("id", category.catalog_id)
    .maybeSingle();

  if (catalogError || !catalog) {
    return {
      ok: false as const,
      error: catalogError?.message ?? "Catalog not found for category.",
    };
  }

  const { data: translations, error: translationError } = await client
    .from("catalog_category_translations")
    .select("id, locale, name, description")
    .eq("category_id", category.id);

  if (translationError) {
    return { ok: false as const, error: translationError.message };
  }

  const translationRows = translations ?? [];
  const sourceIds = [category.id, ...translationRows.map((row) => row.id)];
  const deleteResult = await deleteSearchDocumentsBySourceIds({
    sourceIds,
    client,
  });
  if (!deleteResult.ok) {
    return deleteResult;
  }

  const docs: SearchDocumentInsert[] = [
    {
      catalog_id: category.catalog_id,
      org_id: catalog.org_id,
      source_table: "catalog_categories",
      source_id: category.id,
      locale: null,
      title: category.name,
      subtitle: category.slug,
      description: null,
      tags: ["category"],
    },
    ...translationRows.map((translation) => ({
      catalog_id: category.catalog_id,
      org_id: catalog.org_id,
      source_table: "catalog_category_translations",
      source_id: translation.id,
      locale: translation.locale,
      title: translation.name,
      subtitle: category.slug,
      description: translation.description,
      tags: ["category", "translation"],
    })),
  ];

  const { error: insertError } = await client
    .from("catalog_search_documents")
    .insert(docs);

  if (insertError) {
    return { ok: false as const, error: insertError.message };
  }

  return { ok: true as const };
}

export async function syncItemSearchDocuments(params: {
  itemId: string;
  client: SearchClient;
}) {
  const client = resolveSearchClient(params.client);

  const { data: item, error: itemError } = await client
    .from("items")
    .select("id, catalog_id, category_id, name, slug, description")
    .eq("id", params.itemId)
    .maybeSingle();

  if (itemError) {
    return { ok: false as const, error: itemError.message };
  }

  if (!item) {
    return { ok: true as const };
  }

  const { data: catalog, error: catalogError } = await client
    .from("catalogs")
    .select("id, org_id")
    .eq("id", item.catalog_id)
    .maybeSingle();

  if (catalogError || !catalog) {
    return {
      ok: false as const,
      error: catalogError?.message ?? "Catalog not found for item.",
    };
  }

  const { data: category } = await client
    .from("catalog_categories")
    .select("name, slug")
    .eq("id", item.category_id)
    .maybeSingle();

  const { data: translations, error: translationError } = await client
    .from("item_translations")
    .select("id, locale, name, description")
    .eq("item_id", item.id);

  if (translationError) {
    return { ok: false as const, error: translationError.message };
  }

  const translationRows = translations ?? [];
  const sourceIds = [item.id, ...translationRows.map((row) => row.id)];
  const deleteResult = await deleteSearchDocumentsBySourceIds({
    sourceIds,
    client,
  });
  if (!deleteResult.ok) {
    return deleteResult;
  }

  const docs: SearchDocumentInsert[] = [
    {
      catalog_id: item.catalog_id,
      org_id: catalog.org_id,
      source_table: "items",
      source_id: item.id,
      locale: null,
      title: item.name,
      subtitle: category?.name ?? item.slug,
      description: item.description,
      tags: ["item", "catalog-item"],
    },
    ...translationRows.map((translation) => ({
      catalog_id: item.catalog_id,
      org_id: catalog.org_id,
      source_table: "item_translations",
      source_id: translation.id,
      locale: translation.locale,
      title: translation.name,
      subtitle: category?.name ?? item.slug,
      description: translation.description ?? item.description,
      tags: ["item", "translation", "catalog-item"],
    })),
  ];

  const { error: insertError } = await client
    .from("catalog_search_documents")
    .insert(docs);

  if (insertError) {
    return { ok: false as const, error: insertError.message };
  }

  return { ok: true as const };
}
