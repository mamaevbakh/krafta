-- KRA-42 wizard PR 2 — complete_wizard learns the Look preset.
--
-- The wizard's new Look screen picks a storefront preset; the submit now
-- carries the resolved settings_layout plus a settings_branding marker
-- ({ preset: <key> }) so the activation checklist's "Pick your look" fact
-- is honestly satisfied by the wizard choice.
--
-- Adding parameters changes the function signature, and CREATE OR REPLACE
-- would leave the old 8-arg overload behind (ambiguous call sites, stale
-- grants). Drop + recreate; the only caller is the wizard submit, which
-- ships in the same deploy.

DROP FUNCTION IF EXISTS public.complete_wizard(
  uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer
);

CREATE FUNCTION public.complete_wizard(
  p_catalog_id  uuid,
  p_vertical    public.shop_vertical,
  p_currency    jsonb,
  p_modes       text[],
  p_address     jsonb,
  p_locales     jsonb,
  p_menu        jsonb,
  p_table_count integer,
  p_layout      jsonb DEFAULT NULL,
  p_branding    jsonb DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
AS $$
DECLARE
  v_venue_id  uuid;
  v_org_id    uuid;
  v_n_locales integer;
BEGIN
  -- Bounds (the server action validates first; re-checked here so the
  -- function is safe to call from anywhere).
  IF p_table_count IS NULL OR p_table_count < 0 OR p_table_count > 50 THEN
    RAISE EXCEPTION 'table count out of range (0-50)' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_n_locales
    FROM jsonb_array_elements(coalesce(p_locales, '[]'::jsonb));
  IF v_n_locales < 1 OR v_n_locales > 6 THEN
    RAISE EXCEPTION 'locale count out of range (1-6)' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: an existing menu means the wizard already completed.
  IF EXISTS (SELECT 1 FROM public.items WHERE catalog_id = p_catalog_id)
     OR EXISTS (SELECT 1 FROM public.catalog_categories WHERE catalog_id = p_catalog_id)
  THEN
    RETURN;
  END IF;

  -- Catalog identity + currency + chosen look. RLS scopes the UPDATE: zero
  -- rows means the caller doesn't own this catalog (or it doesn't exist) —
  -- abort before any other write. Layout/branding only write when provided,
  -- so older callers and look-less paths leave catalog defaults untouched.
  UPDATE public.catalogs
     SET vertical = p_vertical,
         settings_currency = p_currency,
         settings_layout = CASE
           WHEN p_layout IS NOT NULL AND p_layout <> '{}'::jsonb
           THEN p_layout ELSE settings_layout END,
         settings_branding = CASE
           WHEN p_branding IS NOT NULL AND p_branding <> '{}'::jsonb
           THEN p_branding ELSE settings_branding END
   WHERE id = p_catalog_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog not found or not owned' USING ERRCODE = '42501';
  END IF;

  -- Venue: order modes + contact patch (city/phone merge into address).
  -- venues.modes_enabled CHECKs enforce the allowlist + at-least-one.
  UPDATE public.venues
     SET modes_enabled = p_modes,
         address = coalesce(address, '{}'::jsonb) || coalesce(p_address, '{}'::jsonb)
   WHERE catalog_id = p_catalog_id
   RETURNING id, org_id INTO v_venue_id, v_org_id;

  -- Enabled locales. Upsert keeps the function re-runnable even though the
  -- transaction makes a same-payload retry hit a clean slate anyway.
  INSERT INTO public.catalog_locales
    (catalog_id, locale, is_default, is_enabled, sort_order, display_name, text_direction)
  SELECT p_catalog_id,
         l->>'locale',
         coalesce((l->>'is_default')::boolean, false),
         true,
         (ord - 1)::integer,
         l->>'display_name',
         coalesce(l->>'text_direction', 'ltr')
    FROM jsonb_array_elements(coalesce(p_locales, '[]'::jsonb)) WITH ORDINALITY AS t(l, ord)
  ON CONFLICT (catalog_id, locale) DO UPDATE
    SET is_default = excluded.is_default,
        is_enabled = true,
        sort_order = excluded.sort_order;

  -- The curated menu — same atomic insert as before, same transaction now.
  IF jsonb_array_length(coalesce(p_menu->'categories', '[]'::jsonb)) > 0 THEN
    PERFORM public.create_wizard_menu(p_catalog_id, p_menu);
  END IF;

  -- Dine-in tables + paired table QRs, bulk. Labels are "1".."N"; the
  -- tables/qr_codes triggers sync org + catalog from the venue and the
  -- shortcode column self-generates. The NOT EXISTS guard keeps a re-run
  -- of the zero-menu path (where the items/categories check above can't
  -- detect completion) from stamping duplicate tables.
  IF p_table_count > 0 AND 'dine_in' = ANY(p_modes) AND v_venue_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.tables WHERE venue_id = v_venue_id)
  THEN
    WITH new_tables AS (
      INSERT INTO public.tables (org_id, venue_id, label, "position")
      SELECT v_org_id, v_venue_id, n::text, n - 1
        FROM generate_series(1, p_table_count) AS n
      RETURNING id, org_id, venue_id
    )
    INSERT INTO public.qr_codes (org_id, venue_id, catalog_id, kind, table_id)
    SELECT org_id, venue_id, p_catalog_id, 'table', id
      FROM new_tables;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.complete_wizard(uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer, jsonb, jsonb) IS
  'KRA-42: one-shot transactional onboarding submit — catalog settings (incl. Look preset layout/branding), venue modes/contacts, locales, curated menu (via create_wizard_menu) and dine-in table QRs in a single SECURITY INVOKER call under the caller''s RLS. Idempotent: no-ops when the catalog already has a menu.';

REVOKE EXECUTE ON FUNCTION public.complete_wizard(uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_wizard(uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer, jsonb, jsonb) TO authenticated;
