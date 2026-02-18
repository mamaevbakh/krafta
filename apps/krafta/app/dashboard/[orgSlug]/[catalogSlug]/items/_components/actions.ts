"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import {
  deleteSearchDocumentsBySourceIds,
  syncItemSearchDocuments,
} from "@/lib/catalogs/search-documents";
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

export type ItemTranslationInput = {
  locale: string;
  name: string;
  description?: string | null;
  image_alt?: string | null;
};

type StorageMediaRow = {
  bucket: string;
  storage_path: string;
};

function createAdminSupabaseClient() {
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

export async function createItem(params: {
  catalogId: string;
  catalogSlug: string;
  itemId?: string;
  categoryId: string;
  name: string;
  slug?: string;
  priceCents: number;
  description?: string | null;
  imageAlt?: string | null;
  translations: ItemTranslationInput[];
}) {
  const supabase = await createClient();

  const baseName = params.name.trim();
  if (!baseName) {
    return { ok: false, error: "Item name is required." };
  }

  if (!params.categoryId) {
    return { ok: false, error: "Category is required." };
  }

  const slug = slugify(params.slug?.trim() ?? baseName);
  if (!slug) {
    return { ok: false, error: "Item slug could not be generated." };
  }

  const { data: existingItem } = await supabase
    .from("items")
    .select("id")
    .eq("catalog_id", params.catalogId)
    .eq("slug", slug)
    .maybeSingle();

  if (existingItem?.id) {
    return { ok: false, error: "This slug is already used in this catalog." };
  }

  const { data: lastItem } = await supabase
    .from("items")
    .select("position")
    .eq("catalog_id", params.catalogId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (lastItem?.position ?? 0) + 1;

  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      id: params.itemId ?? undefined,
      catalog_id: params.catalogId,
      category_id: params.categoryId,
      name: baseName,
      slug,
      price_cents: params.priceCents,
      description: params.description ?? null,
      image_alt: params.imageAlt ?? null,
      position,
    })
    .select("id")
    .single();

  if (itemError || !item) {
    return { ok: false, error: itemError?.message ?? "Failed to create item." };
  }

  const translations = params.translations
    .map((translation) => ({
      ...translation,
      locale: translation.locale?.trim() ?? "",
      name: translation.name.trim(),
      description: translation.description?.trim() || null,
      image_alt: translation.image_alt?.trim() || null,
    }))
    .filter(
      (translation) =>
        translation.locale.length > 0 && translation.name.length > 0,
    );

  if (translations.length) {
    const { error: translationError } = await supabase
      .from("item_translations")
      .insert(
        translations.map((translation) => ({
          item_id: item.id,
          locale: translation.locale,
          name: translation.name,
          description: translation.description,
          image_alt: translation.image_alt,
        })),
      );

    if (translationError) {
      return {
        ok: false,
        error: translationError.message ?? "Failed to create item translations.",
      };
    }
  }

  await syncItemSearchDocuments({ itemId: item.id, client: supabase });

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true, itemId: item.id };
}

export async function updateItem(params: {
  catalogId: string;
  catalogSlug: string;
  itemId: string;
  categoryId: string;
  name: string;
  slug?: string;
  priceCents: number;
  description?: string | null;
  imageAlt?: string | null;
  translations: ItemTranslationInput[];
}) {
  const supabase = await createClient();

  const baseName = params.name.trim();
  if (!baseName) {
    return { ok: false, error: "Item name is required." };
  }

  if (!params.categoryId) {
    return { ok: false, error: "Category is required." };
  }

  const slug = slugify(params.slug?.trim() ?? baseName);
  if (!slug) {
    return { ok: false, error: "Item slug could not be generated." };
  }

  const { data: existingItem } = await supabase
    .from("items")
    .select("id")
    .eq("catalog_id", params.catalogId)
    .eq("slug", slug)
    .neq("id", params.itemId)
    .maybeSingle();

  if (existingItem?.id) {
    return { ok: false, error: "This slug is already used in this catalog." };
  }

  const { error: itemError } = await supabase
    .from("items")
    .update({
      name: baseName,
      slug,
      category_id: params.categoryId,
      price_cents: params.priceCents,
      description: params.description ?? null,
      image_alt: params.imageAlt ?? null,
    })
    .eq("id", params.itemId);

  if (itemError) {
    return { ok: false, error: itemError.message };
  }

  const translations = params.translations
    .map((translation) => ({
      ...translation,
      locale: translation.locale?.trim() ?? "",
      name: translation.name.trim(),
      description: translation.description?.trim() || null,
      image_alt: translation.image_alt?.trim() || null,
    }))
    .filter(
      (translation) =>
        translation.locale.length > 0 && translation.name.length > 0,
    );

  if (translations.length) {
    const { data: existingTranslations, error: existingError } = await supabase
      .from("item_translations")
      .select("id, locale")
      .eq("item_id", params.itemId);

    if (existingError) {
      return { ok: false, error: existingError.message };
    }

    const existingByLocale = new Map(
      (existingTranslations ?? []).map((row) => [row.locale, row.id]),
    );

    const updates = translations
      .filter((translation) => existingByLocale.has(translation.locale))
      .map((translation) => ({
        id: existingByLocale.get(translation.locale) as string,
        item_id: params.itemId,
        name: translation.name,
        description: translation.description,
        image_alt: translation.image_alt,
      }));

    const inserts = translations
      .filter((translation) => !existingByLocale.has(translation.locale))
      .map((translation) => ({
        item_id: params.itemId,
        locale: translation.locale,
        name: translation.name,
        description: translation.description,
        image_alt: translation.image_alt,
      }));

    if (updates.length) {
      const updateResults = await Promise.all(
        updates.map((update) =>
          supabase
            .from("item_translations")
            .update({
              name: update.name,
              description: update.description,
              image_alt: update.image_alt,
            })
            .eq("id", update.id),
        ),
      );

      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) {
        return {
          ok: false,
          error: updateError.message ?? "Failed to update item translations.",
        };
      }
    }

    if (inserts.length) {
      const { error: insertError } = await supabase
        .from("item_translations")
        .insert(inserts);

      if (insertError) {
        return {
          ok: false,
          error: insertError.message ?? "Failed to insert item translations.",
        };
      }
    }
  }

  await syncItemSearchDocuments({ itemId: params.itemId, client: supabase });

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true };
}

export async function deleteItem(params: {
  catalogId: string;
  catalogSlug: string;
  itemId: string;
}) {
  const supabase = await createClient();

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id, catalog_id")
    .eq("id", params.itemId)
    .eq("catalog_id", params.catalogId)
    .maybeSingle();

  if (itemError || !item) {
    return { ok: false, error: itemError?.message ?? "Item not found." };
  }

  const { data: translations, error: translationError } = await supabase
    .from("item_translations")
    .select("id")
    .eq("item_id", item.id);

  if (translationError) {
    return { ok: false, error: translationError.message };
  }

  const { data: mediaRows, error: mediaError } = await supabase
    .from("item_media")
    .select("id, bucket, storage_path")
    .eq("item_id", item.id);

  if (mediaError) {
    return { ok: false, error: mediaError.message };
  }

  const sourceIds = [item.id, ...(translations ?? []).map((row) => row.id)];
  const deleteSearchDocsResult = await deleteSearchDocumentsBySourceIds({
    sourceIds,
    client: supabase,
  });
  if (!deleteSearchDocsResult.ok) {
    return { ok: false, error: deleteSearchDocsResult.error };
  }

  await cleanupMediaStorage(
    (mediaRows ?? []).map((row) => ({
      bucket: row.bucket,
      storage_path: row.storage_path,
    })),
  );

  if (mediaRows?.length) {
    const { error: deleteMediaError } = await supabase
      .from("item_media")
      .delete()
      .eq("item_id", item.id);

    if (deleteMediaError) {
      return { ok: false, error: deleteMediaError.message };
    }
  }

  const { error: deleteTranslationsError } = await supabase
    .from("item_translations")
    .delete()
    .eq("item_id", item.id);

  if (deleteTranslationsError) {
    return { ok: false, error: deleteTranslationsError.message };
  }

  const { error: deleteItemError } = await supabase
    .from("items")
    .delete()
    .eq("id", item.id);

  if (deleteItemError) {
    return { ok: false, error: deleteItemError.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true };
}
