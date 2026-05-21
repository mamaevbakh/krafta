-- KRA-90 Slice 1: Localization Workbench foundation — drift triggers (2/3)
--
-- Adds `current_source_hash bytea` columns on each translatable parent table.
-- A BEFORE-INSERT-OR-UPDATE trigger recomputes the hash whenever the
-- hash-input columns change. The workbench's completeness counter and stale
-- badge compare a translation row's stored `source_hash` against the parent's
-- live `current_source_hash` — equal means up to date, different means
-- "Source changed — re-translate?".
--
-- Hash composition per entity kind (matches design doc table):
--   item          → SHA256(name || \0 || description || \0 || image_alt)
--   variation     → SHA256(name)
--   modifier      → SHA256(name)
--   modifier_list → SHA256(name)
--   category      → SHA256(name || \0 || description)
--
-- Why BEFORE UPDATE OF specific columns:
--   Cheaper than AFTER UPDATE OF * — fires only when hash-input columns
--   change (e.g. price edits don't recompute). Slightly brittle to schema
--   evolution: if we add a new translatable field on a parent, update the
--   trigger column list AND the hash composition. Worth the cost.
--
-- Why BEFORE not AFTER:
--   BEFORE lets us mutate NEW.current_source_hash in the same row. AFTER
--   would require an UPDATE statement back into the row, which would re-fire
--   the trigger and loop.
--
-- Sibling migrations:
--   20260521030000_kra90_localization_schema.sql  — tables + ALTERs + queue + history + quotas
--   20260521030002_kra90_localization_rls.sql     — RLS policies + member role grants + completeness view

-- =============================================================================
-- 1. Add current_source_hash to each translatable parent
-- =============================================================================

ALTER TABLE public.items
  ADD COLUMN current_source_hash bytea;

ALTER TABLE public.item_variations
  ADD COLUMN current_source_hash bytea;

ALTER TABLE public.modifiers
  ADD COLUMN current_source_hash bytea;

ALTER TABLE public.modifier_lists
  ADD COLUMN current_source_hash bytea;

ALTER TABLE public.catalog_categories
  ADD COLUMN current_source_hash bytea;

-- =============================================================================
-- 2. Trigger functions — one per parent table
-- =============================================================================
--
-- digest() requires the pgcrypto extension. It is already enabled by the
-- baseline (gen_random_uuid uses it) but we re-declare extension idempotently
-- to be safe in fresh environments.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Hash field separator.
--
-- The first version used `chr(0)` (NUL byte) as a separator in text concat,
-- which PostgreSQL rejects: `text` values cannot contain NUL bytes
-- (SQLSTATE 54000 "null character not permitted"). NUL is the C-string
-- terminator and Postgres treats it as forbidden in text storage.
--
-- Fix: concatenate as `bytea` instead. Convert each text field to UTF-8 bytea
-- via `convert_to()`, then join with the `\x00` bytea literal. `digest()` is
-- overloaded for bytea so this works directly. The hash is the same as it
-- would have been with text-concat (just goes through bytea), so future
-- callers that need to recompute the hash get a stable value.

-- items: name + description + image_alt
CREATE OR REPLACE FUNCTION public.items_compute_source_hash() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.current_source_hash := extensions.digest(
    convert_to(coalesce(NEW.name, ''), 'UTF8')
      || '\x00'::bytea
      || convert_to(coalesce(NEW.description, ''), 'UTF8')
      || '\x00'::bytea
      || convert_to(coalesce(NEW.image_alt, ''), 'UTF8'),
    'sha256'
  );
  RETURN NEW;
END;
$$;

-- item_variations: name only (no separator needed)
CREATE OR REPLACE FUNCTION public.item_variations_compute_source_hash() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.current_source_hash := extensions.digest(
    convert_to(coalesce(NEW.name, ''), 'UTF8'),
    'sha256'
  );
  RETURN NEW;
END;
$$;

-- modifiers: name only (no separator needed)
CREATE OR REPLACE FUNCTION public.modifiers_compute_source_hash() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.current_source_hash := extensions.digest(
    convert_to(coalesce(NEW.name, ''), 'UTF8'),
    'sha256'
  );
  RETURN NEW;
END;
$$;

-- modifier_lists: name only (the merchant-visible "Modifier Set" label,
-- e.g. "Size", "Toppings")
CREATE OR REPLACE FUNCTION public.modifier_lists_compute_source_hash() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.current_source_hash := extensions.digest(
    convert_to(coalesce(NEW.name, ''), 'UTF8'),
    'sha256'
  );
  RETURN NEW;
END;
$$;

-- catalog_categories: name + description
CREATE OR REPLACE FUNCTION public.catalog_categories_compute_source_hash() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  v_description text;
BEGIN
  -- catalog_categories.description column may or may not exist depending on
  -- schema evolution. Defensive lookup via to_jsonb keeps the trigger
  -- tolerant of future ALTERs.
  v_description := coalesce((to_jsonb(NEW) ->> 'description'), '');
  NEW.current_source_hash := extensions.digest(
    convert_to(coalesce(NEW.name, ''), 'UTF8')
      || '\x00'::bytea
      || convert_to(v_description, 'UTF8'),
    'sha256'
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.items_compute_source_hash() IS
  'Maintains items.current_source_hash. Compared against item_translations.source_hash to detect translation staleness in the workbench.';

-- =============================================================================
-- 3. Triggers — BEFORE INSERT OR UPDATE OF specific columns
-- =============================================================================

CREATE TRIGGER trg_items_compute_source_hash
  BEFORE INSERT OR UPDATE OF name, description, image_alt
  ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.items_compute_source_hash();

CREATE TRIGGER trg_item_variations_compute_source_hash
  BEFORE INSERT OR UPDATE OF name
  ON public.item_variations
  FOR EACH ROW EXECUTE FUNCTION public.item_variations_compute_source_hash();

CREATE TRIGGER trg_modifiers_compute_source_hash
  BEFORE INSERT OR UPDATE OF name
  ON public.modifiers
  FOR EACH ROW EXECUTE FUNCTION public.modifiers_compute_source_hash();

CREATE TRIGGER trg_modifier_lists_compute_source_hash
  BEFORE INSERT OR UPDATE OF name
  ON public.modifier_lists
  FOR EACH ROW EXECUTE FUNCTION public.modifier_lists_compute_source_hash();

-- catalog_categories: trigger fires on name change. If a description column is
-- added later, ALTER this trigger's column list.
CREATE TRIGGER trg_catalog_categories_compute_source_hash
  BEFORE INSERT OR UPDATE OF name
  ON public.catalog_categories
  FOR EACH ROW EXECUTE FUNCTION public.catalog_categories_compute_source_hash();

-- =============================================================================
-- 4. Backfill existing rows
-- =============================================================================
--
-- The triggers only fire on future INSERT / UPDATE. Existing rows have
-- current_source_hash = NULL. Backfill by re-saving each row's hash-input
-- field to itself (no-op update that triggers the BEFORE trigger).
--
-- For Krafta's current scale (small catalogs) this is fast. At 100k+ rows
-- per table this would need batching; not a concern in Phase 1.

UPDATE public.items SET name = name WHERE current_source_hash IS NULL;
UPDATE public.item_variations SET name = name WHERE current_source_hash IS NULL;
UPDATE public.modifiers SET name = name WHERE current_source_hash IS NULL;
UPDATE public.modifier_lists SET name = name WHERE current_source_hash IS NULL;
UPDATE public.catalog_categories SET name = name WHERE current_source_hash IS NULL;

-- =============================================================================
-- 5. Indexes on current_source_hash
-- =============================================================================
--
-- The completeness view joins translation rows on (parent_id, locale) and
-- compares hashes. Indexes on current_source_hash itself aren't useful (hash
-- values are uniform-distributed). The existing PK indexes on (id) carry
-- the lookup. No additional indexes needed.
