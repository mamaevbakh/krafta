-- KRA-98: Catalog meta translation (catalog name + description)
--
-- Closes the last gap in the translation pipeline. Phase 2 (KRA-94) shipped
-- four entity tabs but the Catalog tab stayed disabled with a "Soon"
-- placeholder because Phase 2 spec said "only wire if a merchant asks for
-- it." A merchant has — so wire it.
--
-- Mirrors the KRA-90 pattern for the four Phase 2 kinds:
--   1. catalog_translations table (id, catalog_id, locale, name, description,
--      source_hash, is_ai_translated, last_edited_by, timestamps).
--   2. current_source_hash column on catalogs + BEFORE INSERT/UPDATE trigger
--      that hashes name + description.
--   3. RLS — anon SELECT for storefront, member CRUD for the workbench.
--   4. translatable_entity_kind enum gets 'catalog'.
--   5. translation_completeness_view extended with a catalog branch.
--
-- After this migration:
--   - The workbench's Catalog tab can be enabled.
--   - The AI worker handler for entity_kind='catalog' (added separately
--     in supabase/functions/translate-worker/index.ts) can write rows.
--   - The storefront can pickLocalizedField against catalog_translations
--     to render the right name + description per active locale.

-- =============================================================================
-- 1. ENUM extension
-- =============================================================================
--
-- Moved to the companion 20260522110000_kra98_catalog_translations_enum.sql
-- migration. Postgres rejects any reference to a newly-ADDed enum value
-- inside the same transaction (SQLSTATE 55P04 "unsafe use of new value"),
-- and the view at the bottom of this file references
-- `'catalog'::public.translatable_entity_kind`. Splitting the ALTER TYPE
-- into a standalone file lets that statement commit first, so by the time
-- this file runs `'catalog'` is a usable enum literal.

-- =============================================================================
-- 2. catalog_translations table
-- =============================================================================
--
-- Shape matches the KRA-90 Phase 2 tables (variation_translations etc).
-- name is the only required column; description nullable like categories.

CREATE TABLE public.catalog_translations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id        uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  name              text        NOT NULL,
  description       text,
  source_hash       bytea,
  is_ai_translated  boolean     NOT NULL DEFAULT false,
  last_edited_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, locale)
);
CREATE INDEX catalog_translations_locale_idx ON public.catalog_translations (locale);
CREATE INDEX catalog_translations_catalog_id_idx ON public.catalog_translations (catalog_id);

COMMENT ON TABLE public.catalog_translations IS
  'Per-locale translation of catalogs.name + catalogs.description. Read by the storefront for shop name + description; written by the workbench Catalog tab + AI worker.';

CREATE TRIGGER trg_catalog_translations_set_updated_at
  BEFORE UPDATE ON public.catalog_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3. Drift detection — current_source_hash on catalogs + trigger
-- =============================================================================
--
-- Same pattern as KRA-90: BEFORE INSERT/UPDATE OF name, description computes
-- the SHA256 over UTF-8 bytes joined by a \x00 separator. The translation
-- row's `source_hash` is compared to this to detect drift in the workbench.

ALTER TABLE public.catalogs
  ADD COLUMN IF NOT EXISTS current_source_hash bytea;

CREATE OR REPLACE FUNCTION public.catalogs_compute_source_hash() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.current_source_hash := extensions.digest(
    convert_to(coalesce(NEW.name, ''), 'UTF8')
      || '\x00'::bytea
      || convert_to(coalesce(NEW.description, ''), 'UTF8'),
    'sha256'
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.catalogs_compute_source_hash() IS
  'Maintains catalogs.current_source_hash. Compared against catalog_translations.source_hash to detect translation staleness in the workbench.';

CREATE TRIGGER trg_catalogs_compute_source_hash
  BEFORE INSERT OR UPDATE OF name, description
  ON public.catalogs
  FOR EACH ROW EXECUTE FUNCTION public.catalogs_compute_source_hash();

-- Backfill existing catalog rows so their current_source_hash is populated.
-- Same no-op self-update pattern KRA-90 used for the other parents.
UPDATE public.catalogs SET name = name WHERE current_source_hash IS NULL;

-- =============================================================================
-- 4. RLS — anon SELECT for storefront, member CRUD for workbench
-- =============================================================================
--
-- Mirrors variation_translations / modifier_translations / modifier_list_translations:
--   - anon can read rows of public (published) catalogs
--   - authenticated can read public OR if they're an org member
--   - member+ can INSERT / UPDATE / DELETE within their org's catalogs
--
-- catalog_is_public(catalog_id) handles the published-status gating; we use
-- it instead of joining catalogs.status to keep the policy compact.

ALTER TABLE public.catalog_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_translations_select_anon ON public.catalog_translations
  FOR SELECT TO anon
  USING (public.catalog_is_public(catalog_id));

CREATE POLICY catalog_translations_select_authed ON public.catalog_translations
  FOR SELECT TO authenticated
  USING (
    public.catalog_is_public(catalog_id)
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY catalog_translations_insert ON public.catalog_translations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY catalog_translations_update ON public.catalog_translations
  FOR UPDATE TO authenticated
  USING (
    public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  )
  WITH CHECK (
    public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY catalog_translations_delete ON public.catalog_translations
  FOR DELETE TO authenticated
  USING (
    public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

-- =============================================================================
-- 5. Extend translation_completeness_view with the catalog branch
-- =============================================================================
--
-- One catalog = one source row per (locale × catalog), so the per-locale
-- denominator is `count(DISTINCT cl.catalog_id)` (always 1 from the join
-- filter, but kept explicit for symmetry with the other branches that
-- use entity-count instead of locale-count).

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
GROUP BY cl.catalog_id, cl.locale

UNION ALL

-- Catalog branch (KRA-98): one source row per catalog. total=1 when the
-- catalog exists, translated=0/1 depending on whether the locale has a
-- catalog_translations row.
SELECT
  cl.catalog_id,
  cl.locale,
  'catalog'::public.translatable_entity_kind AS entity_kind,
  count(c.id) AS total,
  count(ct.id) AS translated,
  count(ct.id) FILTER (WHERE ct.source_hash = c.current_source_hash) AS non_stale,
  count(c.id) - count(ct.id) AS missing,
  count(ct.id) FILTER (WHERE ct.source_hash IS DISTINCT FROM c.current_source_hash) AS stale
FROM public.catalog_locales cl
JOIN public.catalogs c ON c.id = cl.catalog_id
LEFT JOIN public.catalog_translations ct ON ct.catalog_id = c.id AND ct.locale = cl.locale
WHERE cl.is_enabled = true AND cl.is_default = false
GROUP BY cl.catalog_id, cl.locale;

COMMENT ON VIEW public.translation_completeness_view IS
  'Per (catalog, locale, entity_kind) translation completeness counts. SECURITY INVOKER — caller sees only rows from catalogs they have RLS access to. KRA-98 added the catalog branch.';

GRANT SELECT ON public.translation_completeness_view TO authenticated;
