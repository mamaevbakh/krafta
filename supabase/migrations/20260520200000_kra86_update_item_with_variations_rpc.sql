-- KRA-86 — atomic item + variations editor RPC.
--
-- One SECURITY INVOKER plpgsql function that updates BOTH:
--   * a row in public.items (fields the merchant edited in EditorSheet), AND
--   * a set of public.item_variations rows (insert / update / delete)
-- inside a single transaction. This replaces the parallel-dispatch pattern
-- that the original KRA-86 plan §3.4 proposed.
--
-- Why a single RPC instead of two parallel server actions:
--   * Atomicity: if the item UPDATE succeeds but the variation UPDATE fails
--     (or vice versa), the merchant ends up in a half-saved state. PostgREST
--     has no cross-request transaction surface, so the only way to get
--     all-or-nothing semantics is to do both writes inside one plpgsql
--     function body.
--   * Reduces round-trips: one .rpc() call instead of two.
--
-- Why translations stay outside this RPC:
--   * `item_translations` is a separate table with its own RLS surface; the
--     existing updateItem server action handles its upsert pattern (insert
--     new locales, update existing) which is non-trivial. Keeping that in
--     the server action keeps the RPC narrowly focused on items +
--     item_variations.
--
-- See:
--   ~/.gstack/projects/mamaevbakh-krafta/bakh-dev-kra86-variations-plan-20260520-191547.md
--     §11.4 — full RPC spec post-/plan-eng-review
--   supabase/migrations/20260520040000_kra35_items_reorder_duplicate_rpcs.sql
--     — reference for the SECURITY INVOKER + jsonb-changes pattern
--   supabase/migrations/20260507120000_kra54_item_variations_and_modifiers.sql
--     — partial UNIQUE INDEX item_variations_one_default_per_item; this RPC
--       respects it via the explicit demote-pass below.


-- ===========================================================================
-- update_item_with_variations
-- ===========================================================================
--
-- p_item_fields shape:
--   {
--     "name"?:         text,
--     "slug"?:         text,
--     "category_id"?:  uuid,
--     "product_type"?: text,    -- enum: REGULAR / VARIANT_BUNDLE / ...
--     "description"?: text|null,
--     "image_alt"?:   text|null
--   }
--   Fields not present in the JSON are NOT touched on the items row.
--   `description` / `image_alt` use the JSON `?` operator to distinguish
--   "set to null" from "don't touch."
--
-- p_variation_changes shape: array of
--   { "op": "upsert", "id"?: uuid, "name": text, "price_cents": int,
--     "ordinal": int, "is_default": bool, "is_sold_out": bool }
--   { "op": "delete", "id": uuid }
--   Order in the array doesn't matter — the RPC runs deletes first, then
--   the demote-pass, then upserts.
--
-- Constraints respected:
--   * UNIQUE (item_id, name)                  — enforced row-by-row; deletes
--                                              run first to avoid collision
--                                              when a name is renamed onto
--                                              a soon-to-be-deleted row.
--   * UNIQUE (item_id) WHERE is_default       — enforced row-by-row; the
--                                              demote-pass clears the OLD
--                                              default BEFORE the upsert
--                                              loop, so the index never
--                                              sees two `true` rows.
--                                              Partial UNIQUE INDEXes in
--                                              Postgres CANNOT be made
--                                              DEFERRABLE, so the pre-step
--                                              is required.
--
-- Failure modes:
--   * Item not found            → RAISE 22023 (item-existence guard)
--   * Bad p_variation_changes   → RAISE 22023
--   * Unknown op value          → RAISE 22023 (catches client bugs)
--   * Final variation count = 0 → RAISE 23514 (check_violation)
--   * RLS denial                → UPDATE silently no-ops; no error
--                                  (defensive; doesn't leak existence info)
--   * Same-name collision       → Postgres UNIQUE raises 23505 from inside
--                                  the upsert loop; transaction rolls back

CREATE OR REPLACE FUNCTION public.update_item_with_variations(
  p_item_id           uuid,
  p_item_fields       jsonb,
  p_variation_changes jsonb
) RETURNS void
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
DECLARE
  v_catalog_id      uuid;
  v_change          jsonb;
  v_op              text;
  v_id              uuid;
  v_name            text;
  v_price_cents     bigint;
  v_ordinal         int;
  v_is_default      bool;
  v_is_sold_out     bool;
  v_new_default_id  uuid;
  v_surviving_count int;
BEGIN
  -- ----------------------------------------------------------------------
  -- 0. Input validation
  -- ----------------------------------------------------------------------
  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'update_item_with_variations: p_item_id required'
      USING ERRCODE = '22023';
  END IF;

  -- p_item_fields nullable but if provided must be a JSON object.
  IF p_item_fields IS NOT NULL
     AND jsonb_typeof(p_item_fields) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'update_item_with_variations: p_item_fields must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  -- p_variation_changes nullable but if provided must be a JSON array.
  IF p_variation_changes IS NOT NULL
     AND jsonb_typeof(p_variation_changes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'update_item_with_variations: p_variation_changes must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  -- ----------------------------------------------------------------------
  -- 1. Hoist catalog_id (P1) + existence guard.
  --    Single SELECT; reused by the INSERT branch in the upsert loop.
  -- ----------------------------------------------------------------------
  SELECT i.catalog_id INTO v_catalog_id
    FROM public.items i
    WHERE i.id = p_item_id;
  IF v_catalog_id IS NULL THEN
    RAISE EXCEPTION 'update_item_with_variations: item % not found', p_item_id
      USING ERRCODE = '22023';
  END IF;

  -- ----------------------------------------------------------------------
  -- 2. Item fields UPDATE (only touches columns present in p_item_fields).
  --    Skipped entirely if p_item_fields is NULL or empty.
  --
  --    The trg_items_bump_version trigger fires once here on UPDATE.
  -- ----------------------------------------------------------------------
  IF p_item_fields IS NOT NULL AND p_item_fields <> '{}'::jsonb THEN
    UPDATE public.items
    SET
      name         = COALESCE(p_item_fields->>'name', name),
      slug         = COALESCE(p_item_fields->>'slug', slug),
      category_id  = COALESCE(NULLIF(p_item_fields->>'category_id', '')::uuid, category_id),
      product_type = COALESCE(
        (p_item_fields->>'product_type')::public.catalog_item_product_type,
        product_type
      ),
      -- description + image_alt use the `?` operator so "field present, value null"
      -- is treated as "explicit null" vs "field absent" = "don't touch."
      description  = CASE
        WHEN p_item_fields ? 'description' THEN p_item_fields->>'description'
        ELSE description
      END,
      image_alt    = CASE
        WHEN p_item_fields ? 'image_alt' THEN p_item_fields->>'image_alt'
        ELSE image_alt
      END,
      updated_at   = now()
    WHERE id = p_item_id;
  END IF;

  -- ----------------------------------------------------------------------
  -- 3. Variation changes.
  --    Skipped if p_variation_changes is null or empty array.
  -- ----------------------------------------------------------------------
  IF p_variation_changes IS NOT NULL
     AND jsonb_array_length(p_variation_changes) > 0 THEN

    -- 3a. Identify the row targeted as NEW default (if any). Only relevant
    --     for the demote-pass. NULL if no change sets is_default = true.
    SELECT (c->>'id')::uuid INTO v_new_default_id
      FROM jsonb_array_elements(p_variation_changes) c
      WHERE c->>'op' = 'upsert'
        AND COALESCE((c->>'is_default')::bool, false) = true
      LIMIT 1;

    -- 3b. DEMOTE-PASS (A1).
    --     Clear is_default on every existing variation of this item EXCEPT
    --     the row targeted as the new default. This guarantees the partial
    --     UNIQUE INDEX item_variations_one_default_per_item is never violated
    --     mid-transaction.
    --
    --     Partial UNIQUE INDEXes in Postgres CANNOT be DEFERRABLE, so the
    --     row-by-row constraint check requires this pre-step.
    --
    --     If v_new_default_id is NULL (i.e. the payload doesn't set any row
    --     as default), we still demote every existing default — the upsert
    --     loop is responsible for setting exactly one row's is_default=true
    --     OR we end up with zero defaults, which is a data bug the schema
    --     allows (the partial unique only forbids >1, not 0).
    --
    --     NOTE: for INSERT-with-is_default=true (no existing id), the
    --     v_new_default_id query returns NULL because we filter by
    --     `(c->>'id')::uuid` which is NULL for new rows. That demotes ALL
    --     existing defaults, then the INSERT adds the new default row.
    --     Exactly one row ends up with is_default=true post-insert. ✓
    UPDATE public.item_variations
    SET is_default = false
    WHERE item_id = p_item_id
      AND is_default = true
      AND (v_new_default_id IS NULL OR id <> v_new_default_id);

    -- 3c. DELETE LOOP.
    --     Runs BEFORE the upsert loop so name renames don't collide with
    --     soon-to-be-deleted rows via the UNIQUE(item_id, name) constraint.
    FOR v_change IN SELECT * FROM jsonb_array_elements(p_variation_changes) LOOP
      v_op := v_change->>'op';
      IF v_op = 'delete' THEN
        v_id := (v_change->>'id')::uuid;
        IF v_id IS NULL THEN
          RAISE EXCEPTION 'update_item_with_variations: delete op requires id'
            USING ERRCODE = '22023';
        END IF;
        DELETE FROM public.item_variations
          WHERE id = v_id AND item_id = p_item_id;
      ELSIF v_op <> 'upsert' THEN
        -- CQ3: catch typos / version skew loudly instead of silent no-op.
        RAISE EXCEPTION 'update_item_with_variations: unknown op %', v_op
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- 3d. UPSERT LOOP.
    --     INSERT (id missing) or UPDATE (id present). The
    --     trg_item_variations_bump_version trigger fires per row.
    FOR v_change IN SELECT * FROM jsonb_array_elements(p_variation_changes) LOOP
      v_op := v_change->>'op';
      IF v_op = 'upsert' THEN
        v_id          := NULLIF(v_change->>'id', '')::uuid;
        v_name        := v_change->>'name';
        v_price_cents := COALESCE((v_change->>'price_cents')::bigint, 0);
        v_ordinal     := COALESCE((v_change->>'ordinal')::int, 0);
        v_is_default  := COALESCE((v_change->>'is_default')::bool, false);
        v_is_sold_out := COALESCE((v_change->>'is_sold_out')::bool, false);

        IF v_name IS NULL OR length(trim(v_name)) = 0 THEN
          RAISE EXCEPTION 'update_item_with_variations: variation name required'
            USING ERRCODE = '22023';
        END IF;

        IF v_id IS NULL THEN
          -- INSERT new row. catalog_id reused from the function-scope hoist.
          INSERT INTO public.item_variations
            (item_id, catalog_id, name, price_cents, ordinal,
             is_default, is_active, is_sold_out, pricing_type)
          VALUES
            (p_item_id, v_catalog_id, v_name, v_price_cents, v_ordinal,
             v_is_default, true, v_is_sold_out, 'fixed');
        ELSE
          -- UPDATE existing row. pricing_type / sku / metadata preserved
          -- (we don't touch them; existing 'variable' rows survive).
          UPDATE public.item_variations
          SET name        = v_name,
              price_cents = v_price_cents,
              ordinal     = v_ordinal,
              is_default  = v_is_default,
              is_sold_out = v_is_sold_out
          WHERE id = v_id AND item_id = p_item_id;
        END IF;
      END IF;
      -- 'delete' ops already handled in 3c; bad ops already raised.
    END LOOP;

    -- 3e. MIN-ROW GUARD (A5).
    --     After all writes, an item must have ≥ 1 variation row. Closes
    --     the two-tab race where window A deletes-all + window B saves
    --     no-op. Customer-side reads use !inner join on is_default; an
    --     item with zero variations vanishes from the public catalog.
    SELECT count(*) INTO v_surviving_count
      FROM public.item_variations
      WHERE item_id = p_item_id;
    IF v_surviving_count = 0 THEN
      RAISE EXCEPTION 'update_item_with_variations: item % must have at least one variation', p_item_id
        USING ERRCODE = '23514';  -- check_violation
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_item_with_variations(uuid, jsonb, jsonb) IS
  'KRA-86 — atomic save of an items row + its item_variations rows. See migration header for the changes-array shape and partial-unique-index handling.';

-- Caller must be authenticated. RLS gates per-row access; the function
-- runs SECURITY INVOKER so each UPDATE inside this body hits the caller's
-- RLS policies on items / item_variations.
REVOKE EXECUTE ON FUNCTION public.update_item_with_variations(uuid, jsonb, jsonb) FROM public;
GRANT  EXECUTE ON FUNCTION public.update_item_with_variations(uuid, jsonb, jsonb) TO authenticated;
