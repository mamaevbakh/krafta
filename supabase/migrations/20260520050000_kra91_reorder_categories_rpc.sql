-- KRA-91 — atomic reorder RPC for catalog_categories.
--
-- Mirror of public.reorder_items but for the catalog_categories table.
-- The Library Canvas's category-drag UX (GripVertical handle on each
-- section header) batches all changed positions into one round-trip; the
-- RPC body is atomic by default so a half-applied reorder is impossible.
--
-- Why a function instead of N parallel UPDATEs from the app: PostgREST has
-- no cross-request transaction surface. Promise.all of N updates can
-- half-apply if one rejects — leaving the catalog with duplicate or
-- gapped positions and no clean recovery. Same rationale as KRA-35's
-- reorder_items.
--
-- RLS: SECURITY INVOKER (default). Each UPDATE inside the loop hits the
-- caller's RLS policies on public.catalog_categories. If the caller
-- can't update a row, the UPDATE is a silent no-op (0 rows affected) —
-- we don't raise on missing rows because that would let an attacker
-- probe category existence via error messages. The catalog_id parameter
-- is a defensive scope filter, not the auth boundary.


CREATE OR REPLACE FUNCTION public.reorder_categories(
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
BEGIN
  IF p_catalog_id IS NULL THEN
    RAISE EXCEPTION 'reorder_categories: p_catalog_id required'
      USING ERRCODE = '22023';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'reorder_categories: p_changes must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_id := NULLIF(v_change->>'id', '')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'reorder_categories: each change requires non-null id'
        USING ERRCODE = '22023';
    END IF;

    v_position := NULLIF(v_change->>'position', '')::int;
    IF v_position IS NULL THEN
      RAISE EXCEPTION 'reorder_categories: each change requires position'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.catalog_categories
    SET position = v_position
    WHERE id = v_id
      AND catalog_id = p_catalog_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.reorder_categories(uuid, jsonb) IS
  'KRA-91: atomic batched reorder of catalog_categories within a catalog.
  Pass an array of {id, position} objects. RLS gates which rows the
  caller can touch.';

REVOKE EXECUTE ON FUNCTION public.reorder_categories(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.reorder_categories(uuid, jsonb) TO authenticated;
