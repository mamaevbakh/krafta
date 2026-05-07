-- KRA-54 / Migration 1 — Catalog refactor: item variations + modifiers.
--
-- Per ADR 0001 (`docs/adr/0001-orders-catalog-schema-v1.md` §3.1, §5):
--   * Items become containers; price moves to a per-variation row.
--   * Modifiers become a reusable named entity attached to items via a join table.
--   * Add `version bigint` + UPDATE trigger to all catalog tables that orders
--     will snapshot from later (groundwork for catalog-version snapshots).
--
-- Per bakh 2026-05-07: drop `items.price_cents` in this same migration; we have
-- no production clients yet, app-side fixes land in the same PR.
--
-- Audit-driven adjustments (2026-05-07, see PR description):
--   * Modifier `is_default` → `on_by_default` to match Square vocabulary.
--   * Text modifiers carry `text_required` + `max_length` (otherwise enum is half-modeled).
--   * Denormalized `catalog_id` on `item_variations` / `modifiers` / `item_modifier_lists`
--     to avoid two-hop RLS joins on every row scan.
--   * `is_sold_out` (86'ing) separated from `is_active` (soft delete).
--   * `hidden_from_customer_override` on `item_modifier_lists`.
--   * Composite indexes for hot read paths.
--   * `ON DELETE RESTRICT` on modifier list referenced by `item_modifier_lists`.

-- ===========================================================================
-- 1. Generic version-bumping trigger function (passive change counter)
-- ===========================================================================
--
-- This is **not** optimistic concurrency control. It is a row-level change
-- counter that orders snapshot via `catalog_version` so historical orders can
-- be reconstructed against the menu state at order time (per ADR §3 snapshot
-- principle, §7 Q5). True OCC on catalog edits — if we ever need it — would
-- require callers to pass an expected `version` and a BEFORE-UPDATE trigger
-- that raises on mismatch. v1 doesn't need that: the editor is single-merchant
-- and concurrent catalog edits are vanishingly rare; if two writers race, the
-- last write wins and `version` still increments monotonically.

CREATE FUNCTION public.bump_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_version() IS
  'Passive row-level change counter. Bumps NEW.version on UPDATE so orders can snapshot catalog_version (ADR 0001 §3, §7 Q5). NOT optimistic concurrency control.';

-- ===========================================================================
-- 2. Backfill `version` + `is_sold_out` on existing catalog tables
-- ===========================================================================

ALTER TABLE public.items
  ADD COLUMN version bigint NOT NULL DEFAULT 1,
  ADD COLUMN is_sold_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.items.is_sold_out IS
  'Operational "86'd" flag (out-of-stock / temporarily unavailable). Distinct from is_active (soft delete).';

CREATE TRIGGER trg_items_bump_version
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

-- ===========================================================================
-- 3. public.item_variations
-- ===========================================================================

CREATE TYPE public.item_variation_pricing_type AS ENUM ('fixed', 'variable');

CREATE TABLE public.item_variations (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     uuid        NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    catalog_id  uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    name        text        NOT NULL,
    sku         text,
    pricing_type public.item_variation_pricing_type NOT NULL DEFAULT 'fixed',
    price_cents integer     NOT NULL DEFAULT 0,
    ordinal     integer     NOT NULL DEFAULT 0,
    is_default  boolean     NOT NULL DEFAULT false,
    is_active   boolean     NOT NULL DEFAULT true,
    is_sold_out boolean     NOT NULL DEFAULT false,
    metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    version     bigint      NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (item_id, name)
);

COMMENT ON COLUMN public.item_variations.catalog_id IS
  'Denormalized from items.catalog_id; kept consistent via trigger. Used for fast RLS + scoped queries without joining items.';
COMMENT ON COLUMN public.item_variations.is_sold_out IS
  'Operational 86 flag — distinct from is_active (soft delete). Variation-level overrides item-level.';

-- One default variation per item (partial unique index).
-- NOTE: we do not enforce "at least one default" at the DB level. The application
-- always creates a default variation in the same transaction as the item. If you
-- query for the default and find none, treat as a data bug.
CREATE UNIQUE INDEX item_variations_one_default_per_item
  ON public.item_variations (item_id) WHERE is_default;

-- Hot read paths.
CREATE INDEX item_variations_item_id_active_ordinal_idx
  ON public.item_variations (item_id, is_active, ordinal);
CREATE INDEX item_variations_catalog_id_idx
  ON public.item_variations (catalog_id);

-- Keep denormalized catalog_id consistent: must match parent item.
CREATE FUNCTION public.item_variations_sync_catalog_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_catalog_id uuid;
BEGIN
  SELECT catalog_id INTO v_catalog_id FROM public.items WHERE id = NEW.item_id;
  IF v_catalog_id IS NULL THEN
    RAISE EXCEPTION 'item_variations.item_id % does not exist', NEW.item_id;
  END IF;
  NEW.catalog_id := v_catalog_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_item_variations_sync_catalog_id
  BEFORE INSERT OR UPDATE OF item_id ON public.item_variations
  FOR EACH ROW EXECUTE FUNCTION public.item_variations_sync_catalog_id();

CREATE TRIGGER trg_item_variations_set_updated_at
  BEFORE UPDATE ON public.item_variations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_item_variations_bump_version
  BEFORE UPDATE ON public.item_variations
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE public.item_variations ENABLE ROW LEVEL SECURITY;

-- RLS: scoped via denormalized catalog_id (one hop instead of two).
CREATE POLICY item_variations_select_anon ON public.item_variations
  FOR SELECT TO anon
  USING (is_active = true AND public.catalog_is_public(catalog_id));

CREATE POLICY item_variations_select_authed ON public.item_variations
  FOR SELECT TO authenticated
  USING (
    (is_active = true AND public.catalog_is_public(catalog_id))
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY item_variations_insert ON public.item_variations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY item_variations_update ON public.item_variations
  FOR UPDATE TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY item_variations_delete ON public.item_variations
  FOR DELETE TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 4. public.item_variation_translations (i18n)
-- ===========================================================================

CREATE TABLE public.item_variation_translations (
    variation_id uuid        NOT NULL REFERENCES public.item_variations(id) ON DELETE CASCADE,
    locale       text        NOT NULL,
    name         text        NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (variation_id, locale)
);

CREATE TRIGGER trg_item_variation_translations_set_updated_at
  BEFORE UPDATE ON public.item_variation_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.item_variation_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY item_variation_translations_select_anon ON public.item_variation_translations
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.item_variations iv
      WHERE iv.id = item_variation_translations.variation_id
        AND iv.is_active = true
        AND public.catalog_is_public(iv.catalog_id)
    )
  );

CREATE POLICY item_variation_translations_select_authed ON public.item_variation_translations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.item_variations iv
      WHERE iv.id = item_variation_translations.variation_id
        AND (
          (iv.is_active = true AND public.catalog_is_public(iv.catalog_id))
          OR public.is_org_role(public.catalog_org_id(iv.catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
        )
    )
  );

CREATE POLICY item_variation_translations_write ON public.item_variation_translations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.item_variations iv
      WHERE iv.id = item_variation_translations.variation_id
        AND public.is_org_role(public.catalog_org_id(iv.catalog_id), ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.item_variations iv
      WHERE iv.id = item_variation_translations.variation_id
        AND public.is_org_role(public.catalog_org_id(iv.catalog_id), ARRAY['owner'::text, 'admin'::text])
    )
  );

-- ===========================================================================
-- 5. public.modifier_lists, modifiers, item_modifier_lists
-- ===========================================================================

CREATE TYPE public.modifier_list_kind AS ENUM ('list', 'text');

CREATE TABLE public.modifier_lists (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id    uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    name          text        NOT NULL,
    internal_name text,
    modifier_type public.modifier_list_kind NOT NULL DEFAULT 'list',
    -- modifier_type='list' constraints:
    min_selected  integer     NOT NULL DEFAULT 0,
    max_selected  integer,                                   -- NULL = unlimited
    -- modifier_type='text' constraints (Square parity):
    text_required boolean     NOT NULL DEFAULT false,
    max_length    integer,                                   -- NULL = no limit
    is_active     boolean     NOT NULL DEFAULT true,
    metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    version       bigint      NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (min_selected >= 0),
    CHECK (max_selected IS NULL OR max_selected >= min_selected),
    CHECK (max_length IS NULL OR max_length > 0)
);

CREATE INDEX modifier_lists_catalog_id_active_idx
  ON public.modifier_lists (catalog_id, is_active);

CREATE TRIGGER trg_modifier_lists_set_updated_at
  BEFORE UPDATE ON public.modifier_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_modifier_lists_bump_version
  BEFORE UPDATE ON public.modifier_lists
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE public.modifier_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY modifier_lists_select_anon ON public.modifier_lists
  FOR SELECT TO anon
  USING (is_active = true AND public.catalog_is_public(catalog_id));

CREATE POLICY modifier_lists_select_authed ON public.modifier_lists
  FOR SELECT TO authenticated
  USING (
    (is_active = true AND public.catalog_is_public(catalog_id))
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY modifier_lists_write ON public.modifier_lists
  FOR ALL TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

CREATE TABLE public.modifiers (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_list_id uuid        NOT NULL REFERENCES public.modifier_lists(id) ON DELETE CASCADE,
    catalog_id       uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    name             text        NOT NULL,
    price_cents      integer     NOT NULL DEFAULT 0,
    ordinal          integer     NOT NULL DEFAULT 0,
    on_by_default    boolean     NOT NULL DEFAULT false,     -- Square: CatalogModifier.on_by_default
    is_active        boolean     NOT NULL DEFAULT true,
    metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    version          bigint      NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (modifier_list_id, name)
);

COMMENT ON COLUMN public.modifiers.catalog_id IS
  'Denormalized from modifier_lists.catalog_id; kept in sync via trigger.';

CREATE INDEX modifiers_modifier_list_active_ordinal_idx
  ON public.modifiers (modifier_list_id, is_active, ordinal);
CREATE INDEX modifiers_catalog_id_idx ON public.modifiers (catalog_id);

CREATE FUNCTION public.modifiers_sync_catalog_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_catalog_id uuid;
BEGIN
  SELECT catalog_id INTO v_catalog_id FROM public.modifier_lists WHERE id = NEW.modifier_list_id;
  IF v_catalog_id IS NULL THEN
    RAISE EXCEPTION 'modifiers.modifier_list_id % does not exist', NEW.modifier_list_id;
  END IF;
  NEW.catalog_id := v_catalog_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modifiers_sync_catalog_id
  BEFORE INSERT OR UPDATE OF modifier_list_id ON public.modifiers
  FOR EACH ROW EXECUTE FUNCTION public.modifiers_sync_catalog_id();

CREATE TRIGGER trg_modifiers_set_updated_at
  BEFORE UPDATE ON public.modifiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_modifiers_bump_version
  BEFORE UPDATE ON public.modifiers
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY modifiers_select_anon ON public.modifiers
  FOR SELECT TO anon
  USING (is_active = true AND public.catalog_is_public(catalog_id));

CREATE POLICY modifiers_select_authed ON public.modifiers
  FOR SELECT TO authenticated
  USING (
    (is_active = true AND public.catalog_is_public(catalog_id))
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY modifiers_write ON public.modifiers
  FOR ALL TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

CREATE TABLE public.item_modifier_lists (
    item_id           uuid        NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    -- RESTRICT: prevent silently ripping a list off all items it's attached to.
    -- Editor must explicitly unlink before deleting the list.
    modifier_list_id  uuid        NOT NULL REFERENCES public.modifier_lists(id) ON DELETE RESTRICT,
    catalog_id        uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    ordinal           integer     NOT NULL DEFAULT 0,
    -- Square parity: per-item override of the list's selection bounds.
    min_selected_override integer,
    max_selected_override integer,
    -- Square parity: hide this list from customer-facing surfaces while still
    -- applying it server-side (e.g. internal kitchen modifiers).
    hidden_from_customer_override boolean NOT NULL DEFAULT false,
    is_active         boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, modifier_list_id),
    CHECK (min_selected_override IS NULL OR min_selected_override >= 0),
    CHECK (max_selected_override IS NULL OR max_selected_override >= COALESCE(min_selected_override, 0))
);

CREATE INDEX item_modifier_lists_modifier_list_id_idx ON public.item_modifier_lists (modifier_list_id);
CREATE INDEX item_modifier_lists_catalog_id_idx ON public.item_modifier_lists (catalog_id);

CREATE FUNCTION public.item_modifier_lists_sync_catalog_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_item_catalog_id uuid;
  v_list_catalog_id uuid;
BEGIN
  SELECT catalog_id INTO v_item_catalog_id FROM public.items WHERE id = NEW.item_id;
  SELECT catalog_id INTO v_list_catalog_id FROM public.modifier_lists WHERE id = NEW.modifier_list_id;
  IF v_item_catalog_id IS NULL THEN
    RAISE EXCEPTION 'item_modifier_lists.item_id % does not exist', NEW.item_id;
  END IF;
  IF v_list_catalog_id IS NULL THEN
    RAISE EXCEPTION 'item_modifier_lists.modifier_list_id % does not exist', NEW.modifier_list_id;
  END IF;
  IF v_item_catalog_id <> v_list_catalog_id THEN
    RAISE EXCEPTION 'cannot attach modifier_list % from catalog % to item % in catalog %',
      NEW.modifier_list_id, v_list_catalog_id, NEW.item_id, v_item_catalog_id;
  END IF;
  NEW.catalog_id := v_item_catalog_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_item_modifier_lists_sync_catalog_id
  BEFORE INSERT OR UPDATE OF item_id, modifier_list_id ON public.item_modifier_lists
  FOR EACH ROW EXECUTE FUNCTION public.item_modifier_lists_sync_catalog_id();

CREATE TRIGGER trg_item_modifier_lists_set_updated_at
  BEFORE UPDATE ON public.item_modifier_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.item_modifier_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY item_modifier_lists_select_anon ON public.item_modifier_lists
  FOR SELECT TO anon
  USING (is_active = true AND public.catalog_is_public(catalog_id));

CREATE POLICY item_modifier_lists_select_authed ON public.item_modifier_lists
  FOR SELECT TO authenticated
  USING (
    (is_active = true AND public.catalog_is_public(catalog_id))
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY item_modifier_lists_write ON public.item_modifier_lists
  FOR ALL TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 6. Backfill: one default variation per existing item, then drop items.price_cents
--
-- No ON CONFLICT clause: if any item already has a 'Default' variation, the
-- migration fails loudly. Baseline schema has items.price_cents NOT NULL DEFAULT 0,
-- so price_cents is never null in source data.
-- ===========================================================================

INSERT INTO public.item_variations (item_id, name, price_cents, is_default, is_active, ordinal)
SELECT i.id, 'Default', i.price_cents, true, true, 0
FROM public.items i;

ALTER TABLE public.items DROP COLUMN price_cents;

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.item_variations,
  public.item_variation_translations,
  public.modifier_lists,
  public.modifiers,
  public.item_modifier_lists
TO authenticated;

GRANT SELECT ON
  public.item_variations,
  public.item_variation_translations,
  public.modifier_lists,
  public.modifiers,
  public.item_modifier_lists
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.item_variations,
  public.item_variation_translations,
  public.modifier_lists,
  public.modifiers,
  public.item_modifier_lists
TO service_role;
