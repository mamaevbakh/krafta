-- KRA-35 PR1 / Library Foundation: atomic reorder + duplicate RPCs for items.
--
-- Two SECURITY INVOKER plpgsql functions over the existing KRA-54 schema:
--
--   reorder_items(p_catalog_id, p_changes jsonb)
--     Batched UPDATE of items.position (and optionally items.category_id
--     for cross-category drag) in a single transaction. RLS gates which
--     rows the caller can touch — same access policies that govern direct
--     UPDATE calls already.
--
--   duplicate_item(p_catalog_id, p_item_id) -> uuid
--     Deep clone of one item: items row + item_variations + item_modifier_lists
--     + item_translations + item_media. New default-locale name gets a
--     " (copy)" suffix; non-default translations clone verbatim per the
--     KRA-35 design doc Decisions §"Cardinal duplicate" rule. Media
--     storage_path is shared between source and clone — same Storage
--     object referenced by two rows, no actual file duplication. The slug
--     is uniquified with "{slug}-copy", "{slug}-copy-2", etc.
--
-- Both functions are SECURITY INVOKER (default). They run as the caller,
-- so RLS applies. PL/pgSQL function bodies are always atomic, which is
-- the only reason we need the wrapper instead of doing multiple .update()
-- calls from the app: PostgREST has no cross-request transaction surface,
-- and a half-applied reorder is the worst possible outcome (positions
-- corrupt, no clean recovery).
--
-- See:
--   docs/adr/0001-orders-catalog-schema-v1.md §3.1 (items + variations)
--   ~/.gstack/projects/mamaevbakh-krafta/bakh-dev-design-20260520-032237.md
--   (KRA-35 design doc — Next Steps T4 + T5 + ER1 + ER4)


-- ===========================================================================
-- 1. reorder_items
-- ===========================================================================
--
-- Accepts an array of { id, position, category_id? } objects. Each row's
-- position (and optionally category_id) is updated; bump_version trigger
-- fires per row (BEFORE UPDATE FOR EACH ROW, per KRA-54 §1), so a batch
-- of N reorders produces N version bumps. That's fine — the trigger is
-- the schema's intentional behavior; orders snapshot catalog_version at
-- order creation, not at every read, so cart-in-flight is unaffected.
--
-- WHY a function: PostgREST has no transaction surface, so the only way
-- to get "all-or-nothing" reorder semantics from the app is server-side.
-- Promise.all of multiple .update() calls can half-apply if one rejects,
-- which leaves positions inconsistent (e.g. two items both at position 3).
--
-- RLS: SECURITY INVOKER means each UPDATE inside the loop hits the
-- caller's RLS policies on public.items. If the caller can't update a
-- given row, the UPDATE fails silently (0 rows affected) — the function
-- doesn't raise on missing rows because that would let an attacker probe
-- existence via error messages. The catalog_id parameter is a defensive
-- scope filter, not the auth boundary.

CREATE OR REPLACE FUNCTION public.reorder_items(
  p_catalog_id uuid,
  p_changes jsonb
) RETURNS void
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_change jsonb;
  v_id uuid;
  v_position int;
  v_category_id uuid;
BEGIN
  IF p_catalog_id IS NULL THEN
    RAISE EXCEPTION 'reorder_items: p_catalog_id required'
      USING ERRCODE = '22023';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'reorder_items: p_changes must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_id := NULLIF(v_change->>'id', '')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'reorder_items: each change requires non-null id'
        USING ERRCODE = '22023';
    END IF;

    -- Position is required per change. Category_id is optional (only set
    -- on cross-category drag).
    v_position := NULLIF(v_change->>'position', '')::int;
    IF v_position IS NULL THEN
      RAISE EXCEPTION 'reorder_items: each change requires position'
        USING ERRCODE = '22023';
    END IF;

    v_category_id := NULLIF(v_change->>'category_id', '')::uuid;

    -- Update — RLS gates whether this row is reachable. updated_at +
    -- version bump via existing triggers (KRA-54).
    UPDATE public.items
    SET
      position    = v_position,
      category_id = COALESCE(v_category_id, category_id)
    WHERE id = v_id
      AND catalog_id = p_catalog_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.reorder_items(uuid, jsonb) IS
  'KRA-35 PR1: atomic batched reorder of items within a catalog. Pass an
  array of {id, position, category_id?} objects. Cross-category drag
  passes the new category_id. RLS gates which rows the caller can touch.';

REVOKE EXECUTE ON FUNCTION public.reorder_items(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.reorder_items(uuid, jsonb) TO authenticated;


-- ===========================================================================
-- 2. duplicate_item
-- ===========================================================================
--
-- Deep clone of one item under the same catalog. The new item has:
--   - A fresh uuid
--   - The same category_id, product_type, description, image_alt
--   - Name suffixed with " (copy)" (default-locale only)
--   - Slug "{old_slug}-copy" (with "-copy-2", "-copy-3" suffixes on collision)
--   - position = source.position + 1 (does NOT shift other items down;
--     the app's reorder_items handles that separately if needed — keeping
--     this function single-purpose)
--   - All variations cloned (UNIQUE(item_id, name) doesn't conflict because
--     item_id is fresh; ditto the partial unique index on is_default)
--   - All item_modifier_lists join rows cloned
--   - All item_translations cloned VERBATIM (the "(copy)" suffix lives on
--     items.name only, per design doc Decisions §"Cardinal duplicate")
--   - All item_media metadata cloned with shared storage_path (no
--     actual file duplication — cheap, and Storage object is shared
--     until either parent deletes its media row)
--
-- Returns the new item_id so the caller can immediately select / scroll-to
-- the clone in the Library Canvas.

CREATE OR REPLACE FUNCTION public.duplicate_item(
  p_catalog_id uuid,
  p_item_id uuid
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_old           public.items%ROWTYPE;
  v_new_item_id   uuid := gen_random_uuid();
  v_new_slug      text;
  v_suffix        int := 1;
BEGIN
  IF p_catalog_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'duplicate_item: p_catalog_id and p_item_id required'
      USING ERRCODE = '22023';
  END IF;

  -- RLS-aware fetch. If the caller can't read the source item, NOT FOUND.
  SELECT * INTO v_old
  FROM public.items
  WHERE id = p_item_id
    AND catalog_id = p_catalog_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duplicate_item: source item not found or not accessible'
      USING ERRCODE = 'P0002';
  END IF;

  -- Uniquify slug: "{slug}-copy", "{slug}-copy-2", "{slug}-copy-3", …
  v_new_slug := v_old.slug || '-copy';
  WHILE EXISTS (
    SELECT 1 FROM public.items
    WHERE catalog_id = p_catalog_id
      AND slug = v_new_slug
  ) LOOP
    v_suffix := v_suffix + 1;
    v_new_slug := v_old.slug || '-copy-' || v_suffix;
  END LOOP;

  -- Clone items row. We omit price_cents (dropped by KRA-54 — price now
  -- lives on item_variations) and explicitly set the new id/name/slug.
  -- created_at + updated_at default to now(); is_active mirrors source.
  INSERT INTO public.items (
    id, catalog_id, category_id, product_type, name, slug,
    description, image_path, image_alt, position, is_active, metadata
  )
  VALUES (
    v_new_item_id,
    v_old.catalog_id,
    v_old.category_id,
    v_old.product_type,
    v_old.name || ' (copy)',
    v_new_slug,
    v_old.description,
    v_old.image_path,
    v_old.image_alt,
    v_old.position + 1,
    v_old.is_active,
    v_old.metadata
  );

  -- Clone variations. UNIQUE(item_id, name) doesn't fire because item_id
  -- is fresh. The KRA-54 partial unique index on (item_id) WHERE is_default
  -- is satisfied (one default per item, same as source).
  INSERT INTO public.item_variations (
    item_id, catalog_id, name, sku, pricing_type, price_cents,
    ordinal, is_default, is_active, is_sold_out, metadata
  )
  SELECT
    v_new_item_id, catalog_id, name, sku, pricing_type, price_cents,
    ordinal, is_default, is_active, is_sold_out, metadata
  FROM public.item_variations
  WHERE item_id = p_item_id;

  -- Clone modifier-list attachments. The modifier_lists themselves are
  -- catalog-scoped and shared across items, so we only clone the join
  -- rows (per-item overrides + hidden_from_customer flag).
  INSERT INTO public.item_modifier_lists (
    item_id, modifier_list_id, catalog_id, ordinal,
    min_selected_override, max_selected_override,
    hidden_from_customer_override, is_active
  )
  SELECT
    v_new_item_id, modifier_list_id, catalog_id, ordinal,
    min_selected_override, max_selected_override,
    hidden_from_customer_override, is_active
  FROM public.item_modifier_lists
  WHERE item_id = p_item_id;

  -- Clone translations VERBATIM. The "(copy)" suffix lives on items.name
  -- (default locale) only; non-default locales clone the source string
  -- unchanged because re-translating "Капучино" to "Капучино (copy)" in
  -- every locale would be noisy and merchant-unfriendly. Merchants can
  -- rename per locale after duplicating.
  INSERT INTO public.item_translations (
    item_id, locale, name, description, image_alt
  )
  SELECT
    v_new_item_id, locale, name, description, image_alt
  FROM public.item_translations
  WHERE item_id = p_item_id;

  -- Clone media metadata. storage_path is SHARED — same Supabase Storage
  -- object referenced by two item_media rows. No actual file duplication;
  -- cheap. If the source row is later deleted, the file stays until the
  -- clone is also deleted (cleanup_media_storage in actions.ts removes
  -- the file only when no remaining row references it).
  INSERT INTO public.item_media (
    item_id, bucket, storage_path, mime_type, kind,
    title, alt, position, is_primary,
    bytes, width, height, duration_ms
  )
  SELECT
    v_new_item_id, bucket, storage_path, mime_type, kind,
    title, alt, position, is_primary,
    bytes, width, height, duration_ms
  FROM public.item_media
  WHERE item_id = p_item_id;

  RETURN v_new_item_id;
END;
$$;

COMMENT ON FUNCTION public.duplicate_item(uuid, uuid) IS
  'KRA-35 PR1: atomic deep clone of an item — items row + item_variations
  + item_modifier_lists + item_translations + item_media. Returns new
  item_id. Default-locale name gets " (copy)" suffix; non-default
  translations clone verbatim. Media storage_path is shared between
  source and clone (no actual storage duplication). RLS gates access.';

REVOKE EXECUTE ON FUNCTION public.duplicate_item(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.duplicate_item(uuid, uuid) TO authenticated;
