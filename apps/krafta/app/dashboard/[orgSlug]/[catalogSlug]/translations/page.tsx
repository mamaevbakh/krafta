import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TranslationsPanel } from "./_components/translations-panel";

/**
 * Localization Workbench — Phase 1 (KRA-92).
 *
 * Merchant-facing UI for managing translations across the catalog. Items tab
 * is the only enabled tab in Phase 1; Catalog / Categories / Variations /
 * Modifiers / Modifier Lists tabs render disabled with a "Coming in Phase 2"
 * tooltip (KRA-94 activates them).
 *
 * Server-side fetches everything the workbench needs in one render:
 *   - catalog identity + currency settings
 *   - all locales (default + non-default) with display_name + text_direction
 *   - all items + their existing translation rows (one per locale)
 *   - completeness counts per (locale, entity_kind) from the view
 *   - per-catalog daily quota row
 *
 * Cached via the standard catalog tag; mutates in client components bust the
 * tag via the existing updateCatalogByIdAndSlug helper in actions.ts.
 */

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function TranslationsPage({ params }: PageProps) {
  const { catalogSlug } = await params;
  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, org_id, name, slug")
    .eq("slug", catalogSlug)
    .maybeSingle();

  if (!catalog) {
    notFound();
  }

  // Independent reads, RLS gates each. Entity rows embed their translations
  // via PostgREST nested select so we don't pay a round-trip per entity kind.
  //
  // KRA-94 Phase 2 adds 4 new entity payloads (categories, variations,
  // modifiers, modifier lists) — each follows the same shape: source row +
  // nested *_translations array. Variations + modifiers carry a parent
  // context (item name / modifier-list name) so the merchant can
  // disambiguate "Small (Coffee) vs Small (Tea)" in the worktable.
  const [
    localesResponse,
    itemsResponse,
    categoriesResponse,
    variationsResponse,
    modifierListsResponse,
    modifiersResponse,
    completenessResponse,
    quotaResponse,
  ] = await Promise.all([
    supabase
      .from("catalog_locales")
      .select(
        "id, locale, is_default, is_enabled, sort_order, display_name, text_direction",
      )
      .eq("catalog_id", catalog.id)
      .order("is_default", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("locale", { ascending: true }),
    supabase
      .from("items")
      .select(
        `id, name, description, image_alt, is_active, position, current_source_hash,
         item_translations(id, locale, name, description, image_alt, is_ai_translated, last_edited_by, source_hash, updated_at)`,
      )
      .eq("catalog_id", catalog.id)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("catalog_categories")
      .select(
        `id, name, slug, position, is_active,
         catalog_category_translations(id, locale, name, description, is_ai_translated)`,
      )
      .eq("catalog_id", catalog.id)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("item_variations")
      .select(
        `id, name, ordinal, is_active, item_id,
         items!inner(name, is_active),
         variation_translations(id, locale, name, is_ai_translated)`,
      )
      .eq("catalog_id", catalog.id)
      .order("ordinal", { ascending: true }),
    supabase
      .from("modifier_lists")
      .select(
        `id, name, modifier_type, is_active,
         modifier_list_translations(id, locale, name, is_ai_translated)`,
      )
      .eq("catalog_id", catalog.id)
      .order("name", { ascending: true }),
    supabase
      .from("modifiers")
      .select(
        `id, name, ordinal, is_active, modifier_list_id,
         modifier_lists!inner(name),
         modifier_translations(id, locale, name, is_ai_translated)`,
      )
      .eq("catalog_id", catalog.id)
      .order("ordinal", { ascending: true }),
    supabase
      .from("translation_completeness_view")
      .select(
        "locale, entity_kind, total, translated, non_stale, missing, stale",
      )
      .eq("catalog_id", catalog.id),
    supabase
      .from("catalog_translation_quotas")
      .select("daily_quota, used_today, quota_reset_at")
      .eq("catalog_id", catalog.id)
      .maybeSingle(),
  ]);

  // Narrow text_direction string → "ltr" | "rtl" at the boundary. The DB
  // CHECK constraint guarantees one of those two values but Supabase typegen
  // surfaces it as plain string.
  const locales = (localesResponse.data ?? []).map((l) => ({
    ...l,
    text_direction:
      l.text_direction === "rtl" ? ("rtl" as const) : ("ltr" as const),
  }));

  // Flatten parent context into the entity rows so the worktable can show
  // "Small (Coffee)" without an extra join. The nested join shape is
  // `items: { name, is_active }` and `modifier_lists: { name }` per the
  // PostgREST select above.
  const variations = (variationsResponse.data ?? []).map((v) => {
    const parent = (v as { items: { name: string; is_active: boolean } | null })
      .items;
    return {
      id: v.id,
      name: v.name,
      description: null as string | null,
      context: parent?.name ?? null,
      // A variation is effectively inactive if its parent item is inactive
      // (the storefront doesn't show it either way), so collapse both into
      // one display flag here.
      is_active: v.is_active && (parent?.is_active ?? true),
      translations: (v.variation_translations ?? []).map((t) => ({
        id: t.id,
        locale: t.locale,
        name: t.name,
        description: null as string | null,
        is_ai_translated: t.is_ai_translated,
      })),
    };
  });

  const modifiers = (modifiersResponse.data ?? []).map((m) => {
    const parent = (m as { modifier_lists: { name: string } | null })
      .modifier_lists;
    return {
      id: m.id,
      name: m.name,
      description: null as string | null,
      context: parent?.name ?? null,
      is_active: m.is_active,
      translations: (m.modifier_translations ?? []).map((t) => ({
        id: t.id,
        locale: t.locale,
        name: t.name,
        description: null as string | null,
        is_ai_translated: t.is_ai_translated,
      })),
    };
  });

  const modifierLists = (modifierListsResponse.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    description: null as string | null,
    context: l.modifier_type === "text" ? "Free-text list" : null,
    is_active: l.is_active,
    translations: (l.modifier_list_translations ?? []).map((t) => ({
      id: t.id,
      locale: t.locale,
      name: t.name,
      description: null as string | null,
      is_ai_translated: t.is_ai_translated,
    })),
  }));

  const categories = (categoriesResponse.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: null as string | null,
    context: null,
    is_active: c.is_active,
    translations: (c.catalog_category_translations ?? []).map((t) => ({
      id: t.id,
      locale: t.locale,
      name: t.name,
      description: t.description,
      is_ai_translated: t.is_ai_translated,
    })),
  }));

  return (
    <TranslationsPanel
      catalogId={catalog.id}
      catalogSlug={catalog.slug}
      catalogName={catalog.name}
      locales={locales}
      items={itemsResponse.data ?? []}
      categories={categories}
      variations={variations}
      modifiers={modifiers}
      modifierLists={modifierLists}
      completeness={completenessResponse.data ?? []}
      quota={quotaResponse.data ?? null}
    />
  );
}
