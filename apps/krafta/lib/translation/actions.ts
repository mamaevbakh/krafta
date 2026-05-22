"use server";

/**
 * Server actions for the Localization Workbench.
 *
 * Used by the workbench UI (Slice 3 / KRA-92) and consumable by the future
 * AI assistant (KRA-95) as tool implementations.
 *
 * Locale management:
 *   - addCatalogLocale, disableCatalogLocale, enableCatalogLocale
 *   - updateCatalogLocale (rename — display_name only; locale code is
 *     immutable after creation to keep translation rows attached)
 *   - setDefaultCatalogLocale (locks one row as is_default; demotes the prior)
 *
 * Source-text edits:
 *   - updateItemSourceText — narrow item update from inside the translation
 *     workbench. Only touches name/description/image_alt; intentionally
 *     does NOT dispatch through the full update_item_with_variations
 *     super-RPC (price, slug, category, variations are out of scope here).
 *     The drift trigger on items recomputes current_source_hash on UPDATE,
 *     so existing translation rows automatically flip to "needs review."
 *
 * Translation queue:
 *   - enqueueTranslationJob(s) — bulk enqueue with quota check
 *   - cancelTranslationJob — mark a queued job as dead
 *
 * Translation rows:
 *   - applyAiTranslation — merchant marks an AI translation as accepted
 *   - updateTranslation — manual edit; flips is_ai_translated=false +
 *     last_edited_by=auth.uid(); writes a translation_history row
 *
 * All actions:
 *   - Validate inputs with Zod
 *   - Use the request-scoped Supabase client (authed user, RLS enforced)
 *   - Return { ok: true, ... } | { ok: false, error: string }
 *   - Revalidate cache tags on mutation
 *
 * Linear: KRA-91 (Slice 2 of KRA-89 epic).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { updateCatalogByIdAndSlug } from "@/lib/catalogs/revalidate";
import { checkQuota, ensureQuotaRow } from "@/lib/translation/quota";
import {
  ENTITY_KINDS,
  FIELDS_BY_ENTITY,
  type EntityKind,
} from "@/lib/translation/schemas";

// =============================================================================
// Shared validators
// =============================================================================

const uuidSchema = z.string().uuid();
const localeSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-zA-Z]{2,3}(-[A-Za-z]{2,4})?$/, "invalid locale code");
const entityKindSchema = z.enum(ENTITY_KINDS as readonly [
  EntityKind,
  ...EntityKind[],
]);

// =============================================================================
// Locale management
// =============================================================================

const addCatalogLocaleSchema = z.object({
  catalogId: uuidSchema,
  locale: localeSchema,
  displayName: z.string().min(1).max(120),
  textDirection: z.enum(["ltr", "rtl"]).default("ltr"),
  isDefault: z.boolean().default(false),
});

export async function addCatalogLocale(
  input: z.input<typeof addCatalogLocaleSchema>,
): Promise<{ ok: true; localeId: string } | { ok: false; error: string }> {
  const parsed = addCatalogLocaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }

  const supabase = await createClient();
  const { catalogId, locale, displayName, textDirection, isDefault } = parsed.data;

  // If marking as default, demote any other default in the same catalog.
  // RLS gates the catalog membership; an unauthorized caller's update
  // simply affects 0 rows.
  if (isDefault) {
    await supabase
      .from("catalog_locales")
      .update({ is_default: false })
      .eq("catalog_id", catalogId)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("catalog_locales")
    .insert({
      catalog_id: catalogId,
      locale,
      display_name: displayName,
      text_direction: textDirection,
      is_default: isDefault,
      is_enabled: true,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await updateCatalogByIdAndSlug({ catalogId });
  return { ok: true, localeId: data.id };
}

const toggleLocaleSchema = z.object({
  catalogId: uuidSchema,
  locale: localeSchema,
});

export async function disableCatalogLocale(
  input: z.input<typeof toggleLocaleSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = toggleLocaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("catalog_locales")
    .update({ is_enabled: false })
    .eq("catalog_id", parsed.data.catalogId)
    .eq("locale", parsed.data.locale);

  if (error) return { ok: false, error: error.message };

  await updateCatalogByIdAndSlug({ catalogId: parsed.data.catalogId });
  return { ok: true };
}

export async function enableCatalogLocale(
  input: z.input<typeof toggleLocaleSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = toggleLocaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("catalog_locales")
    .update({ is_enabled: true })
    .eq("catalog_id", parsed.data.catalogId)
    .eq("locale", parsed.data.locale);

  if (error) return { ok: false, error: error.message };

  await updateCatalogByIdAndSlug({ catalogId: parsed.data.catalogId });
  return { ok: true };
}

// =============================================================================
// Source-text edits — narrow item.name/description/image_alt update
// =============================================================================

const updateItemSourceTextSchema = z.object({
  catalogId: uuidSchema,
  itemId: uuidSchema,
  name: z.string().trim().min(1).max(500),
  description: z.string().trim().nullable().optional(),
  imageAlt: z.string().trim().nullable().optional(),
});

/**
 * Update an item's source text (name + description + image_alt) from the
 * translation workbench. Scoped narrowly:
 *   - Only the three translatable text fields. Price, slug, category,
 *     variations, photos stay out of bounds — those belong to the regular
 *     item editor.
 *   - Hits items table directly. Cheaper than dispatching through the
 *     update_item_with_variations RPC, which exists to keep variations
 *     atomic. Variations aren't touched here.
 *
 * Drift is intentional: the AFTER UPDATE trigger on items recomputes
 * current_source_hash; existing translation rows now disagree with the
 * new hash and surface as "needs review" everywhere they're listed. The
 * caller is responsible for telling the merchant how many translations
 * just went stale (see TranslationEditDialog).
 */
export async function updateItemSourceText(
  input: z.input<typeof updateItemSourceTextSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateItemSourceTextSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid input",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      image_alt: parsed.data.imageAlt ?? null,
    })
    .eq("id", parsed.data.itemId)
    // catalog_id pin defends against a tampered itemId pointing at an
    // item in a catalog the user can read but not write.
    .eq("catalog_id", parsed.data.catalogId);

  if (error) return { ok: false, error: error.message };

  await updateCatalogByIdAndSlug({ catalogId: parsed.data.catalogId });
  return { ok: true };
}

// =============================================================================
// Phase 2 source-text edits — generic update across the 4 non-item kinds
// =============================================================================

const updateEntitySourceTextSchema = z.object({
  catalogId: uuidSchema,
  entityKind: z.enum([
    "variation",
    "modifier",
    "modifier_list",
    "category",
    "catalog",
  ] as const),
  entityId: uuidSchema,
  /** Required. Trimmed; empty string fails validation. */
  name: z.string().trim().min(1).max(500),
  /** Optional. Only honored when the entity kind has a description column
   *  (currently `category` and `catalog`). Pass `null` to clear. */
  description: z.string().trim().nullable().optional(),
});

/**
 * Update a Phase 2 entity's source text (name, and `description` where the
 * entity has one). KRA-97 Gap 3: the entity translation edit dialog
 * previously left the source pane read-only with a "edit on the entity's
 * own page" note. Wiring this action makes the dialog symmetric with the
 * Items dialog — the merchant can correct a typo in the source row
 * without leaving the translation workbench.
 *
 * Scoped narrowly to the translatable text fields. Variation prices,
 * modifier prices, list min/max, category positions etc. stay out of
 * bounds — those belong to the regular entity editors. We dispatch
 * directly to the parent table (no super-RPC) because each kind has only
 * 1-2 mutable columns here and there are no child rows to keep atomic.
 *
 * Drift is intentional and matches updateItemSourceText: the AFTER
 * UPDATE trigger on each parent table recomputes current_source_hash;
 * existing translation rows now disagree with the new hash and surface
 * as "drift" in the table. The dialog already exposes a re-translate
 * button per locale so the merchant can immediately fan out.
 */
export async function updateEntitySourceText(
  input: z.input<typeof updateEntitySourceTextSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateEntitySourceTextSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "invalid input",
    };
  }
  const { catalogId, entityKind, entityId, name, description } = parsed.data;
  const supabase = await createClient();

  // Per-kind dispatch. The four parent tables share `name` but differ in
  // whether they carry `description` and on the catalog scope column
  // name. The catalog-id pin guards against tampered entityIds pointing
  // at an entity in a catalog the user can read but not write.
  let error: { message: string } | null;
  switch (entityKind) {
    case "category": {
      // catalog_categories has both name + description.
      const payload: Record<string, string | null> = { name };
      if (description !== undefined) {
        payload.description = description;
      }
      const res = await supabase
        .from("catalog_categories")
        .update(payload)
        .eq("id", entityId)
        .eq("catalog_id", catalogId);
      error = res.error;
      break;
    }
    case "modifier_list": {
      const res = await supabase
        .from("modifier_lists")
        .update({ name })
        .eq("id", entityId)
        .eq("catalog_id", catalogId);
      error = res.error;
      break;
    }
    case "modifier": {
      const res = await supabase
        .from("modifiers")
        .update({ name })
        .eq("id", entityId)
        .eq("catalog_id", catalogId);
      error = res.error;
      break;
    }
    case "variation": {
      const res = await supabase
        .from("item_variations")
        .update({ name })
        .eq("id", entityId)
        .eq("catalog_id", catalogId);
      error = res.error;
      break;
    }
    case "catalog": {
      // catalog meta has both name + description. The "entity" IS the
      // catalog, so entityId must equal catalogId — guard against tampering
      // by pinning both to the same value below.
      const payload: Record<string, string | null> = { name };
      if (description !== undefined) {
        payload.description = description;
      }
      const res = await supabase
        .from("catalogs")
        .update(payload)
        .eq("id", entityId)
        .eq("id", catalogId);
      error = res.error;
      break;
    }
  }

  if (error) return { ok: false, error: error.message };

  await updateCatalogByIdAndSlug({ catalogId });
  return { ok: true };
}

const updateCatalogLocaleSchema = z.object({
  catalogId: uuidSchema,
  locale: localeSchema,
  /** Whitespace-trimmed before persisting. Empty string fails validation. */
  displayName: z.string().trim().min(1).max(120),
});

/**
 * Rename a catalog locale. Only `display_name` is mutable — the locale
 * code itself is fixed at creation time so that translation rows and
 * drift hashes stay attached. Direction comes from the registry and
 * the enable/default flags have their own dedicated actions.
 */
export async function updateCatalogLocale(
  input: z.input<typeof updateCatalogLocaleSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateCatalogLocaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("catalog_locales")
    .update({ display_name: parsed.data.displayName })
    .eq("catalog_id", parsed.data.catalogId)
    .eq("locale", parsed.data.locale);

  if (error) return { ok: false, error: error.message };

  await updateCatalogByIdAndSlug({ catalogId: parsed.data.catalogId });
  return { ok: true };
}

// =============================================================================
// Translation queue
// =============================================================================

const enqueueSchema = z.object({
  catalogId: uuidSchema,
  targetLocale: localeSchema,
  entityKind: entityKindSchema,
  entityIds: z.array(uuidSchema).min(1).max(1000),
  /**
   * If true, re-queue rows even if they've been edited by a human
   * (is_ai_translated=false). Default false — protects merchant edits.
   * UI must show a confirmation dialog before enabling this.
   */
  force: z.boolean().default(false),
});

export type EnqueueResult =
  | {
      ok: true;
      enqueued: number;
      quotaRemaining: number;
      dailyQuota: number;
      skippedHumanEdited: number;
    }
  | {
      ok: false;
      error: "QUOTA_EXCEEDED" | string;
      quotaRemaining?: number;
      dailyQuota?: number;
      requested?: number;
    };

export async function enqueueTranslationJob(
  input: z.input<typeof enqueueSchema>,
): Promise<EnqueueResult> {
  const parsed = enqueueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const { catalogId, targetLocale, entityKind, entityIds, force } = parsed.data;
  const supabase = await createClient();

  // Soft quota check at enqueue time. Hard enforcement happens in the
  // worker (which won't process rows that exceed the quota).
  await ensureQuotaRow(supabase, catalogId);
  const quotaCheck = await checkQuota(supabase, {
    catalogId,
    requested: entityIds.length,
  });
  if (!quotaCheck.ok) {
    return {
      ok: false,
      error: quotaCheck.error,
      quotaRemaining: quotaCheck.quotaRemaining,
      dailyQuota: quotaCheck.dailyQuota,
      requested: quotaCheck.requested,
    };
  }

  // Filter out entities whose translation row is human-edited (unless force).
  //
  // Supabase JS doesn't narrow .from(<dynamic-string>) cleanly across the
  // 5 translation tables — all share the same {is_ai_translated, last_edited_by}
  // columns but have different FK names. We cast to a permissive shape;
  // the values flowing in are validated by translationTableFor() (typed
  // switch over EntityKind) and translationFkColumnFor() (same).
  let skippedHumanEdited = 0;
  let eligibleIds = entityIds;
  if (!force) {
    const fkColumn = translationFkColumnFor(entityKind);
    const tableName = translationTableFor(entityKind);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dynamicFrom = supabase.from(tableName as never) as any;
    const { data: existing } = await dynamicFrom
      .select(`${fkColumn}, is_ai_translated, last_edited_by`)
      .eq("locale", targetLocale)
      .in(fkColumn, entityIds);

    const humanEditedIds = new Set(
      ((existing ?? []) as Array<Record<string, unknown>>)
        .filter(
          (row) => !row.is_ai_translated && row.last_edited_by !== null,
        )
        .map((row) => row[fkColumn] as string),
    );
    skippedHumanEdited = humanEditedIds.size;
    eligibleIds = entityIds.filter((id) => !humanEditedIds.has(id));

    if (eligibleIds.length === 0) {
      return {
        ok: true,
        enqueued: 0,
        quotaRemaining: quotaCheck.quotaRemaining,
        dailyQuota: quotaCheck.dailyQuota,
        skippedHumanEdited,
      };
    }
  }

  // Idempotent bulk insert via ON CONFLICT.
  const rows = eligibleIds.map((entityId) => ({
    catalog_id: catalogId,
    target_locale: targetLocale,
    entity_kind: entityKind,
    entity_id: entityId,
    status: "queued" as const,
    next_attempt_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from("translation_jobs")
    .upsert(rows, {
      onConflict: "catalog_id,target_locale,entity_kind,entity_id",
      ignoreDuplicates: false,
    });

  if (insertError) return { ok: false, error: insertError.message };

  await updateCatalogByIdAndSlug({ catalogId });

  return {
    ok: true,
    enqueued: eligibleIds.length,
    quotaRemaining: quotaCheck.quotaRemaining - eligibleIds.length,
    dailyQuota: quotaCheck.dailyQuota,
    skippedHumanEdited,
  };
}

const cancelSchema = z.object({ jobId: uuidSchema });

export async function cancelTranslationJob(
  input: z.input<typeof cancelSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("translation_jobs")
    .update({
      status: "dead",
      error_text: "cancelled by user",
      completed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.jobId)
    .in("status", ["queued", "failed"]); // can't cancel running/done jobs

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// Translation row management
// =============================================================================

const applyAiSchema = z.object({
  entityKind: entityKindSchema,
  translationRowId: uuidSchema,
  /** true = accept the AI translation (clears the "needs review" badge);
   *  false = mark as needing more work (keeps is_ai_translated=true). */
  accept: z.boolean().default(true),
});

export async function applyAiTranslation(
  input: z.input<typeof applyAiSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = applyAiSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const { entityKind, translationRowId, accept } = parsed.data;
  const supabase = await createClient();

  const tableName = translationTableFor(entityKind);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  // Cast: dynamic table name across 5 translation tables that share the
  // {is_ai_translated, last_edited_by} columns. Table name is validated by
  // translationTableFor (typed switch over EntityKind).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dynamicFrom = supabase.from(tableName as never) as any;
  const { error } = await dynamicFrom
    .update({
      // Accepting means: this is now considered "good enough" — flip
      // is_ai_translated to false (no badge) and record who accepted it.
      is_ai_translated: accept ? false : true,
      last_edited_by: accept ? userId : null,
    })
    .eq("id", translationRowId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const updateTranslationSchema = z.object({
  entityKind: entityKindSchema,
  translationRowId: uuidSchema,
  fields: z.record(z.string(), z.union([z.string(), z.null()])),
});

// =============================================================================
// createTranslation — INSERT a fresh translation row when none exists yet
// =============================================================================
//
// Previously the workbench forced the merchant through "Translate with AI"
// before they could type a manual translation, because updateTranslation
// requires an existing translationRowId. That gate is the wrong default —
// a merchant who already speaks the target language should be able to type
// the translation directly. This action handles the "no row yet" branch.
//
// Semantics:
//   - Validates fields against FIELDS_BY_ENTITY[entityKind].
//   - Fetches the parent's current_source_hash and stores it on the new
//     row so drift detection starts in the "non-stale" state (we're
//     capturing the source the merchant just translated against).
//   - Marks the row is_ai_translated=false + last_edited_by=auth.uid()
//     since this IS a human edit by definition.
//   - Upsert on (entity_fk_column, locale) for idempotence — a parallel
//     AI run that wrote in the milliseconds between client check and
//     server insert won't crash this call.

const createTranslationSchema = z.object({
  catalogId: uuidSchema,
  entityKind: entityKindSchema,
  entityId: uuidSchema,
  locale: localeSchema,
  fields: z.record(z.string(), z.union([z.string(), z.null()])),
});

export async function createTranslation(
  input: z.input<typeof createTranslationSchema>,
): Promise<{ ok: true; translationRowId: string } | { ok: false; error: string }> {
  const parsed = createTranslationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const { catalogId, entityKind, entityId, locale, fields } = parsed.data;
  const supabase = await createClient();

  // Sanitize to the entity's known fields; reject empty `name`.
  const allowedFields = new Set(FIELDS_BY_ENTITY[entityKind]);
  const sanitized: Record<string, string | null> = {};
  for (const key of Object.keys(fields)) {
    if (allowedFields.has(key)) sanitized[key] = fields[key];
  }
  if (!sanitized.name || (sanitized.name as string).trim().length === 0) {
    return { ok: false, error: "name is required" };
  }

  // Pull parent's current_source_hash so the new row starts non-stale.
  // Same parent-table map the worker uses. Null is acceptable — the
  // parent's trigger may not have populated it yet (just-created row).
  const parentTable = parentTableFor(entityKind);
  const parentPkColumn = entityKind === "catalog" ? "id" : "id";
  // For non-catalog entities we additionally pin catalog_id to defend
  // against a tampered entityId pointing at an entity in another catalog.
  // Catalog kind doesn't carry a catalog_id column on itself (it IS the
  // catalog), so we pin id=entityId AND id=catalogId — both must match.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parentQuery = (supabase.from(parentTable as never) as any)
    .select("current_source_hash")
    .eq(parentPkColumn, entityId);
  if (entityKind === "catalog") {
    parentQuery.eq("id", catalogId);
  } else {
    parentQuery.eq("catalog_id", catalogId);
  }
  const { data: parentRow } = (await parentQuery.maybeSingle()) as {
    data: { current_source_hash: string | null } | null;
  };
  if (!parentRow) {
    return { ok: false, error: "parent row not found or access denied" };
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const tableName = translationTableFor(entityKind);
  const fkColumn = translationFkColumnFor(entityKind);

  // Cast: dynamic table name across 6 translation tables; the columns we
  // touch are shared across all of them. Table + FK names validated by
  // translationTableFor + translationFkColumnFor (typed switch).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dynamicFrom = supabase.from(tableName as never) as any;
  const { data: inserted, error } = await dynamicFrom
    .upsert(
      {
        [fkColumn]: entityId,
        locale,
        ...sanitized,
        source_hash: parentRow.current_source_hash ?? null,
        is_ai_translated: false,
        last_edited_by: userId,
      },
      { onConflict: `${fkColumn},locale` },
    )
    .select("id")
    .single();

  if (error) return { ok: false, error: (error as { message: string }).message };
  return { ok: true, translationRowId: (inserted as { id: string }).id };
}

export async function updateTranslation(
  input: z.input<typeof updateTranslationSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateTranslationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }
  const { entityKind, translationRowId, fields } = parsed.data;
  const supabase = await createClient();

  const allowedFields = new Set(FIELDS_BY_ENTITY[entityKind]);
  const sanitized: Record<string, string | null> = {};
  for (const key of Object.keys(fields)) {
    if (allowedFields.has(key)) sanitized[key] = fields[key];
  }
  if (Object.keys(sanitized).length === 0) {
    return { ok: false, error: "no valid fields to update" };
  }

  const tableName = translationTableFor(entityKind);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  // Cast: dynamic table name across 5 translation tables; columns shared.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dynamicFrom = supabase.from(tableName as never) as any;

  // Fetch the existing row to capture previous values for translation_history.
  // Select * because the column list is dynamic per entity_kind.
  const { data: prior } = (await dynamicFrom
    .select("*")
    .eq("id", translationRowId)
    .maybeSingle()) as { data: Record<string, unknown> | null };

  const { error } = await dynamicFrom
    .update({
      ...sanitized,
      is_ai_translated: false,
      last_edited_by: userId,
    })
    .eq("id", translationRowId);

  if (error) return { ok: false, error: (error as { message: string }).message };

  // Append history rows. Best-effort: don't fail the action on history
  // write failure since the translation update already succeeded.
  if (prior) {
    const priorLocale =
      typeof prior.locale === "string" ? prior.locale : "";
    const historyRows = Object.entries(sanitized)
      .filter(([key]) => prior[key] !== undefined)
      .map(([key]) => ({
        entity_kind: entityKind,
        translation_row_id: translationRowId,
        locale: priorLocale,
        field: key,
        previous_value: prior[key] as string | null,
        edited_by: userId,
        was_ai_edit: false,
      }));
    if (historyRows.length > 0) {
      await supabase.from("translation_history").insert(historyRows);
    }
  }

  return { ok: true };
}

// =============================================================================
// Internal helpers — table + FK column maps mirrored from the worker
// =============================================================================
//
// Keep in sync with TRANSLATION_TABLE in
// supabase/functions/translate-worker/index.ts. If we add a new entity
// kind, both maps need updating.

type TranslationTableName =
  | "item_translations"
  | "variation_translations"
  | "modifier_translations"
  | "modifier_list_translations"
  | "catalog_category_translations"
  | "catalog_translations";

function translationTableFor(entityKind: EntityKind): TranslationTableName {
  switch (entityKind) {
    case "item":
      return "item_translations";
    case "variation":
      return "variation_translations";
    case "modifier":
      return "modifier_translations";
    case "modifier_list":
      return "modifier_list_translations";
    case "category":
      return "catalog_category_translations";
    case "catalog":
      return "catalog_translations";
  }
}

type ParentTableName =
  | "items"
  | "item_variations"
  | "modifiers"
  | "modifier_lists"
  | "catalog_categories"
  | "catalogs";

function parentTableFor(entityKind: EntityKind): ParentTableName {
  switch (entityKind) {
    case "item":
      return "items";
    case "variation":
      return "item_variations";
    case "modifier":
      return "modifiers";
    case "modifier_list":
      return "modifier_lists";
    case "category":
      return "catalog_categories";
    case "catalog":
      return "catalogs";
  }
}

function translationFkColumnFor(entityKind: EntityKind): string {
  switch (entityKind) {
    case "item":
      return "item_id";
    case "variation":
      return "item_variation_id";
    case "modifier":
      return "modifier_id";
    case "modifier_list":
      return "modifier_list_id";
    case "category":
      return "category_id";
    case "catalog":
      // For catalog meta, the translation row's FK back to the parent
      // IS the catalog_id — there's no separate child entity.
      return "catalog_id";
  }
}
