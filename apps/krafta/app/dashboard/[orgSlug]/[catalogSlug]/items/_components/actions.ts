"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import {
  deleteSearchDocumentsBySourceIds,
  syncItemSearchDocuments,
} from "@/lib/catalogs/search-documents";
import { getUserSafely } from "@krafta/supabase/auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  ENABLED_CATALOG_ITEM_PRODUCT_TYPES,
  isCatalogItemProductType,
  type CatalogItemProductType,
} from "./product-types";

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

type ItemTypeRequestSummary = {
  counts: Partial<Record<CatalogItemProductType, number>>;
  requestedByCurrentUser: CatalogItemProductType[];
};

function isEnabledProductType(productType: CatalogItemProductType) {
  return (ENABLED_CATALOG_ITEM_PRODUCT_TYPES as readonly string[]).includes(
    productType,
  );
}

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

export async function createItem(params: {
  catalogId: string;
  catalogSlug: string;
  itemId?: string;
  categoryId: string;
  productType?: CatalogItemProductType;
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

  const productType = params.productType ?? "REGULAR";

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
      product_type: productType,
      name: baseName,
      slug,
      description: params.description ?? null,
      image_alt: params.imageAlt ?? null,
      position,
    })
    .select("id")
    .single();

  if (itemError || !item) {
    return { ok: false, error: itemError?.message ?? "Failed to create item." };
  }

  // Price now lives on the default item_variations row (Migration 1, ADR
  // 0001 §3.1). Every item must have exactly one default variation; the
  // partial unique index enforces uniqueness, the app enforces existence.
  const { error: variationError } = await supabase
    .from("item_variations")
    .insert({
      item_id: item.id,
      catalog_id: params.catalogId,
      name: "Default",
      price_cents: params.priceCents,
      is_default: true,
      ordinal: 0,
    });

  if (variationError) {
    return {
      ok: false,
      error: variationError.message ?? "Failed to create default variation.",
    };
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
  productType?: CatalogItemProductType;
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

  const productType = params.productType ?? "REGULAR";

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
      product_type: productType,
      description: params.description ?? null,
      image_alt: params.imageAlt ?? null,
    })
    .eq("id", params.itemId);

  if (itemError) {
    return { ok: false, error: itemError.message };
  }

  // Update price on the default item_variations row (Migration 1, ADR 0001
  // §3.1). Items created before Migration 1 had a Default variation
  // backfilled, so this UPDATE always finds a row.
  const { error: variationError } = await supabase
    .from("item_variations")
    .update({ price_cents: params.priceCents })
    .eq("item_id", params.itemId)
    .eq("is_default", true);

  if (variationError) {
    return { ok: false, error: variationError.message };
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

export async function getItemTypeRequestSummary(params: {
  catalogId: string;
}) {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);

  if (!user) {
    return { ok: false, error: "Unauthorized." } as const;
  }

  const { data, error } = await supabase
    .from("catalog_item_type_feature_requests")
    .select("product_type, requested_by_user_id")
    .eq("catalog_id", params.catalogId);

  if (error) {
    return { ok: false, error: error.message } as const;
  }

  const counts: Partial<Record<CatalogItemProductType, number>> = {};
  const requestedByCurrentUser = new Set<CatalogItemProductType>();

  for (const row of data ?? []) {
    const rawProductType = row.product_type;
    if (!rawProductType || !isCatalogItemProductType(rawProductType)) continue;
    counts[rawProductType] = (counts[rawProductType] ?? 0) + 1;
    if (row.requested_by_user_id === user.id) {
      requestedByCurrentUser.add(rawProductType);
    }
  }

  return {
    ok: true,
    summary: {
      counts,
      requestedByCurrentUser: [...requestedByCurrentUser],
    } satisfies ItemTypeRequestSummary,
  } as const;
}

export async function requestItemTypeFeature(params: {
  orgId: string;
  catalogId: string;
  productType: CatalogItemProductType;
}) {
  if (isEnabledProductType(params.productType)) {
    return {
      ok: false,
      error: "This product type is already supported.",
    } as const;
  }

  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);

  if (!user) {
    return { ok: false, error: "Unauthorized." } as const;
  }

  const { error: upsertError } = await supabase
    .from("catalog_item_type_feature_requests")
    .upsert(
      {
        org_id: params.orgId,
        catalog_id: params.catalogId,
        requested_by_user_id: user.id,
        product_type: params.productType,
        source: "create_item_type_modal",
      },
      {
        onConflict: "org_id,catalog_id,requested_by_user_id,product_type",
        ignoreDuplicates: true,
      },
    );

  if (upsertError) {
    return { ok: false, error: upsertError.message } as const;
  }

  const { count, error: countError } = await supabase
    .from("catalog_item_type_feature_requests")
    .select("id", { count: "exact", head: true })
    .eq("catalog_id", params.catalogId)
    .eq("product_type", params.productType);

  if (countError) {
    return { ok: false, error: countError.message } as const;
  }

  return {
    ok: true,
    productType: params.productType,
    count: count ?? 0,
  } as const;
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

// ============================================================================
// KRA-35 PR1 — Library Foundation: reorder + duplicate
// ============================================================================
//
// Thin wrappers around two Postgres RPCs introduced by migration
// 20260520040000_kra35_items_reorder_duplicate_rpcs.sql. Both functions are
// SECURITY INVOKER (default), so RLS gates which catalogs the caller can
// touch — these wrappers don't add a separate membership check.
//
// Why RPC and not a Promise.all of .update() calls: PostgREST has no
// cross-request transaction surface. A half-applied reorder leaves
// positions inconsistent (two items at position 3, gaps elsewhere) with
// no clean recovery — exactly the irreversible bug class D11 carves out
// safety against. Going through a function buys atomic semantics for
// effectively free (no test infra needed; one Postgres trip vs N).
//
// These actions ship in PR 1 (Foundation) with NO consumer — the Library
// Canvas (PR 2) wires drag-drop → reorderItems, and the Inspector (PR 2)
// wires duplicate → duplicateItem. Landing the actions isolated lets the
// migration get reviewed on its own merit before the canvas stacks on top.

export type ReorderItemsChange = {
  /** Item id to update. */
  id: string;
  /** New position within the (possibly new) category. */
  position: number;
  /** Set ONLY on cross-category drag. Omitted means category_id is
   *  unchanged. */
  category_id?: string;
};

/**
 * reorderItems — atomic batched reorder of items within a catalog.
 *
 * Calls the `public.reorder_items(p_catalog_id, p_changes)` RPC. The
 * function runs each UPDATE inside a single Postgres transaction; if
 * any row fails RLS, the whole call rolls back. The `bump_version`
 * trigger fires per row (BEFORE UPDATE FOR EACH ROW per KRA-54 §1) —
 * a 30-item batch produces 30 version bumps, which is the schema's
 * intentional behavior.
 *
 * Used by the Library Canvas's dnd-kit drop handler (desktop) and the
 * mobile long-press + arrow-button reorder UI (PR 2). Cross-category
 * drag passes the new category_id; same-category reorder omits it.
 */
export async function reorderItems(params: {
  catalogId: string;
  catalogSlug: string;
  changes: ReorderItemsChange[];
}) {
  if (!params.changes.length) {
    // No-op: nothing to reorder. Caller may filter empties before
    // calling; this is defensive.
    return { ok: true } as const;
  }

  const supabase = await createClient();

  // The RPC accepts jsonb; we pass the array as-is and Postgres validates
  // the shape per element ({ id, position, category_id? }). The Json
  // serializer accepts our ReorderItemsChange[] structurally.
  const { error } = await supabase.rpc("reorder_items", {
    p_catalog_id: params.catalogId,
    p_changes: params.changes as unknown as Database["public"]["Functions"]["reorder_items"]["Args"]["p_changes"],
  });

  if (error) {
    return { ok: false, error: error.message } as const;
  }

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true } as const;
}

/**
 * duplicateItem — atomic deep clone of an item.
 *
 * Calls the `public.duplicate_item(p_catalog_id, p_item_id)` RPC. The
 * function clones the items row + item_variations + item_modifier_lists
 * + item_translations + item_media rows in a single transaction. Default-
 * locale name gets a " (copy)" suffix; non-default translations clone
 * verbatim. Slug is uniquified with "-copy", "-copy-2", … to avoid
 * collisions with prior duplicates. Returns the new item_id so the
 * caller can scroll-to / select the clone in the Library Canvas.
 *
 * Media storage_path is SHARED between source and clone — no actual
 * file duplication, the Supabase Storage object is referenced by both
 * item_media rows. The existing `cleanupMediaStorage` helper removes
 * the file only when no remaining row references it (current behavior;
 * deletion of one item leaves files alone if other items still
 * reference them).
 */
export async function duplicateItem(params: {
  catalogId: string;
  catalogSlug: string;
  itemId: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("duplicate_item", {
    p_catalog_id: params.catalogId,
    p_item_id: params.itemId,
  });

  if (error) {
    return { ok: false, error: error.message } as const;
  }

  // The RPC returns the new item's uuid as a string (Supabase serializes
  // uuid as string).
  const newItemId = typeof data === "string" ? data : null;
  if (!newItemId) {
    return {
      ok: false,
      error: "duplicate_item returned no new item id",
    } as const;
  }

  // Sync search docs for the clone so it appears in search immediately.
  // The RPC clones translations but search indexing happens app-side
  // (syncItemSearchDocuments reads items + translations and upserts the
  // search row).
  await syncItemSearchDocuments({ itemId: newItemId, client: supabase });

  await updateCatalogByIdAndSlug({
    catalogId: params.catalogId,
    catalogSlug: params.catalogSlug,
  });

  return { ok: true, itemId: newItemId } as const;
}
