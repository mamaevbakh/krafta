"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
// syncCategorySearchDocuments removed as a caller — DB triggers handle
// the sync. deleteSearchDocumentsBySourceIds kept for delete cleanup.
import { deleteSearchDocumentsBySourceIds } from "@/lib/catalogs/search-documents";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CategoryTranslationInput = {
  locale: string;
  name: string;
  description?: string | null;
};

type StorageMediaRow = {
  bucket: string;
  storage_path: string;
};

function createAdminSupabaseClient() {
  const supabaseUrl =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.KRAFTA_SUPABASE_SECRET_KEY ?? process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function cleanupMediaStorage(rows: StorageMediaRow[]) {
  if (!rows.length) {
    return;
  }

  const adminClient = createAdminSupabaseClient();
  if (!adminClient) {
    return;
  }

  const groupedByBucket = rows.reduce<Record<string, string[]>>((acc, row) => {
    if (!acc[row.bucket]) {
      acc[row.bucket] = [];
    }
    acc[row.bucket].push(row.storage_path);
    return acc;
  }, {});

  await Promise.all(
    Object.entries(groupedByBucket).map(([bucket, paths]) =>
      adminClient.storage.from(bucket).remove(paths),
    ),
  );
}

export async function createCategory(params: {
  catalogId: string;
  catalogSlug: string;
  name: string;
  slug?: string;
  translations: CategoryTranslationInput[];
}) {
  const supabase = await createClient();

  const baseName = params.name.trim();
  if (!baseName) {
    return { ok: false, error: "Category name is required." };
  }

  const slug = slugify(params.slug?.trim() ?? baseName);
  if (!slug) {
    return { ok: false, error: "Category slug could not be generated." };
  }

  const { data: existingCategory } = await supabase
    .from("catalog_categories")
    .select("id")
    .eq("catalog_id", params.catalogId)
    .eq("slug", slug)
    .maybeSingle();

  if (existingCategory?.id) {
    return { ok: false, error: "This slug is already used in this catalog." };
  }

  const { data: lastCategory } = await supabase
    .from("catalog_categories")
    .select("position")
    .eq("catalog_id", params.catalogId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastCategory?.position ?? 0) + 1;

  const { data: category, error: categoryError } = await supabase
    .from("catalog_categories")
    .insert({
      catalog_id: params.catalogId,
      name: baseName,
      slug,
      position,
    })
    .select("id")
    .single();

  if (categoryError || !category) {
    return { ok: false, error: categoryError?.message ?? "Failed to create category." };
  }

  const translations = params.translations
    .map((translation) => ({
      ...translation,
      name: translation.name.trim(),
      description: translation.description?.trim() || null,
    }))
    .filter((translation) => translation.name.length > 0);

  if (translations.length) {
    const { error: translationError } = await supabase
      .from("catalog_category_translations")
      .insert(
        translations.map((translation) => ({
          category_id: category.id,
          locale: translation.locale,
          name: translation.name,
          description: translation.description,
        })),
      );

    if (translationError) {
      return {
        ok: false,
        error: translationError.message ?? "Failed to create category translations.",
      };
    }
  }

  // Search-document sync handled by the DB trigger on catalog_categories +
  // catalog_category_translations (KRA-90 patched the function the same way
  // KRA-88 patched the item version). App-level call was redundant and
  // caught the same duplicate-key bug — removed in lockstep with items.

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true, categoryId: category.id };
}

export async function updateCategory(params: {
  catalogId: string;
  catalogSlug: string;
  categoryId: string;
  name: string;
  slug?: string;
  translations: CategoryTranslationInput[];
}) {
  const supabase = await createClient();

  const baseName = params.name.trim();
  if (!baseName) {
    return { ok: false, error: "Category name is required." };
  }

  const slug = slugify(params.slug?.trim() ?? baseName);
  if (!slug) {
    return { ok: false, error: "Category slug could not be generated." };
  }

  const { data: existingCategory } = await supabase
    .from("catalog_categories")
    .select("id")
    .eq("catalog_id", params.catalogId)
    .eq("slug", slug)
    .neq("id", params.categoryId)
    .maybeSingle();

  if (existingCategory?.id) {
    return { ok: false, error: "This slug is already used in this catalog." };
  }

  const { error: categoryError } = await supabase
    .from("catalog_categories")
    .update({
      name: baseName,
      slug,
    })
    .eq("id", params.categoryId);

  if (categoryError) {
    return { ok: false, error: categoryError.message };
  }

  const translations = params.translations
    .map((translation) => ({
      ...translation,
      name: translation.name.trim(),
      description: translation.description?.trim() || null,
    }))
    .filter((translation) => translation.name.length > 0);

  if (translations.length) {
    // Single bulk UPSERT keyed on the (category_id, locale) UNIQUE
    // constraint. Same race-eliminating change applied to item_translations
    // in the items actions: parallel .update() via Promise.all creates one
    // transaction per row, each fires the search-sync trigger, the trigger's
    // DELETE+INSERT collides on catalog_search_documents_unique_source_in_catalog.
    // Collapsing to one .upsert() puts every row in one transaction.
    const upsertRows = translations.map((translation) => ({
      category_id: params.categoryId,
      locale: translation.locale,
      name: translation.name,
      description: translation.description,
    }));

    const { error: upsertError } = await supabase
      .from("catalog_category_translations")
      .upsert(upsertRows, { onConflict: "category_id,locale" });

    if (upsertError) {
      return {
        ok: false,
        error:
          upsertError.message ?? "Failed to save category translations.",
      };
    }
  }

  // Search-document sync via DB trigger — see createCategory above.

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true };
}

export async function deleteCategory(params: {
  catalogId: string;
  catalogSlug: string;
  categoryId: string;
}) {
  const supabase = await createClient();

  const { data: category, error: categoryError } = await supabase
    .from("catalog_categories")
    .select("id, catalog_id")
    .eq("id", params.categoryId)
    .eq("catalog_id", params.catalogId)
    .maybeSingle();

  if (categoryError || !category) {
    return { ok: false, error: categoryError?.message ?? "Category not found." };
  }

  const { data: categoryTranslations, error: categoryTranslationsError } =
    await supabase
      .from("catalog_category_translations")
      .select("id")
      .eq("category_id", category.id);

  if (categoryTranslationsError) {
    return { ok: false, error: categoryTranslationsError.message };
  }

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id")
    .eq("catalog_id", params.catalogId)
    .eq("category_id", category.id);

  if (itemsError) {
    return { ok: false, error: itemsError.message };
  }

  const itemIds = (items ?? []).map((item) => item.id);
  let itemTranslationIds: string[] = [];
  let mediaRows: StorageMediaRow[] = [];

  if (itemIds.length) {
    const { data: itemTranslations, error: itemTranslationsError } = await supabase
      .from("item_translations")
      .select("id")
      .in("item_id", itemIds);

    if (itemTranslationsError) {
      return { ok: false, error: itemTranslationsError.message };
    }

    itemTranslationIds = (itemTranslations ?? []).map((translation) => translation.id);

    const { data: media, error: mediaError } = await supabase
      .from("item_media")
      .select("bucket, storage_path")
      .in("item_id", itemIds);

    if (mediaError) {
      return { ok: false, error: mediaError.message };
    }

    mediaRows = media ?? [];
  }

  const sourceIds = [
    category.id,
    ...(categoryTranslations ?? []).map((translation) => translation.id),
    ...itemIds,
    ...itemTranslationIds,
  ];
  const deleteSearchDocsResult = await deleteSearchDocumentsBySourceIds({
    sourceIds,
    client: supabase,
  });
  if (!deleteSearchDocsResult.ok) {
    return { ok: false, error: deleteSearchDocsResult.error };
  }

  await cleanupMediaStorage(mediaRows);

  if (itemIds.length) {
    const { error: deleteItemMediaError } = await supabase
      .from("item_media")
      .delete()
      .in("item_id", itemIds);

    if (deleteItemMediaError) {
      return { ok: false, error: deleteItemMediaError.message };
    }

    const { error: deleteItemTranslationsError } = await supabase
      .from("item_translations")
      .delete()
      .in("item_id", itemIds);

    if (deleteItemTranslationsError) {
      return { ok: false, error: deleteItemTranslationsError.message };
    }

    const { error: deleteItemsError } = await supabase
      .from("items")
      .delete()
      .in("id", itemIds);

    if (deleteItemsError) {
      return { ok: false, error: deleteItemsError.message };
    }
  }

  const { error: deleteCategoryTranslationsError } = await supabase
    .from("catalog_category_translations")
    .delete()
    .eq("category_id", category.id);

  if (deleteCategoryTranslationsError) {
    return { ok: false, error: deleteCategoryTranslationsError.message };
  }

  const { error: deleteCategoryError } = await supabase
    .from("catalog_categories")
    .delete()
    .eq("id", category.id);

  if (deleteCategoryError) {
    return { ok: false, error: deleteCategoryError.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true, deletedItems: itemIds.length };
}
