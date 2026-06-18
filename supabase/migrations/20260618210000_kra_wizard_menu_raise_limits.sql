-- Raise the onboarding curated-menu size guard to match the client caps.
--
-- create_wizard_menu hardcoded "max 12 sections, 60 items" and RAISEs 22023 when
-- exceeded. The onboarding "Snap your menu" flow now lets a merchant upload up to
-- 20 photos of a real menu, and the client/submit caps were raised to 50
-- categories / 100 items-per-category / 1000 items total — so a rich extracted
-- menu would pass the client but fail this RPC ("We couldn't set up your shop").
--
-- Align the DB guard with the client: 50 sections / 1000 items. createShopFromWizard
-- already rejects > 1000 total items with a friendly message before calling the RPC,
-- so this is the matching ceiling. Function body is otherwise unchanged (verbatim
-- from pg_get_functiondef); only the two limits + the message differ.
--
-- Applied to the dev branch via MCP; this file is the source of truth for prod.

CREATE OR REPLACE FUNCTION public.create_wizard_menu(p_catalog_id uuid, p_menu jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  IF v_n_cats > 50 OR v_n_items > 1000 THEN
    RAISE EXCEPTION 'menu too large for onboarding (max 50 sections, 1000 items)' USING ERRCODE = '22023';
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
$function$;
