-- KRA-42 follow-up — re-key existing 'uz' data rows to the canonical 'uz-Latn'.
--
-- 20260610130000_kra42_uz_latn_alignment.sql fixed all WRITERS (vertical
-- templates, wizard seeding, legacy create_draft_shop) to use the registry
-- code `uz-Latn` (lib/locales/registry.ts), but left existing rows keyed
-- bare `uz` in place. Each catalog was internally consistent, so nothing was
-- broken — but a merchant adding Uzbek via the translations workbench
-- (registry codes) on an old catalog would create a SECOND Uzbek locale next
-- to the legacy one. This migration re-keys the data so only `uz-Latn` is
-- left.
--
-- Collision rule: where a parent already has BOTH `uz` and `uz-Latn` rows
-- (workbench-added Uzbek on an old catalog), the `uz-Latn` row wins (newer,
-- registry-driven) and the `uz` duplicate is dropped — re-keying it would
-- violate the UNIQUE (parent, locale) constraints. For catalog_locales the
-- dropped row's is_default / is_enabled are OR-ed into the survivor (and
-- sort_order takes the smaller slot) so the dedup can never strip a
-- catalog's default locale; `catalog_one_default_locale` makes the order
-- matter (delete the `uz` row first, then flip the survivor's flag).
--
-- Tables touched (everything locale-keyed, plus the search cache):
--   catalog_locales                 UNIQUE (catalog_id, locale)        + display_name refresh
--   catalog_translations            UNIQUE (catalog_id, locale)
--   catalog_category_translations   UNIQUE (category_id, locale)       + search docs
--   item_translations               UNIQUE (item_id, locale)           + search docs
--   variation_translations          UNIQUE (item_variation_id, locale)
--   modifier_translations           UNIQUE (modifier_id, locale)
--   modifier_list_translations      UNIQUE (modifier_list_id, locale)
--   translation_jobs (non-terminal) UNIQUE (catalog_id, target_locale, entity_kind, entity_id)
--   catalog_search_documents        locale column on translation-sourced docs
--   commerce.customers              preferred_locale (no writers yet; future-proofing)
--
-- Deliberately left alone:
--   translation_history — append-only audit log; rewriting recorded locale
--     codes would falsify history, and Restore keys on translation_row_id.
--   translation_jobs in terminal states (done/skipped/dead) — audit trail;
--     terminal rows never run again and don't collide with future uz-Latn
--     enqueues (locale is part of the unique key). Non-terminal `uz` jobs
--     MUST be re-keyed though: a queued `uz` job would otherwise write a
--     fresh bare-uz translation row after this cleanup.
--
-- Search-document handling: the trg_catalog_search_sync_*_translation
-- triggers rebuild ALL docs of the parent (delete + re-insert) on every
-- translation UPDATE/DELETE, which would discard embeddings for unchanged
-- sibling docs and re-queue the whole set. They are disabled for this
-- transaction and the docs maintained surgically instead:
--   * docs of dropped duplicate rows are deleted,
--   * docs of re-keyed rows get locale flipped in place — the BEFORE UPDATE
--     trigger recomputes fts, and because the locale string is part of the
--     embedding input, clear_column('embedding') + queue_embeddings fire
--     for exactly the changed docs (which genuinely need re-embedding).

-- =============================================================================
-- 1. catalog_locales — dedup collisions, then re-key
-- =============================================================================

CREATE TEMP TABLE _kra42_uz_collisions ON COMMIT DROP AS
SELECT uz.catalog_id, uz.is_default, uz.is_enabled, uz.sort_order
FROM public.catalog_locales uz
WHERE uz.locale = 'uz'
  AND EXISTS (
    SELECT 1 FROM public.catalog_locales latn
    WHERE latn.catalog_id = uz.catalog_id AND latn.locale = 'uz-Latn'
  );

DELETE FROM public.catalog_locales l
USING _kra42_uz_collisions c
WHERE l.catalog_id = c.catalog_id AND l.locale = 'uz';

UPDATE public.catalog_locales l
SET is_default = l.is_default OR c.is_default,
    is_enabled = l.is_enabled OR c.is_enabled,
    sort_order = LEAST(l.sort_order, c.sort_order)
FROM _kra42_uz_collisions c
WHERE l.catalog_id = c.catalog_id AND l.locale = 'uz-Latn';

-- Remaining `uz` rows have no `uz-Latn` sibling: plain re-key, plus the
-- registry nativeName (the legacy seed wrote variants like "O'zbek").
UPDATE public.catalog_locales
SET locale = 'uz-Latn',
    display_name = 'Oʻzbek tili'
WHERE locale = 'uz';

-- =============================================================================
-- 2. catalog_translations (KRA-98 catalog name/description)
-- =============================================================================

DELETE FROM public.catalog_translations t
WHERE t.locale = 'uz'
  AND EXISTS (
    SELECT 1 FROM public.catalog_translations s
    WHERE s.catalog_id = t.catalog_id AND s.locale = 'uz-Latn'
  );

UPDATE public.catalog_translations SET locale = 'uz-Latn' WHERE locale = 'uz';

-- =============================================================================
-- 3. item_translations + catalog_category_translations (search-doc backed)
-- =============================================================================

ALTER TABLE public.item_translations
  DISABLE TRIGGER trg_catalog_search_sync_item_translation;
ALTER TABLE public.catalog_category_translations
  DISABLE TRIGGER trg_catalog_search_sync_category_translation;

WITH dropped AS (
  DELETE FROM public.item_translations t
  WHERE t.locale = 'uz'
    AND EXISTS (
      SELECT 1 FROM public.item_translations s
      WHERE s.item_id = t.item_id AND s.locale = 'uz-Latn'
    )
  RETURNING t.id
)
DELETE FROM public.catalog_search_documents d
USING dropped
WHERE d.source_table = 'item_translations'
  AND d.source_id = dropped.id;

UPDATE public.item_translations SET locale = 'uz-Latn' WHERE locale = 'uz';

WITH dropped AS (
  DELETE FROM public.catalog_category_translations t
  WHERE t.locale = 'uz'
    AND EXISTS (
      SELECT 1 FROM public.catalog_category_translations s
      WHERE s.category_id = t.category_id AND s.locale = 'uz-Latn'
    )
  RETURNING t.id
)
DELETE FROM public.catalog_search_documents d
USING dropped
WHERE d.source_table = 'catalog_category_translations'
  AND d.source_id = dropped.id;

UPDATE public.catalog_category_translations SET locale = 'uz-Latn' WHERE locale = 'uz';

ALTER TABLE public.item_translations
  ENABLE TRIGGER trg_catalog_search_sync_item_translation;
ALTER TABLE public.catalog_category_translations
  ENABLE TRIGGER trg_catalog_search_sync_category_translation;

-- =============================================================================
-- 4. Phase-2 translation tables (no search docs)
-- =============================================================================

DELETE FROM public.variation_translations t
WHERE t.locale = 'uz'
  AND EXISTS (
    SELECT 1 FROM public.variation_translations s
    WHERE s.item_variation_id = t.item_variation_id AND s.locale = 'uz-Latn'
  );
UPDATE public.variation_translations SET locale = 'uz-Latn' WHERE locale = 'uz';

DELETE FROM public.modifier_translations t
WHERE t.locale = 'uz'
  AND EXISTS (
    SELECT 1 FROM public.modifier_translations s
    WHERE s.modifier_id = t.modifier_id AND s.locale = 'uz-Latn'
  );
UPDATE public.modifier_translations SET locale = 'uz-Latn' WHERE locale = 'uz';

DELETE FROM public.modifier_list_translations t
WHERE t.locale = 'uz'
  AND EXISTS (
    SELECT 1 FROM public.modifier_list_translations s
    WHERE s.modifier_list_id = t.modifier_list_id AND s.locale = 'uz-Latn'
  );
UPDATE public.modifier_list_translations SET locale = 'uz-Latn' WHERE locale = 'uz';

-- =============================================================================
-- 5. translation_jobs — non-terminal only
-- =============================================================================

DELETE FROM public.translation_jobs j
WHERE j.target_locale = 'uz'
  AND j.status IN ('queued', 'running', 'failed')
  AND EXISTS (
    SELECT 1 FROM public.translation_jobs s
    WHERE s.catalog_id = j.catalog_id
      AND s.entity_kind = j.entity_kind
      AND s.entity_id = j.entity_id
      AND s.target_locale = 'uz-Latn'
  );

UPDATE public.translation_jobs
SET target_locale = 'uz-Latn'
WHERE target_locale = 'uz'
  AND status IN ('queued', 'running', 'failed');

-- =============================================================================
-- 6. catalog_search_documents — flip locale on surviving translation docs
-- =============================================================================
--
-- Only translation-sourced docs carry a locale, so no source_table filter:
-- this also catches any orphaned doc whose source row vanished historically.
-- BEFORE UPDATE triggers recompute fts and clear + re-queue the embedding.

UPDATE public.catalog_search_documents
SET locale = 'uz-Latn'
WHERE locale = 'uz';

-- =============================================================================
-- 7. commerce.customers.preferred_locale — nothing writes it yet, but any
--    QA-era value should follow the registry code
-- =============================================================================

UPDATE commerce.customers
SET preferred_locale = 'uz-Latn'
WHERE preferred_locale = 'uz';

-- =============================================================================
-- 8. Post-conditions — abort the transaction if the re-key left bad state
-- =============================================================================

DO $$
DECLARE
  v_bad_defaults integer;
  v_uz_left      integer;
BEGIN
  -- Every collision catalog must still have exactly one default locale.
  SELECT count(*) INTO v_bad_defaults
  FROM (
    SELECT l.catalog_id
    FROM public.catalog_locales l
    JOIN _kra42_uz_collisions c ON c.catalog_id = l.catalog_id
    GROUP BY l.catalog_id
    HAVING count(*) FILTER (WHERE l.is_default) <> 1
  ) x;
  IF v_bad_defaults > 0 THEN
    RAISE EXCEPTION 'uz-Latn re-key left % collision catalog(s) without exactly one default locale', v_bad_defaults;
  END IF;

  SELECT (SELECT count(*) FROM public.catalog_locales               WHERE locale = 'uz')
       + (SELECT count(*) FROM public.catalog_translations          WHERE locale = 'uz')
       + (SELECT count(*) FROM public.catalog_category_translations WHERE locale = 'uz')
       + (SELECT count(*) FROM public.item_translations             WHERE locale = 'uz')
       + (SELECT count(*) FROM public.variation_translations        WHERE locale = 'uz')
       + (SELECT count(*) FROM public.modifier_translations         WHERE locale = 'uz')
       + (SELECT count(*) FROM public.modifier_list_translations    WHERE locale = 'uz')
       + (SELECT count(*) FROM public.catalog_search_documents      WHERE locale = 'uz')
    INTO v_uz_left;
  IF v_uz_left > 0 THEN
    RAISE EXCEPTION 'uz-Latn re-key left % bare-uz row(s) behind', v_uz_left;
  END IF;
END
$$;
