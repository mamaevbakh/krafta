-- ============================================================================
-- Translation worker fix — add catalog_categories.description
-- ============================================================================
--
-- Bug: the translate-worker queries
--   SELECT name, description, current_source_hash FROM catalog_categories
-- inside fetchSourceFields(). The parent table never had a description
-- column (only catalog_category_translations did), so PostgREST 400d the
-- query, the worker treated it as "parent row missing", and the job
-- died with SOURCE_NOT_FOUND. Confirmed on dev: 12 dead category jobs,
-- all SOURCE_NOT_FOUND.
--
-- The "Translate all missing" master CTA in the workbench was correctly
-- enqueueing category jobs — they just couldn't complete. Items + other
-- entity kinds were unaffected because their parent tables already had
-- the columns the worker expects.
--
-- Fix:
--   1. Add the missing column (nullable — most categories won't have one,
--      which is fine; description is in the worker's NULLABLE_FIELDS set).
--   2. Update the source-hash trigger to also fire on description change
--      so editing it via future UIs still flips drift detection.
--   3. Re-queue every dead/failed category job so the worker retries them
--      now that the schema is correct.
-- ============================================================================

ALTER TABLE public.catalog_categories
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.catalog_categories.description IS
  'Optional source-locale description shown beneath the category header on
   the storefront. Translated into target locales by the translate-worker.
   Catalog_category_translations.description already exists; this column
   closes the schema asymmetry that broke worker fetches (KRA-98 follow-up,
   2026-05-25).';

-- Re-create the trigger so it ALSO fires on description changes. Without
-- this, editing description through any future merchant UI would silently
-- leave current_source_hash stale and translations wouldn't show as drifted.
DROP TRIGGER IF EXISTS trg_catalog_categories_compute_source_hash
  ON public.catalog_categories;

CREATE TRIGGER trg_catalog_categories_compute_source_hash
  BEFORE INSERT OR UPDATE OF name, description
  ON public.catalog_categories
  FOR EACH ROW EXECUTE FUNCTION public.catalog_categories_compute_source_hash();

-- One-shot recovery: re-queue every category job that died before the
-- column existed. Worker picks them up on the next cron tick (~60s) and
-- they should land successfully this time.
UPDATE public.translation_jobs
   SET status          = 'queued',
       error_text      = NULL,
       attempts        = 0,
       started_at      = NULL,
       completed_at    = NULL,
       next_attempt_at = now()
 WHERE entity_kind = 'category'
   AND status IN ('dead', 'failed');
