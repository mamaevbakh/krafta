-- KRA-42 — align onboarding locale codes with the canonical registry.
--
-- lib/locales/registry.ts is the single source of truth for locale codes and
-- it spells Uzbek (Latin) as `uz-Latn` (BCP-47), not bare `uz`. The wizard's
-- templates and the legacy seed path used `uz`, so workbench-added languages
-- and onboarding-seeded ones were two different Uzbeks. Forward-fix only:
--
--   1. Re-key vertical_templates translations  "uz" → "uz-Latn".
--   2. Re-point the legacy create_draft_shop locale row to uz-Latn with the
--      registry's native name ("Oʻzbek tili").
--
-- Existing catalog_locales / item_translations rows keyed `uz` are left in
-- place: each catalog is internally consistent (storefront resolution matches
-- catalog_locales.locale ↔ item_translations.locale per catalog), and a
-- blanket re-key needs collision handling where a catalog has both variants.
-- That cleanup is tracked separately.

UPDATE public.vertical_templates
   SET template = replace(template::text, '"uz":', '"uz-Latn":')::jsonb,
       updated_at = now();

CREATE OR REPLACE FUNCTION public.create_draft_shop(
  p_slug     text,
  p_vertical public.shop_vertical DEFAULT NULL,
  p_name     text DEFAULT NULL
)
  RETURNS TABLE(org_id uuid, catalog_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_org_id     uuid;
  v_catalog_id uuid;
  v_name       text;
  v_template   jsonb;
  v_modes      text[];
  v_category   jsonb;
  v_item       jsonb;
  v_variation  jsonb;
  v_tr_key     text;
  v_tr_val     jsonb;
  v_cat_id     uuid;
  v_item_id    uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_slug IS NULL OR length(p_slug) < 3 OR length(p_slug) > 64
     OR p_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'slug must be 3-64 chars, [a-z0-9-]' USING ERRCODE = '22023';
  END IF;
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  IF v_name IS NOT NULL AND length(v_name) > 80 THEN
    RAISE EXCEPTION 'name must be at most 80 chars' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('create_draft_shop:' || v_user_id::text, 0));

  SELECT om.org_id, c.id
    INTO v_org_id, v_catalog_id
    FROM public.organization_members om
    JOIN public.catalogs c ON c.org_id = om.org_id
   WHERE om.user_id = v_user_id AND om.role = 'owner'
   ORDER BY c.created_at
   LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    RETURN QUERY SELECT v_org_id, v_catalog_id;
    RETURN;
  END IF;

  IF p_vertical IS NOT NULL THEN
    SELECT vt.template INTO v_template
      FROM public.vertical_templates vt
     WHERE vt.key = p_vertical;
    IF v_template IS NULL THEN
      RAISE EXCEPTION 'no template for vertical %', p_vertical USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(m.value), ARRAY['pickup'])
      INTO v_modes
      FROM jsonb_array_elements_text(v_template->'modes') AS m(value);
  END IF;

  INSERT INTO public.organizations (slug, name)
    VALUES (p_slug, coalesce(v_name, 'My shop'))
    RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');

  INSERT INTO public.catalogs (org_id, slug, name, vertical, settings_currency)
    VALUES (
      v_org_id, p_slug, coalesce(v_name, 'My catalog'), p_vertical,
      coalesce(v_template->'currency_settings', '{}'::jsonb)
    )
    RETURNING id INTO v_catalog_id;

  INSERT INTO public.venues (catalog_id, org_id, slug, name, status, modes_enabled)
    VALUES (
      v_catalog_id, v_org_id, p_slug, coalesce(v_name, 'My venue'), 'paused',
      coalesce(v_modes, ARRAY['pickup','dine_in','delivery'])
    );

  IF p_vertical IS NULL THEN
    RETURN QUERY SELECT v_org_id, v_catalog_id;
    RETURN;
  END IF;

  -- Registry-aligned locale codes (uz-Latn, not bare uz).
  INSERT INTO public.catalog_locales (catalog_id, locale, is_default, is_enabled, sort_order, display_name, text_direction)
  VALUES
    (v_catalog_id, 'ru',      true,  true, 0, 'Русский',      'ltr'),
    (v_catalog_id, 'uz-Latn', false, true, 1, 'Oʻzbek tili',  'ltr'),
    (v_catalog_id, 'en',      false, true, 2, 'English',      'ltr');

  FOR v_category IN SELECT * FROM jsonb_array_elements(v_template->'categories')
  LOOP
    INSERT INTO public.catalog_categories (catalog_id, name, slug, "position", is_active)
      VALUES (
        v_catalog_id,
        v_category->>'name',
        v_category->>'slug',
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
          v_catalog_id,
          v_cat_id,
          v_item->>'name',
          v_item->>'slug',
          v_item->>'description',
          coalesce((v_item->>'position')::integer, 0),
          now()
        )
        RETURNING id INTO v_item_id;

      FOR v_variation IN SELECT * FROM jsonb_array_elements(coalesce(v_item->'variations', '[]'::jsonb))
      LOOP
        INSERT INTO public.item_variations (item_id, catalog_id, name, price_cents, ordinal, is_default)
          VALUES (
            v_item_id,
            v_catalog_id,
            v_variation->>'name',
            coalesce((v_variation->>'price_cents')::integer, 0),
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

  RETURN QUERY SELECT v_org_id, v_catalog_id;
END;
$$;
