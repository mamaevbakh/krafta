-- KRA-42 wizard v2 / ADR 0005 §2 (amended) — guided seeding.
--
-- The onboarding wizard grows from "2 + Studio" to "7 + Studio": the merchant
-- curates sections, items + prices, order modes, languages and contacts
-- BEFORE the shop exists. Two consequences for the data layer:
--
-- 1. The wizard needs the vertical suggestions BEFORE any session exists
--    (step ① is pre-auth), so vertical_templates gets a read policy. It is
--    non-secret reference data — the same strings any visitor sees by
--    creating a shop.
--
-- 2. The curated menu is inserted by create_wizard_menu, a SECURITY INVOKER
--    function: atomic like the old definer seed, but every INSERT runs under
--    the caller's own RLS (org owner via create_draft_shop). This is how a
--    client-shaped payload stays trustworthy — RLS, not definer trust
--    (eng review D7 still holds: the DEFINER function never takes payloads).
--
-- The p_vertical seeding path inside create_draft_shop remains for API
-- stability and tests; the wizard now calls the bare path (p_vertical NULL,
-- p_name set) and then create_wizard_menu with the merchant's curation.

-- ---------------------------------------------------------------------------
-- 1. vertical_templates: public read (reference data)
-- ---------------------------------------------------------------------------

CREATE POLICY vertical_templates_select_all ON public.vertical_templates
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. create_wizard_menu — atomic curated-menu insert under caller RLS
-- ---------------------------------------------------------------------------
--
-- p_menu shape (validated by the server action; bounds re-checked here):
-- {
--   "categories": [{
--     "name": text, "slug": text, "position": int,
--     "translations": {"uz": {"name": text}, ...},   -- enabled locales only
--     "items": [{
--       "name": text, "slug": text, "position": int, "description": text?,
--       "seeded": bool,                  -- untouched suggestion → seeded_at
--       "variations": [{"name": text, "price_cents": int, "ordinal": int,
--                        "is_default": bool}],
--       "translations": {"uz": {"name": text, "description": text?}, ...}
--     }]
--   }]
-- }

CREATE OR REPLACE FUNCTION public.create_wizard_menu(
  p_catalog_id uuid,
  p_menu       jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = ''
AS $$
DECLARE
  v_category  jsonb;
  v_item      jsonb;
  v_variation jsonb;
  v_tr_key    text;
  v_tr_val    jsonb;
  v_cat_id    uuid;
  v_item_id   uuid;
  v_n_cats    int;
  v_n_items   int;
BEGIN
  SELECT count(*) INTO v_n_cats FROM jsonb_array_elements(coalesce(p_menu->'categories', '[]'::jsonb));
  SELECT count(*) INTO v_n_items
    FROM jsonb_array_elements(coalesce(p_menu->'categories', '[]'::jsonb)) c,
         jsonb_array_elements(coalesce(c->'items', '[]'::jsonb)) i;
  IF v_n_cats > 12 OR v_n_items > 60 THEN
    RAISE EXCEPTION 'menu too large for onboarding (max 12 sections, 60 items)' USING ERRCODE = '22023';
  END IF;

  FOR v_category IN SELECT * FROM jsonb_array_elements(coalesce(p_menu->'categories', '[]'::jsonb))
  LOOP
    INSERT INTO public.catalog_categories (catalog_id, name, slug, "position", is_active)
      VALUES (
        p_catalog_id,
        left(v_category->>'name', 64),
        left(v_category->>'slug', 64),
        coalesce((v_category->>'position')::integer, 0),
        true
      )
      RETURNING id INTO v_cat_id;

    FOR v_tr_key, v_tr_val IN SELECT * FROM jsonb_each(coalesce(v_category->'translations', '{}'::jsonb))
    LOOP
      INSERT INTO public.catalog_category_translations (category_id, locale, name, description)
        VALUES (v_cat_id, v_tr_key, v_tr_val->>'name', v_tr_val->>'description');
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_category->'items', '[]'::jsonb))
    LOOP
      INSERT INTO public.items (catalog_id, category_id, name, slug, description, "position", seeded_at)
        VALUES (
          p_catalog_id,
          v_cat_id,
          left(v_item->>'name', 80),
          left(v_item->>'slug', 80),
          v_item->>'description',
          coalesce((v_item->>'position')::integer, 0),
          CASE WHEN coalesce((v_item->>'seeded')::boolean, false) THEN now() ELSE NULL END
        )
        RETURNING id INTO v_item_id;

      FOR v_variation IN SELECT * FROM jsonb_array_elements(coalesce(v_item->'variations', '[]'::jsonb))
      LOOP
        INSERT INTO public.item_variations (item_id, catalog_id, name, price_cents, ordinal, is_default)
          VALUES (
            v_item_id,
            p_catalog_id,
            left(v_variation->>'name', 64),
            greatest(0, least(coalesce((v_variation->>'price_cents')::bigint, 0), 1000000000))::integer,
            coalesce((v_variation->>'ordinal')::integer, 0),
            coalesce((v_variation->>'is_default')::boolean, false)
          );
      END LOOP;

      FOR v_tr_key, v_tr_val IN SELECT * FROM jsonb_each(coalesce(v_item->'translations', '{}'::jsonb))
      LOOP
        INSERT INTO public.item_translations (item_id, locale, name, description)
          VALUES (v_item_id, v_tr_key, v_tr_val->>'name', v_tr_val->>'description');
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.create_wizard_menu(uuid, jsonb) IS
  'KRA-42 wizard v2: atomic insert of the merchant-curated onboarding menu. SECURITY INVOKER on purpose — RLS (org owner/admin) authorizes every row, so the client-shaped payload carries no elevated trust. Search docs ride the existing AFTER triggers.';

REVOKE EXECUTE ON FUNCTION public.create_wizard_menu(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_wizard_menu(uuid, jsonb) TO authenticated;
