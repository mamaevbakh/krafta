-- KRA-90 Slice 1: Localization Workbench foundation — schema (1/3)
--
-- Adds the schema layer for the Localization Workbench. All entity translation
-- tables created in one pass even though only Items wires UI in Phase 1
-- (per the design doc: schema-once, UI phased — avoids a second migration in
-- Phase 2).
--
-- New tables:
--   variation_translations, modifier_translations, modifier_list_translations,
--   translation_history, translation_jobs (queue), catalog_translation_quotas
--
-- Altered tables:
--   item_translations + catalog_category_translations: add source_hash, is_ai_translated, last_edited_by
--   catalog_locales: add display_name, text_direction ('ltr' | 'rtl')
--
-- Sibling migrations:
--   20260521030001_kra90_localization_triggers.sql  — compute_source_hash + AFTER UPDATE triggers + current_source_hash on parents
--   20260521030002_kra90_localization_rls.sql       — RLS policies + member role grants + completeness view
--
-- Design doc:
--   ~/.gstack/projects/mamaevbakh-krafta/bakh-dev-design-localization-workbench-20260521-161254.md
--   Section: "PHASE 1 — Detailed Spec" → "Schema"

-- =============================================================================
-- 1. ALTER existing translation tables
-- =============================================================================
--
-- item_translations and catalog_category_translations already exist in baseline.
-- Add the columns the workbench needs:
--   source_hash       — SHA256 of the source fields at translation time; drift
--                       detection compares this to the parent's current_source_hash
--   is_ai_translated  — true when AI worker wrote the row; merchant reviews + flips
--   last_edited_by    — uuid of the human who last edited the row; NULL if only
--                       AI has touched it. Used by the worker's human-edit guard.

ALTER TABLE public.item_translations
  ADD COLUMN source_hash bytea,
  ADD COLUMN is_ai_translated boolean NOT NULL DEFAULT false,
  ADD COLUMN last_edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.catalog_category_translations
  ADD COLUMN source_hash bytea,
  ADD COLUMN is_ai_translated boolean NOT NULL DEFAULT false,
  ADD COLUMN last_edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- =============================================================================
-- 2. New translation tables — variation, modifier, modifier_list
-- =============================================================================
--
-- All follow the same shape: PK id, FK to parent, locale text, name text,
-- source_hash, is_ai_translated, last_edited_by, timestamps. Only `name` is
-- translated (variation / modifier / modifier_list have no description field).
--
-- UNIQUE (parent_id, locale) prevents duplicate translations per locale.

CREATE TABLE public.variation_translations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_variation_id uuid        NOT NULL REFERENCES public.item_variations(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  name              text        NOT NULL,
  source_hash       bytea,
  is_ai_translated  boolean     NOT NULL DEFAULT false,
  last_edited_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_variation_id, locale)
);
CREATE INDEX variation_translations_locale_idx ON public.variation_translations (locale);
CREATE INDEX variation_translations_item_variation_id_idx ON public.variation_translations (item_variation_id);

CREATE TABLE public.modifier_translations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id      uuid        NOT NULL REFERENCES public.modifiers(id) ON DELETE CASCADE,
  locale           text        NOT NULL,
  name             text        NOT NULL,
  source_hash      bytea,
  is_ai_translated boolean     NOT NULL DEFAULT false,
  last_edited_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modifier_id, locale)
);
CREATE INDEX modifier_translations_locale_idx ON public.modifier_translations (locale);
CREATE INDEX modifier_translations_modifier_id_idx ON public.modifier_translations (modifier_id);

CREATE TABLE public.modifier_list_translations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_list_id  uuid        NOT NULL REFERENCES public.modifier_lists(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  name              text        NOT NULL,
  source_hash       bytea,
  is_ai_translated  boolean     NOT NULL DEFAULT false,
  last_edited_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modifier_list_id, locale)
);
CREATE INDEX modifier_list_translations_locale_idx ON public.modifier_list_translations (locale);
CREATE INDEX modifier_list_translations_modifier_list_id_idx ON public.modifier_list_translations (modifier_list_id);

COMMENT ON TABLE public.variation_translations IS
  'Per-locale translation of item_variations.name. Phase 2 workbench tab; Phase 1 ships the schema only.';
COMMENT ON TABLE public.modifier_translations IS
  'Per-locale translation of modifiers.name. Depends on KRA-85 for parent rows; Phase 1 ships schema only.';
COMMENT ON TABLE public.modifier_list_translations IS
  'Per-locale translation of modifier_lists.name. Depends on KRA-85 for parent rows; Phase 1 ships schema only.';

-- =============================================================================
-- 3. translation_history — lightweight audit trail for translation row edits
-- =============================================================================
--
-- One row per translation edit (manual OR AI). Lets the workbench UI show
-- "Last AI translation: ... | Your edit: ..." with a Restore button.
-- Polymorphic FK to the source translation row via (entity_kind, translation_row_id)
-- since we have 5 separate translation tables — keeps history table flat.

CREATE TYPE public.translatable_entity_kind AS ENUM (
  'item',
  'variation',
  'modifier',
  'modifier_list',
  'category'
);

CREATE TABLE public.translation_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind         public.translatable_entity_kind NOT NULL,
  translation_row_id  uuid        NOT NULL,
  locale              text        NOT NULL,
  field               text        NOT NULL,           -- 'name' | 'description' | 'image_alt'
  previous_value      text,
  edited_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at           timestamptz NOT NULL DEFAULT now(),
  was_ai_edit         boolean     NOT NULL DEFAULT false
);
CREATE INDEX translation_history_row_idx
  ON public.translation_history (entity_kind, translation_row_id, edited_at DESC);

COMMENT ON TABLE public.translation_history IS
  'Append-only audit log of every translation edit (manual + AI). Used by workbench Restore feature. No FK to translation rows because the parent table varies by entity_kind — orphan rows on parent delete are tolerated.';

-- =============================================================================
-- 4. translation_jobs — queue table for the AI worker
-- =============================================================================
--
-- One row per (catalog × target_locale × entity). UNIQUE constraint makes
-- enqueue idempotent via ON CONFLICT DO UPDATE.

CREATE TYPE public.translation_job_status AS ENUM (
  'queued',
  'running',
  'done',
  'skipped',     -- AI write blocked by human-edit guard; quota NOT incremented
  'failed',      -- transient failure; backoff retry eligible
  'dead'         -- exceeded max_attempts; needs manual intervention
);

CREATE TABLE public.translation_jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id       uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  target_locale    text        NOT NULL,
  entity_kind      public.translatable_entity_kind NOT NULL,
  entity_id        uuid        NOT NULL,
  status           public.translation_job_status NOT NULL DEFAULT 'queued',
  attempts         integer     NOT NULL DEFAULT 0,
  max_attempts     integer     NOT NULL DEFAULT 3,
  llm_provider     text        NOT NULL DEFAULT 'openai/gpt-5-nano-2025-08-07',
  error_text       text,
  enqueued_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  -- Idempotent re-enqueue: one queued/running job per entity × locale
  UNIQUE (catalog_id, target_locale, entity_kind, entity_id)
);

-- Worker SELECT pattern: WHERE status IN ('queued','failed') AND next_attempt_at <= now()
CREATE INDEX translation_jobs_ready_idx
  ON public.translation_jobs (status, next_attempt_at)
  WHERE status IN ('queued', 'failed');

-- Watchdog SELECT pattern: WHERE status = 'running' AND started_at < now() - interval '5 minutes'
CREATE INDEX translation_jobs_running_idx
  ON public.translation_jobs (started_at)
  WHERE status = 'running';

COMMENT ON TABLE public.translation_jobs IS
  'Queue for the AI translation worker. Worker claims jobs with FOR UPDATE SKIP LOCKED, processes via AI SDK v6 + @ai-sdk/openai, writes back to translation tables with human-edit guard. Failed jobs retry with exponential backoff (5^attempts minutes) until max_attempts → status=dead.';

-- =============================================================================
-- 5. catalog_translation_quotas — per-catalog daily AI translation budget
-- =============================================================================
--
-- Enqueue-time check: used_today + new_jobs > daily_quota → reject with
-- QUOTA_EXCEEDED. Worker increments used_today + total_tokens_used + total_usd_estimated
-- on each completed (not skipped) job. Cron resets used_today daily.

CREATE TABLE public.catalog_translation_quotas (
  catalog_id           uuid        PRIMARY KEY REFERENCES public.catalogs(id) ON DELETE CASCADE,
  daily_quota          integer     NOT NULL DEFAULT 500,
  used_today           integer     NOT NULL DEFAULT 0,
  quota_reset_at       timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
  total_tokens_used    bigint      NOT NULL DEFAULT 0,
  total_usd_estimated  numeric(10,4) NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (daily_quota >= 0),
  CHECK (used_today >= 0),
  CHECK (used_today <= daily_quota * 2)  -- guard against runaway worker
);

COMMENT ON TABLE public.catalog_translation_quotas IS
  'Per-catalog daily AI translation budget. Default 500 translations/day per catalog. Enforced at enqueue-time. Worker increments on completion. Cron job resets used_today daily.';

-- =============================================================================
-- 6. ALTER catalog_locales — add display_name + text_direction (RTL support)
-- =============================================================================
--
-- catalog_locales already exists in baseline with (id, catalog_id, locale,
-- is_default, is_enabled, sort_order, created_at). Workbench needs:
--   display_name    — merchant-friendly name (e.g. "O'zbek tili" not just "uz-Latn")
--   text_direction  — 'ltr' | 'rtl'; Phase 1 stores but doesn't apply UI;
--                     Phase 2 wires the storefront <html dir={text_direction}>

ALTER TABLE public.catalog_locales
  ADD COLUMN display_name text,
  ADD COLUMN text_direction text NOT NULL DEFAULT 'ltr' CHECK (text_direction IN ('ltr', 'rtl'));

-- Backfill display_name with a sensible default for existing rows
UPDATE public.catalog_locales SET display_name = locale WHERE display_name IS NULL;
ALTER TABLE public.catalog_locales ALTER COLUMN display_name SET NOT NULL;

COMMENT ON COLUMN public.catalog_locales.display_name IS
  'Merchant-friendly locale name shown in the workbench sidebar. e.g. "Русский", "O''zbek tili", "Тоҷикӣ". Merchant-editable; defaults to the locale code on creation if not provided.';
COMMENT ON COLUMN public.catalog_locales.text_direction IS
  'Phase 1: stored but not applied (storefront LTR-only). Phase 2: wires <html dir={text_direction}> on the customer storefront. Needed for Arabic / Persian support promised by "any language" positioning.';

-- =============================================================================
-- 7. updated_at triggers for new tables
-- =============================================================================
--
-- The existing public.set_updated_at() function from baseline is reused.

CREATE TRIGGER trg_variation_translations_set_updated_at
  BEFORE UPDATE ON public.variation_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_modifier_translations_set_updated_at
  BEFORE UPDATE ON public.modifier_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_modifier_list_translations_set_updated_at
  BEFORE UPDATE ON public.modifier_list_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_catalog_translation_quotas_set_updated_at
  BEFORE UPDATE ON public.catalog_translation_quotas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
