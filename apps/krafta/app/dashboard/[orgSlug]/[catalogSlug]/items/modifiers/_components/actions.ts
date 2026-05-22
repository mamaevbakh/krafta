"use server";

import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";

/**
 * Modifier-list CRUD server actions — KRA-85.
 *
 * Auth is enforced via RLS on the underlying tables (see
 * 20260507120000_kra54_item_variations_and_modifiers.sql §5). RLS write
 * policies require the caller to be an owner or admin of the catalog's
 * org via `is_org_role`. We don't re-check it here — single source of truth.
 *
 * Cache invalidation: every write that the storefront can read goes through
 * `updateCatalogByIdAndSlug`, which busts the per-catalog tag the public
 * pages use. Without that bust, the customer-facing menu reads stale
 * modifier names after a merchant edit (KRA-66 fix carries over here).
 *
 * One-row vs nested writes: the editor sheet batches list + modifiers
 * changes into one server-action call (`saveModifierList`) so a single
 * Save click is one round-trip. Per-row reorder is a separate compact
 * action (`reorderModifiers`) so the drag-end commit doesn't have to
 * re-send the whole list payload.
 */

// ============================================================================
// Types
// ============================================================================

export type ModifierKind = "list" | "text";

export type ModifierRowInput = {
  /** Stable client-side id for new rows (UUID). Omit for upserts that already
   *  have a server id; pass `id` from the DB for existing rows. */
  id?: string;
  name: string;
  price_cents: number;
  ordinal: number;
  on_by_default: boolean;
};

export type SaveModifierListInput = {
  catalogId: string;
  catalogSlug: string;
  /** Omit for create. */
  id?: string;
  name: string;
  internal_name?: string | null;
  modifier_type: ModifierKind;
  min_selected: number;
  max_selected: number | null;
  text_required: boolean;
  max_length: number | null;
  is_active: boolean;
  /** Only meaningful when modifier_type === 'list'. For 'text' lists, pass
   *  an empty array — any existing modifier rows are cleared (kind switched).
   *  Soft-deleted rows are NOT in here; the diff vs server runs in this
   *  action by comparing ids. */
  modifiers: ModifierRowInput[];
};

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ============================================================================
// saveModifierList — create OR update; nested modifiers diff'd server-side
// ============================================================================

export async function saveModifierList(
  input: SaveModifierListInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Modifier list name is required." };
  }

  if (
    input.modifier_type === "list" &&
    input.max_selected !== null &&
    input.max_selected < input.min_selected
  ) {
    return {
      ok: false,
      error: "Max selected must be greater than or equal to min selected.",
    };
  }

  if (
    input.modifier_type === "text" &&
    input.max_length !== null &&
    input.max_length <= 0
  ) {
    return { ok: false, error: "Max length must be a positive number." };
  }

  // --- 1. Upsert the parent list row ---
  let listId = input.id;
  if (listId) {
    const { error } = await supabase
      .from("modifier_lists")
      .update({
        name,
        internal_name: input.internal_name?.trim() || null,
        modifier_type: input.modifier_type,
        min_selected: Math.max(0, Math.floor(input.min_selected)),
        max_selected:
          input.max_selected === null ? null : Math.floor(input.max_selected),
        text_required: input.text_required,
        max_length:
          input.max_length === null ? null : Math.floor(input.max_length),
        is_active: input.is_active,
      })
      .eq("id", listId);
    if (error) {
      return { ok: false, error: error.message };
    }
  } else {
    const { data, error } = await supabase
      .from("modifier_lists")
      .insert({
        catalog_id: input.catalogId,
        name,
        internal_name: input.internal_name?.trim() || null,
        modifier_type: input.modifier_type,
        min_selected: Math.max(0, Math.floor(input.min_selected)),
        max_selected:
          input.max_selected === null ? null : Math.floor(input.max_selected),
        text_required: input.text_required,
        max_length:
          input.max_length === null ? null : Math.floor(input.max_length),
        is_active: input.is_active,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Failed to create list." };
    }
    listId = data.id;
  }

  // --- 2. Nested modifiers: diff vs server ---
  // We only touch modifiers when kind is 'list'. For 'text' lists, blow
  // away any pre-existing modifiers (the editor switched kinds; carrying
  // them would corrupt the kind invariant).
  if (input.modifier_type === "text") {
    const { error } = await supabase
      .from("modifiers")
      .delete()
      .eq("modifier_list_id", listId);
    if (error) {
      return { ok: false, error: error.message };
    }
  } else {
    // Fetch current modifiers to compute the delete set.
    const { data: existing, error: fetchError } = await supabase
      .from("modifiers")
      .select("id")
      .eq("modifier_list_id", listId);
    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }
    const existingIds = new Set((existing ?? []).map((r) => r.id));
    const incomingIds = new Set(
      input.modifiers.filter((m) => m.id).map((m) => m.id as string),
    );
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));

    // Delete first so unique (modifier_list_id, name) doesn't trip when a
    // merchant deletes "Small" then re-adds "Small" in the same save.
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("modifiers")
        .delete()
        .in("id", toDelete);
      if (error) {
        return { ok: false, error: error.message };
      }
    }

    // Upserts in ordinal order — keeps the partial-unique-index well-behaved.
    for (const row of input.modifiers) {
      const trimmed = row.name.trim();
      if (!trimmed) continue;
      if (row.id && existingIds.has(row.id)) {
        const { error } = await supabase
          .from("modifiers")
          .update({
            name: trimmed,
            price_cents: Math.max(0, Math.floor(row.price_cents)),
            ordinal: row.ordinal,
            on_by_default: row.on_by_default,
          })
          .eq("id", row.id);
        if (error) {
          return { ok: false, error: error.message };
        }
      } else {
        const { error } = await supabase.from("modifiers").insert({
          modifier_list_id: listId,
          catalog_id: input.catalogId,
          name: trimmed,
          price_cents: Math.max(0, Math.floor(row.price_cents)),
          ordinal: row.ordinal,
          on_by_default: row.on_by_default,
        });
        if (error) {
          return { ok: false, error: error.message };
        }
      }
    }
  }

  await updateCatalogByIdAndSlug({
    catalogId: input.catalogId,
    catalogSlug: input.catalogSlug,
  });

  return { ok: true, data: { id: listId } };
}

// ============================================================================
// deleteModifierList — RESTRICT-aware
// ============================================================================

export async function deleteModifierList(input: {
  catalogId: string;
  catalogSlug: string;
  modifierListId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();

  // Pre-check attachments so we can return a useful error instead of the
  // raw "violates foreign key constraint" string. We still rely on the DB
  // RESTRICT as the source of truth — a race here just means the merchant
  // sees the DB error message, which is acceptable.
  const { count, error: countError } = await supabase
    .from("item_modifier_lists")
    .select("item_id", { count: "exact", head: true })
    .eq("modifier_list_id", input.modifierListId);
  if (countError) {
    return { ok: false, error: countError.message };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Detach from ${count} item${count === 1 ? "" : "s"} first.`,
    };
  }

  const { error } = await supabase
    .from("modifier_lists")
    .delete()
    .eq("id", input.modifierListId);
  if (error) {
    return { ok: false, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: input.catalogId,
    catalogSlug: input.catalogSlug,
  });
  return { ok: true };
}

// ============================================================================
// reorderModifiers — compact endpoint for drag-end commits
// ============================================================================

export async function reorderModifiers(input: {
  catalogId: string;
  catalogSlug: string;
  modifierListId: string;
  /** Modifier ids in their new order. Ordinal = array index. */
  orderedIds: string[];
}): Promise<ActionResult> {
  const supabase = await createClient();

  // One UPDATE per row keeps it simple; modifier lists rarely have >20
  // rows. If this becomes a perf issue, swap to a single CASE statement
  // via RPC. The bump_version trigger fires on each UPDATE.
  for (let i = 0; i < input.orderedIds.length; i += 1) {
    const { error } = await supabase
      .from("modifiers")
      .update({ ordinal: i })
      .eq("id", input.orderedIds[i])
      .eq("modifier_list_id", input.modifierListId);
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  await updateCatalogByIdAndSlug({
    catalogId: input.catalogId,
    catalogSlug: input.catalogSlug,
  });
  return { ok: true };
}

// ============================================================================
// setModifierListActive — soft delete toggle
// ============================================================================

export async function setModifierListActive(input: {
  catalogId: string;
  catalogSlug: string;
  modifierListId: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("modifier_lists")
    .update({ is_active: input.isActive })
    .eq("id", input.modifierListId);
  if (error) {
    return { ok: false, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: input.catalogId,
    catalogSlug: input.catalogSlug,
  });
  return { ok: true };
}

// ============================================================================
// attachModifierListToItems — bulk attach
// ============================================================================

export async function attachModifierListToItems(input: {
  catalogId: string;
  catalogSlug: string;
  modifierListId: string;
  itemIds: string[];
}): Promise<ActionResult<{ attached: number }>> {
  const supabase = await createClient();

  if (input.itemIds.length === 0) {
    return { ok: true, data: { attached: 0 } };
  }

  // Upsert each pair so re-attaching an existing pair is a no-op rather
  // than a unique-constraint violation. The PK is (item_id, modifier_list_id),
  // so onConflict: "item_id,modifier_list_id" hits the right index.
  const rows = input.itemIds.map((itemId) => ({
    item_id: itemId,
    modifier_list_id: input.modifierListId,
    catalog_id: input.catalogId,
    is_active: true,
  }));

  const { error, data } = await supabase
    .from("item_modifier_lists")
    .upsert(rows, {
      onConflict: "item_id,modifier_list_id",
      ignoreDuplicates: false,
    })
    .select("item_id");
  if (error) {
    return { ok: false, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: input.catalogId,
    catalogSlug: input.catalogSlug,
  });
  return { ok: true, data: { attached: data?.length ?? input.itemIds.length } };
}

// ============================================================================
// detachModifierListFromItems — bulk detach
// ============================================================================

export async function detachModifierListFromItems(input: {
  catalogId: string;
  catalogSlug: string;
  modifierListId: string;
  itemIds: string[];
}): Promise<ActionResult> {
  const supabase = await createClient();

  if (input.itemIds.length === 0) {
    return { ok: true };
  }

  const { error } = await supabase
    .from("item_modifier_lists")
    .delete()
    .eq("modifier_list_id", input.modifierListId)
    .in("item_id", input.itemIds);
  if (error) {
    return { ok: false, error: error.message };
  }

  await updateCatalogByIdAndSlug({
    catalogId: input.catalogId,
    catalogSlug: input.catalogSlug,
  });
  return { ok: true };
}
