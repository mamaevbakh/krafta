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

  // Independent reads, RLS gates each. Items embed their translations via
  // PostgREST nested select so we don't pay a round-trip for translations.
  const [localesResponse, itemsResponse, completenessResponse, quotaResponse] =
    await Promise.all([
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

  return (
    <TranslationsPanel
      catalogId={catalog.id}
      catalogSlug={catalog.slug}
      catalogName={catalog.name}
      locales={locales}
      items={itemsResponse.data ?? []}
      completeness={completenessResponse.data ?? []}
      quota={quotaResponse.data ?? null}
    />
  );
}
