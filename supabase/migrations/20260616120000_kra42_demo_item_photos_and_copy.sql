-- KRA-42 — make new shops' previews look good: creative item copy + photos.
--
-- Two changes that flow through the existing onboarding seed:
--
-- 1. vertical_templates: rewrite each item's RU (canonical) description from
--    terse spec text to warm, appetizing copy. New shops pick these up
--    automatically — create_wizard_menu seeds the description from the
--    template, and RU is the storefront default the reveal renders.
--
-- 2. complete_wizard gains p_item_images: after the curated menu is inserted,
--    a stock set of abstract images (public-assets/demo/abstract/*) is cycled
--    onto the items' image_path so the card-big-photo storefront isn't a wall
--    of empty photo slots. The images are interchangeable, so a positional
--    cycle is exactly the intended reuse. Only items WITHOUT an image are
--    touched, and only on first creation (the function is idempotent).

-- ---------------------------------------------------------------------------
-- 1. Creative RU descriptions (by item slug, across every vertical template)
-- ---------------------------------------------------------------------------

UPDATE public.vertical_templates vt
SET template = jsonb_set(
  vt.template,
  '{categories}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN cat ? 'items' THEN jsonb_set(
          cat,
          '{items}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN m.descr IS NOT NULL
                  THEN jsonb_set(item, '{description}', to_jsonb(m.descr))
                ELSE item
              END
              ORDER BY iord
            )
            FROM jsonb_array_elements(cat->'items') WITH ORDINALITY AS i(item, iord)
            LEFT JOIN (
              VALUES
                ('cappuccino', 'Двойной эспрессо под облаком бархатной пены — то, ради чего стоит проснуться.'),
                ('latte',      'Мягкий, тёплый, молочный — кофе, который обнимает.'),
                ('espresso',   '30 мл чистого характера. Густой, ароматный, без компромиссов.'),
                ('croissant',  'Слоёное золото: хрустит снаружи, тает внутри. Печём каждое утро.'),
                ('cheesecake', 'Нежный нью-йоркский на рассыпчатой песочной основе. Кусочек тишины.'),
                ('achichuk',   'Спелые помидоры, сладкий лук и острый перчик — свежесть, что будит аппетит.'),
                ('samsa',      'Прямо из тандыра: хрустящее тесто, сочная говядина, обжигающий пар.'),
                ('non',        'Горячая тандырная лепёшка с золотистой корочкой — без неё стол не накрыт.'),
                ('plov',       'Настоящий узбекский: рассыпчатый рис, жёлтая морковь, нежная говядина.'),
                ('lagman',     'Тянутая вручную лапша, наваристый бульон, говядина и овощи — тарелка тепла.'),
                ('tea',        'Зелёный или чёрный, в большом чайнике — повод никуда не спешить.'),
                ('t-shirt',    'Плотный хлопок 180 г/м², держит форму и любит стирку. Носишь не снимая.'),
                ('hoodie',     'Мягкий начёс внутри, плотный футер снаружи — тепло, в которое хочется завернуться.'),
                ('tote-bag',   'Прочный канвас и длинные ручки — выдержит рынок, зал и пару книг впридачу.'),
                ('mug',        'Керамика на 350 мл, удобно ложится в руку. Для кофе, чая и долгих разговоров.')
            ) AS m(slug, descr) ON m.slug = item->>'slug'
          )
        )
        ELSE cat
      END
      ORDER BY cord
    )
    FROM jsonb_array_elements(vt.template->'categories') WITH ORDINALITY AS c(cat, cord)
  )
);

-- ---------------------------------------------------------------------------
-- 2. complete_wizard + p_item_images (cycle stock photos onto items)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.complete_wizard(
  uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer, jsonb, jsonb
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
  p_branding    jsonb DEFAULT NULL,
  p_item_images text[] DEFAULT NULL
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
  v_n_images  integer;
BEGIN
  IF p_table_count IS NULL OR p_table_count < 0 OR p_table_count > 50 THEN
    RAISE EXCEPTION 'table count out of range (0-50)' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_n_locales
    FROM jsonb_array_elements(coalesce(p_locales, '[]'::jsonb));
  IF v_n_locales < 1 OR v_n_locales > 6 THEN
    RAISE EXCEPTION 'locale count out of range (1-6)' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.items WHERE catalog_id = p_catalog_id)
     OR EXISTS (SELECT 1 FROM public.catalog_categories WHERE catalog_id = p_catalog_id)
  THEN
    RETURN;
  END IF;

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

  UPDATE public.venues
     SET modes_enabled = p_modes,
         address = coalesce(address, '{}'::jsonb) || coalesce(p_address, '{}'::jsonb)
   WHERE catalog_id = p_catalog_id
   RETURNING id, org_id INTO v_venue_id, v_org_id;

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

  IF jsonb_array_length(coalesce(p_menu->'categories', '[]'::jsonb)) > 0 THEN
    PERFORM public.create_wizard_menu(p_catalog_id, p_menu);
  END IF;

  -- Cycle the stock photo set onto the freshly-inserted items so the
  -- card-big-photo storefront has imagery. Photos are interchangeable, so a
  -- deterministic positional cycle is the intended reuse; only photoless
  -- items are touched.
  v_n_images := coalesce(array_length(p_item_images, 1), 0);
  IF v_n_images > 0 THEN
    WITH ordered AS (
      SELECT id,
             (row_number() OVER (ORDER BY category_id, "position", id) - 1) AS rn
        FROM public.items
       WHERE catalog_id = p_catalog_id
         AND image_path IS NULL
    )
    UPDATE public.items i
       SET image_path = p_item_images[(o.rn % v_n_images) + 1]
      FROM ordered o
     WHERE i.id = o.id;
  END IF;

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

COMMENT ON FUNCTION public.complete_wizard(uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer, jsonb, jsonb, text[]) IS
  'KRA-42: one-shot transactional onboarding submit — catalog settings (incl. Look preset layout/branding), venue modes/contacts, locales, curated menu (via create_wizard_menu), cycled stock item photos, and dine-in table QRs in a single SECURITY INVOKER call under the caller''s RLS. Idempotent: no-ops when the catalog already has a menu.';

REVOKE EXECUTE ON FUNCTION public.complete_wizard(uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer, jsonb, jsonb, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_wizard(uuid, public.shop_vertical, jsonb, text[], jsonb, jsonb, jsonb, integer, jsonb, jsonb, text[]) TO authenticated;
