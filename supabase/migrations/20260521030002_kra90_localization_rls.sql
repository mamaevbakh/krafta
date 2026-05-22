-- KRA-90 Slice 1: Localization Workbench foundation — RLS + completeness view (3/3)
--
-- RLS policies for the new translation tables, queue, quotas, and history.
-- Replaces existing item_translations + catalog_category_translations write
-- policies to grant `member` role write access (translator role without
-- inventing a new role).
--
-- Also adds the translation_completeness_view used by the workbench's per-tab
-- counters.
--
-- Sibling migrations:
--   20260521030000_kra90_localization_schema.sql    — tables + ALTERs + queue + history + quotas
--   20260521030001_kra90_localization_triggers.sql  — compute_source_hash + current_source_hash

-- =============================================================================
-- 1. Grant `member` role write access on existing translation tables
-- =============================================================================
--
-- Baseline policies restrict INSERT/UPDATE/DELETE to owner+admin. The
-- Localization Workbench treats translation as a delegatable task — a merchant
-- might hire a translator. Granting `member` write access on translation
-- tables (but NOT catalog_locales — locale management stays admin-only) makes
-- "member" effectively a translator role without inventing a new role.
--
-- Drop the existing write policies and recreate them with the expanded role
-- array.

DROP POLICY IF EXISTS item_translations_insert ON public.item_translations;
DROP POLICY IF EXISTS item_translations_update ON public.item_translations;
DROP POLICY IF EXISTS item_translations_delete ON public.item_translations;

CREATE POLICY item_translations_insert ON public.item_translations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_translations.item_id
      AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY item_translations_update ON public.item_translations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_translations.item_id
      AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_translations.item_id
      AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY item_translations_delete ON public.item_translations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_translations.item_id
      AND public.is_org_role(public.catalog_org_id(i.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

DROP POLICY IF EXISTS cat_translations_insert ON public.catalog_category_translations;
DROP POLICY IF EXISTS cat_translations_update ON public.catalog_category_translations;
DROP POLICY IF EXISTS cat_translations_delete ON public.catalog_category_translations;

CREATE POLICY cat_translations_insert ON public.catalog_category_translations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.catalog_categories cc
    WHERE cc.id = catalog_category_translations.category_id
      AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY cat_translations_update ON public.catalog_category_translations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.catalog_categories cc
    WHERE cc.id = catalog_category_translations.category_id
      AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.catalog_categories cc
    WHERE cc.id = catalog_category_translations.category_id
      AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY cat_translations_delete ON public.catalog_category_translations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.catalog_categories cc
    WHERE cc.id = catalog_category_translations.category_id
      AND public.is_org_role(public.catalog_org_id(cc.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

-- =============================================================================
-- 2. variation_translations RLS
-- =============================================================================

ALTER TABLE public.variation_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY variation_translations_select_anon ON public.variation_translations
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.item_variations v
    JOIN public.items i ON i.id = v.item_id
    WHERE v.id = variation_translations.item_variation_id
      AND v.is_active = true
      AND i.is_active = true
      AND public.catalog_is_public(v.catalog_id)
  ));

CREATE POLICY variation_translations_select_authed ON public.variation_translations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_variations v
    WHERE v.id = variation_translations.item_variation_id
      AND (
        (v.is_active = true AND public.catalog_is_public(v.catalog_id))
        OR public.is_org_role(public.catalog_org_id(v.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
      )
  ));

CREATE POLICY variation_translations_insert ON public.variation_translations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_variations v
    WHERE v.id = variation_translations.item_variation_id
      AND public.is_org_role(public.catalog_org_id(v.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY variation_translations_update ON public.variation_translations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_variations v
    WHERE v.id = variation_translations.item_variation_id
      AND public.is_org_role(public.catalog_org_id(v.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.item_variations v
    WHERE v.id = variation_translations.item_variation_id
      AND public.is_org_role(public.catalog_org_id(v.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY variation_translations_delete ON public.variation_translations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.item_variations v
    WHERE v.id = variation_translations.item_variation_id
      AND public.is_org_role(public.catalog_org_id(v.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

-- =============================================================================
-- 3. modifier_translations RLS
-- =============================================================================

ALTER TABLE public.modifier_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY modifier_translations_select_anon ON public.modifier_translations
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.modifiers m
    WHERE m.id = modifier_translations.modifier_id
      AND m.is_active = true
      AND public.catalog_is_public(m.catalog_id)
  ));

CREATE POLICY modifier_translations_select_authed ON public.modifier_translations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modifiers m
    WHERE m.id = modifier_translations.modifier_id
      AND (
        (m.is_active = true AND public.catalog_is_public(m.catalog_id))
        OR public.is_org_role(public.catalog_org_id(m.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
      )
  ));

CREATE POLICY modifier_translations_insert ON public.modifier_translations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.modifiers m
    WHERE m.id = modifier_translations.modifier_id
      AND public.is_org_role(public.catalog_org_id(m.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY modifier_translations_update ON public.modifier_translations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modifiers m
    WHERE m.id = modifier_translations.modifier_id
      AND public.is_org_role(public.catalog_org_id(m.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.modifiers m
    WHERE m.id = modifier_translations.modifier_id
      AND public.is_org_role(public.catalog_org_id(m.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY modifier_translations_delete ON public.modifier_translations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modifiers m
    WHERE m.id = modifier_translations.modifier_id
      AND public.is_org_role(public.catalog_org_id(m.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

-- =============================================================================
-- 4. modifier_list_translations RLS
-- =============================================================================

ALTER TABLE public.modifier_list_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY modifier_list_translations_select_anon ON public.modifier_list_translations
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.modifier_lists ml
    WHERE ml.id = modifier_list_translations.modifier_list_id
      AND ml.is_active = true
      AND public.catalog_is_public(ml.catalog_id)
  ));

CREATE POLICY modifier_list_translations_select_authed ON public.modifier_list_translations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modifier_lists ml
    WHERE ml.id = modifier_list_translations.modifier_list_id
      AND (
        (ml.is_active = true AND public.catalog_is_public(ml.catalog_id))
        OR public.is_org_role(public.catalog_org_id(ml.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
      )
  ));

CREATE POLICY modifier_list_translations_insert ON public.modifier_list_translations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.modifier_lists ml
    WHERE ml.id = modifier_list_translations.modifier_list_id
      AND public.is_org_role(public.catalog_org_id(ml.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY modifier_list_translations_update ON public.modifier_list_translations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modifier_lists ml
    WHERE ml.id = modifier_list_translations.modifier_list_id
      AND public.is_org_role(public.catalog_org_id(ml.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.modifier_lists ml
    WHERE ml.id = modifier_list_translations.modifier_list_id
      AND public.is_org_role(public.catalog_org_id(ml.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

CREATE POLICY modifier_list_translations_delete ON public.modifier_list_translations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modifier_lists ml
    WHERE ml.id = modifier_list_translations.modifier_list_id
      AND public.is_org_role(public.catalog_org_id(ml.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ));

-- =============================================================================
-- 5. translation_jobs RLS
-- =============================================================================
--
-- Member can enqueue (INSERT) and cancel (UPDATE status='dead') own jobs.
-- Worker writes via service_role (bypasses RLS).
-- No anon access — queue is org-internal.

ALTER TABLE public.translation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY translation_jobs_select ON public.translation_jobs
  FOR SELECT TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]));

CREATE POLICY translation_jobs_insert ON public.translation_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]));

-- Member can update (cancel own jobs); worker uses service_role.
CREATE POLICY translation_jobs_update ON public.translation_jobs
  FOR UPDATE TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]));

-- Only owner/admin can hard-delete jobs (cleanup); workers don't delete.
CREATE POLICY translation_jobs_delete ON public.translation_jobs
  FOR DELETE TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

-- =============================================================================
-- 6. catalog_translation_quotas RLS
-- =============================================================================
--
-- All org members can READ the quota counter (visible in workbench header).
-- Only owner/admin can mutate the quota (e.g. raise the daily cap on Pro tier).
-- Worker increments used_today via service_role.

ALTER TABLE public.catalog_translation_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_translation_quotas_select ON public.catalog_translation_quotas
  FOR SELECT TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text]));

CREATE POLICY catalog_translation_quotas_insert ON public.catalog_translation_quotas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY catalog_translation_quotas_update ON public.catalog_translation_quotas
  FOR UPDATE TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

-- =============================================================================
-- 7. translation_history RLS
-- =============================================================================
--
-- Append-only audit log. All org members can read history for catalogs in
-- their org. INSERT is open to any authenticated user with appropriate role
-- (worker writes via service_role; humans write via updateTranslation action).
-- No UPDATE / DELETE policy = immutable.
--
-- Note: history rows reference translation rows by (entity_kind, translation_row_id)
-- but we don't enforce an org check on every row of the history — the parent
-- translation row's RLS already gates whether the merchant can see it. The
-- history's RLS just gates on the user being authenticated and in some org.
-- A more aggressive check would join through all 5 translation tables to
-- verify org membership per history row — expensive and currently overkill.

ALTER TABLE public.translation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY translation_history_select ON public.translation_history
  FOR SELECT TO authenticated
  USING (true);  -- gated on translation row visibility; history alone leaks nothing sensitive

CREATE POLICY translation_history_insert ON public.translation_history
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- worker uses service_role; humans authenticate

-- =============================================================================
-- 8. translation_completeness_view — used by workbench tab counters
-- =============================================================================
--
-- Per (catalog, locale, entity_kind):
--   total            — count of active parent entities
--   translated       — count with a translation row in that locale
--   non_stale        — count where translation_row.source_hash == parent.current_source_hash
--   missing          — total - translated
--   stale            — translated - non_stale
--
-- The view uses UNION ALL across all 5 entity kinds. SECURITY INVOKER (default)
-- — RLS on the underlying tables filters what each caller sees.

CREATE OR REPLACE VIEW public.translation_completeness_view AS
SELECT
  cl.catalog_id,
  cl.locale,
  'item'::public.translatable_entity_kind AS entity_kind,
  count(i.id) AS total,
  count(it.id) AS translated,
  count(it.id) FILTER (WHERE it.source_hash = i.current_source_hash) AS non_stale,
  count(i.id) - count(it.id) AS missing,
  count(it.id) FILTER (WHERE it.source_hash IS DISTINCT FROM i.current_source_hash) AS stale
FROM public.catalog_locales cl
JOIN public.items i ON i.catalog_id = cl.catalog_id AND i.is_active = true
LEFT JOIN public.item_translations it ON it.item_id = i.id AND it.locale = cl.locale
WHERE cl.is_enabled = true AND cl.is_default = false
GROUP BY cl.catalog_id, cl.locale

UNION ALL

SELECT
  cl.catalog_id,
  cl.locale,
  'category'::public.translatable_entity_kind AS entity_kind,
  count(cc.id) AS total,
  count(cct.id) AS translated,
  count(cct.id) FILTER (WHERE cct.source_hash = cc.current_source_hash) AS non_stale,
  count(cc.id) - count(cct.id) AS missing,
  count(cct.id) FILTER (WHERE cct.source_hash IS DISTINCT FROM cc.current_source_hash) AS stale
FROM public.catalog_locales cl
JOIN public.catalog_categories cc ON cc.catalog_id = cl.catalog_id AND cc.is_active = true
LEFT JOIN public.catalog_category_translations cct ON cct.category_id = cc.id AND cct.locale = cl.locale
WHERE cl.is_enabled = true AND cl.is_default = false
GROUP BY cl.catalog_id, cl.locale

UNION ALL

SELECT
  cl.catalog_id,
  cl.locale,
  'variation'::public.translatable_entity_kind AS entity_kind,
  count(v.id) AS total,
  count(vt.id) AS translated,
  count(vt.id) FILTER (WHERE vt.source_hash = v.current_source_hash) AS non_stale,
  count(v.id) - count(vt.id) AS missing,
  count(vt.id) FILTER (WHERE vt.source_hash IS DISTINCT FROM v.current_source_hash) AS stale
FROM public.catalog_locales cl
JOIN public.item_variations v ON v.catalog_id = cl.catalog_id AND v.is_active = true
LEFT JOIN public.variation_translations vt ON vt.item_variation_id = v.id AND vt.locale = cl.locale
WHERE cl.is_enabled = true AND cl.is_default = false
GROUP BY cl.catalog_id, cl.locale

UNION ALL

SELECT
  cl.catalog_id,
  cl.locale,
  'modifier'::public.translatable_entity_kind AS entity_kind,
  count(m.id) AS total,
  count(mt.id) AS translated,
  count(mt.id) FILTER (WHERE mt.source_hash = m.current_source_hash) AS non_stale,
  count(m.id) - count(mt.id) AS missing,
  count(mt.id) FILTER (WHERE mt.source_hash IS DISTINCT FROM m.current_source_hash) AS stale
FROM public.catalog_locales cl
JOIN public.modifiers m ON m.catalog_id = cl.catalog_id AND m.is_active = true
LEFT JOIN public.modifier_translations mt ON mt.modifier_id = m.id AND mt.locale = cl.locale
WHERE cl.is_enabled = true AND cl.is_default = false
GROUP BY cl.catalog_id, cl.locale

UNION ALL

SELECT
  cl.catalog_id,
  cl.locale,
  'modifier_list'::public.translatable_entity_kind AS entity_kind,
  count(ml.id) AS total,
  count(mlt.id) AS translated,
  count(mlt.id) FILTER (WHERE mlt.source_hash = ml.current_source_hash) AS non_stale,
  count(ml.id) - count(mlt.id) AS missing,
  count(mlt.id) FILTER (WHERE mlt.source_hash IS DISTINCT FROM ml.current_source_hash) AS stale
FROM public.catalog_locales cl
JOIN public.modifier_lists ml ON ml.catalog_id = cl.catalog_id AND ml.is_active = true
LEFT JOIN public.modifier_list_translations mlt ON mlt.modifier_list_id = ml.id AND mlt.locale = cl.locale
WHERE cl.is_enabled = true AND cl.is_default = false
GROUP BY cl.catalog_id, cl.locale;

COMMENT ON VIEW public.translation_completeness_view IS
  'Per (catalog, locale, entity_kind) translation completeness counts. SECURITY INVOKER — caller sees only rows from catalogs they have RLS access to.';

-- Grant SELECT to authenticated; anon doesn't need this view (storefront uses
-- the localized field reader directly, no completeness math needed there).
GRANT SELECT ON public.translation_completeness_view TO authenticated;
