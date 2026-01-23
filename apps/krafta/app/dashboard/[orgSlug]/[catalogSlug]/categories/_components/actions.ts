"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";

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
    const { data: existingTranslations, error: existingError } = await supabase
      .from("catalog_category_translations")
      .select("id, locale")
      .eq("category_id", params.categoryId);

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
        name: translation.name,
        description: translation.description,
      }));

    const inserts = translations
      .filter((translation) => !existingByLocale.has(translation.locale))
      .map((translation) => ({
        category_id: params.categoryId,
        locale: translation.locale,
        name: translation.name,
        description: translation.description,
      }));

    if (updates.length) {
      const updateResults = await Promise.all(
        updates.map((update) =>
          supabase
            .from("catalog_category_translations")
            .update({
              name: update.name,
              description: update.description,
            })
            .eq("id", update.id),
        ),
      );

      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) {
        return {
          ok: false,
          error:
            updateError.message ??
            "Failed to update category translations.",
        };
      }
    }

    if (inserts.length) {
      const { error: insertError } = await supabase
        .from("catalog_category_translations")
        .insert(inserts);

      if (insertError) {
        return {
          ok: false,
          error:
            insertError.message ??
            "Failed to insert category translations.",
        };
      }
    }
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true };
}
