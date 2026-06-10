-- KRA-42 / ADR 0005 §5–§6 — vertical starter templates + create_draft_shop v2.
--
-- Onboarding seeds a believable, locally-flavored starter catalog at draft-shop
-- creation so the merchant lands in a populated Library Canvas, never an empty
-- one. Design constraints from the ADR 0005 eng review (2026-06-10):
--
--   D4  — search sync is trigger-owned: the per-row INSERTs below fire
--         trg_catalog_search_sync_* inside THIS transaction; callers must not
--         add app-level sync calls afterward (KRA-88 double-sync lesson).
--   D4  — catalog_locales rows (ru default, uz/en enabled) are part of the
--         seed; translations for all three locales ship in the template so no
--         MT machinery fires per seed.
--   D5  — idempotency lives in the RPC: an advisory lock + owned-org check
--         makes double-tap / wizard-resubmit / back-button replay return the
--         existing shop instead of stamping a duplicate.
--   D7  — templates are data in vertical_templates, keyed by an enum the
--         wizard reads via typegen. SECURITY DEFINER never accepts
--         client-shaped seed payloads.
--   D18 — three verticals in v1 (services returns with a booking flow).
--   D19 — seed rows carry items.seeded_at so "untouched demo item" is
--         queryable by the publish-time nudge.
--   D21 — catalogs.vertical persists the merchant's pick.
--
-- Seeding data flow (one transaction, one RPC call):
--
--   create_draft_shop(p_slug, p_vertical, p_name)
--     ├─ advisory xact lock on auth.uid()           (serializes concurrent taps)
--     ├─ owned-org check ──────────► existing? return it (no reseed)
--     ├─ INSERT org / owner membership / catalog(vertical, settings_currency)
--     │         / venue(paused, modes from template)
--     ├─ INSERT catalog_locales  ru(default) · uz · en
--     └─ for each template category:
--           INSERT catalog_categories ──► trg_catalog_search_sync_category
--           INSERT catalog_category_translations (uz, en)
--           for each item:
--             INSERT items(seeded_at=now()) ──► trg_catalog_search_sync_item
--             INSERT item_variations (default + sizes)
--             INSERT item_translations (uz, en) ──► trg_..._item_translation

-- ---------------------------------------------------------------------------
-- 1. Vertical enum + template table + persistence columns
-- ---------------------------------------------------------------------------

CREATE TYPE public.shop_vertical AS ENUM ('cafe', 'restaurant', 'retail');

COMMENT ON TYPE public.shop_vertical IS
  'ADR 0005 §5: onboarding verticals. v1 ships three; services is deferred until a booking flow exists (eng review D18). Adding a vertical = one enum value + one vertical_templates row + wizard label.';

CREATE TABLE public.vertical_templates (
  key        public.shop_vertical PRIMARY KEY,
  template   jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vertical_templates IS
  'ADR 0005 §5 (D7): single source of truth for vertical starter catalogs. Read only by SECURITY DEFINER seeding; no client access. Template shape: {modes: text[], currency_settings: jsonb, categories: [{slug,name,position,translations:{uz,en},items:[{slug,name,description,position,translations,variations:[{name,price_cents,ordinal,is_default}]}]}]}.';

-- Definer-only: RLS on, no policies. The seed RPC reads it with definer rights.
ALTER TABLE public.vertical_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.catalogs
  ADD COLUMN vertical public.shop_vertical;

COMMENT ON COLUMN public.catalogs.vertical IS
  'Vertical picked at onboarding (ADR 0005 D21). Snapshot of the wizard answer, not a live business-type field. NULL for catalogs created before onboarding or via legacy paths.';

ALTER TABLE public.items
  ADD COLUMN seeded_at timestamptz;

COMMENT ON COLUMN public.items.seeded_at IS
  'Set when the row came from a vertical starter template (ADR 0005 D19). "Untouched demo item" = seeded_at IS NOT NULL AND updated_at = created_at; powers the publish-time nudge and seed-retention analytics.';

-- ---------------------------------------------------------------------------
-- 2. Templates (RU canonical, uz/en translations; price_cents = UZS tiyin)
-- ---------------------------------------------------------------------------

INSERT INTO public.vertical_templates (key, template) VALUES
('cafe', $tpl$
{
  "modes": ["pickup", "dine_in"],
  "currency_settings": {"defaultCurrency": "UZS", "label": "сум", "labelPosition": "suffix", "thousandSeparator": " ", "decimalSeparator": ",", "showDecimals": false},
  "categories": [
    {
      "slug": "coffee", "name": "Кофе", "position": 0,
      "translations": {"uz": {"name": "Qahva"}, "en": {"name": "Coffee"}},
      "items": [
        {
          "slug": "cappuccino", "name": "Капучино", "position": 0,
          "description": "Двойной эспрессо с шелковистой молочной пеной",
          "translations": {
            "uz": {"name": "Kapuchino", "description": "Ikki porsiya espresso va mayin sut koʻpigi"},
            "en": {"name": "Cappuccino", "description": "Double espresso with silky milk foam"}
          },
          "variations": [
            {"name": "250 мл", "price_cents": 2800000, "ordinal": 0, "is_default": true},
            {"name": "350 мл", "price_cents": 3200000, "ordinal": 1, "is_default": false}
          ]
        },
        {
          "slug": "latte", "name": "Латте", "position": 1,
          "description": "Мягкий кофе с молоком, нежная текстура",
          "translations": {
            "uz": {"name": "Latte", "description": "Sut qoʻshilgan yumshoq kofe"},
            "en": {"name": "Latte", "description": "Smooth espresso with steamed milk"}
          },
          "variations": [
            {"name": "250 мл", "price_cents": 3000000, "ordinal": 0, "is_default": true},
            {"name": "350 мл", "price_cents": 3400000, "ordinal": 1, "is_default": false}
          ]
        },
        {
          "slug": "espresso", "name": "Эспрессо", "position": 2,
          "description": "Классический, насыщенный, 30 мл",
          "translations": {
            "uz": {"name": "Espresso", "description": "Klassik, quyuq, 30 ml"},
            "en": {"name": "Espresso", "description": "Classic, intense, 30 ml shot"}
          },
          "variations": [
            {"name": "Стандарт", "price_cents": 2000000, "ordinal": 0, "is_default": true}
          ]
        }
      ]
    },
    {
      "slug": "pastries", "name": "Выпечка", "position": 1,
      "translations": {"uz": {"name": "Pishiriqlar"}, "en": {"name": "Pastries"}},
      "items": [
        {
          "slug": "croissant", "name": "Круассан", "position": 0,
          "description": "Сливочный, выпекается каждое утро",
          "translations": {
            "uz": {"name": "Kruassan", "description": "Sariyogʻli, har kuni ertalab pishiriladi"},
            "en": {"name": "Croissant", "description": "All-butter, baked fresh every morning"}
          },
          "variations": [
            {"name": "Стандарт", "price_cents": 2500000, "ordinal": 0, "is_default": true}
          ]
        },
        {
          "slug": "cheesecake", "name": "Чизкейк", "position": 1,
          "description": "Нью-Йорк, на песочной основе",
          "translations": {
            "uz": {"name": "Chizkeyk", "description": "Nyu-York uslubida, qumli asosda"},
            "en": {"name": "Cheesecake", "description": "New York style on a shortbread base"}
          },
          "variations": [
            {"name": "Стандарт", "price_cents": 3500000, "ordinal": 0, "is_default": true}
          ]
        }
      ]
    }
  ]
}
$tpl$::jsonb),
('restaurant', $tpl$
{
  "modes": ["dine_in", "pickup", "delivery"],
  "currency_settings": {"defaultCurrency": "UZS", "label": "сум", "labelPosition": "suffix", "thousandSeparator": " ", "decimalSeparator": ",", "showDecimals": false},
  "categories": [
    {
      "slug": "starters", "name": "Салаты и закуски", "position": 0,
      "translations": {"uz": {"name": "Salatlar va gazaklar"}, "en": {"name": "Salads & starters"}},
      "items": [
        {
          "slug": "achichuk", "name": "Салат Ачичук", "position": 0,
          "description": "Свежие помидоры, лук и острый перец",
          "translations": {
            "uz": {"name": "Achichuk salati", "description": "Yangi pomidor, piyoz va achchiq qalampir"},
            "en": {"name": "Achichuk salad", "description": "Fresh tomatoes, onion and chili"}
          },
          "variations": [
            {"name": "Порция", "price_cents": 1800000, "ordinal": 0, "is_default": true}
          ]
        },
        {
          "slug": "samsa", "name": "Самса", "position": 1,
          "description": "Из тандыра, с говядиной",
          "translations": {
            "uz": {"name": "Somsa", "description": "Tandirda pishirilgan, mol goʻshtli"},
            "en": {"name": "Samsa", "description": "Tandoor-baked, beef filling"}
          },
          "variations": [
            {"name": "Штука", "price_cents": 1200000, "ordinal": 0, "is_default": true}
          ]
        },
        {
          "slug": "non", "name": "Нон", "position": 2,
          "description": "Тандырная лепёшка, горячая",
          "translations": {
            "uz": {"name": "Non", "description": "Tandir non, issiq"},
            "en": {"name": "Non flatbread", "description": "Hot tandoor flatbread"}
          },
          "variations": [
            {"name": "Штука", "price_cents": 500000, "ordinal": 0, "is_default": true}
          ]
        }
      ]
    },
    {
      "slug": "mains", "name": "Основные блюда", "position": 1,
      "translations": {"uz": {"name": "Asosiy taomlar"}, "en": {"name": "Mains"}},
      "items": [
        {
          "slug": "plov", "name": "Плов", "position": 0,
          "description": "Узбекский плов с говядиной и жёлтой морковью",
          "translations": {
            "uz": {"name": "Palov", "description": "Mol goʻshti va sariq sabzili oʻzbek palovi"},
            "en": {"name": "Plov", "description": "Uzbek pilaf with beef and yellow carrots"}
          },
          "variations": [
            {"name": "Порция", "price_cents": 4500000, "ordinal": 0, "is_default": true},
            {"name": "Двойная порция", "price_cents": 8000000, "ordinal": 1, "is_default": false}
          ]
        },
        {
          "slug": "lagman", "name": "Лагман", "position": 1,
          "description": "Домашняя тянутая лапша, говядина, овощи",
          "translations": {
            "uz": {"name": "Lagʻmon", "description": "Qoʻlda tortilgan ugra, mol goʻshti va sabzavotlar"},
            "en": {"name": "Lagman", "description": "Hand-pulled noodles with beef and vegetables"}
          },
          "variations": [
            {"name": "Порция", "price_cents": 3800000, "ordinal": 0, "is_default": true}
          ]
        }
      ]
    },
    {
      "slug": "drinks", "name": "Напитки", "position": 2,
      "translations": {"uz": {"name": "Ichimliklar"}, "en": {"name": "Drinks"}},
      "items": [
        {
          "slug": "tea", "name": "Чай", "position": 0,
          "description": "Зелёный или чёрный, в чайнике",
          "translations": {
            "uz": {"name": "Choy", "description": "Koʻk yoki qora, choynakda"},
            "en": {"name": "Tea", "description": "Green or black, served by the pot"}
          },
          "variations": [
            {"name": "Зелёный", "price_cents": 800000, "ordinal": 0, "is_default": true},
            {"name": "Чёрный", "price_cents": 800000, "ordinal": 1, "is_default": false}
          ]
        }
      ]
    }
  ]
}
$tpl$::jsonb),
('retail', $tpl$
{
  "modes": ["pickup"],
  "currency_settings": {"defaultCurrency": "UZS", "label": "сум", "labelPosition": "suffix", "thousandSeparator": " ", "decimalSeparator": ",", "showDecimals": false},
  "categories": [
    {
      "slug": "apparel", "name": "Одежда", "position": 0,
      "translations": {"uz": {"name": "Kiyimlar"}, "en": {"name": "Apparel"}},
      "items": [
        {
          "slug": "t-shirt", "name": "Футболка", "position": 0,
          "description": "100% хлопок, плотность 180 г/м²",
          "translations": {
            "uz": {"name": "Futbolka", "description": "100% paxta, 180 g/m²"},
            "en": {"name": "T-shirt", "description": "100% cotton, 180 gsm"}
          },
          "variations": [
            {"name": "S", "price_cents": 12000000, "ordinal": 0, "is_default": false},
            {"name": "M", "price_cents": 12000000, "ordinal": 1, "is_default": true},
            {"name": "L", "price_cents": 12000000, "ordinal": 2, "is_default": false}
          ]
        },
        {
          "slug": "hoodie", "name": "Худи", "position": 1,
          "description": "Плотный футер, начёс внутри",
          "translations": {
            "uz": {"name": "Xudi", "description": "Qalin paxta, ichi yumshoq"},
            "en": {"name": "Hoodie", "description": "Heavyweight fleece, brushed inside"}
          },
          "variations": [
            {"name": "S", "price_cents": 25000000, "ordinal": 0, "is_default": false},
            {"name": "M", "price_cents": 25000000, "ordinal": 1, "is_default": true},
            {"name": "L", "price_cents": 25000000, "ordinal": 2, "is_default": false}
          ]
        }
      ]
    },
    {
      "slug": "accessories", "name": "Аксессуары", "position": 1,
      "translations": {"uz": {"name": "Aksessuarlar"}, "en": {"name": "Accessories"}},
      "items": [
        {
          "slug": "tote-bag", "name": "Сумка-шоппер", "position": 0,
          "description": "Плотный канвас, длинные ручки",
          "translations": {
            "uz": {"name": "Shopper sumka", "description": "Qalin kanvas, uzun dastali"},
            "en": {"name": "Tote bag", "description": "Heavy canvas, long handles"}
          },
          "variations": [
            {"name": "Стандарт", "price_cents": 9000000, "ordinal": 0, "is_default": true}
          ]
        },
        {
          "slug": "mug", "name": "Кружка", "position": 1,
          "description": "Керамика, 350 мл",
          "translations": {
            "uz": {"name": "Krujka", "description": "Keramika, 350 ml"},
            "en": {"name": "Mug", "description": "Ceramic, 350 ml"}
          },
          "variations": [
            {"name": "Стандарт", "price_cents": 6000000, "ordinal": 0, "is_default": true}
          ]
        }
      ]
    }
  ]
}
$tpl$::jsonb);

-- ---------------------------------------------------------------------------
-- 3. create_draft_shop v2 — idempotent, seeding, backwards compatible
-- ---------------------------------------------------------------------------

-- Old single-arg signature must go: keeping it alongside the new one would
-- make PostgREST rpc('create_draft_shop', {p_slug}) ambiguous.
DROP FUNCTION IF EXISTS public.create_draft_shop(text);

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
  -- Definer functions validate everything (eng review D4). p_vertical is
  -- enum-checked at the cast boundary; p_name gets explicit bounds.
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  IF v_name IS NOT NULL AND length(v_name) > 80 THEN
    RAISE EXCEPTION 'name must be at most 80 chars' USING ERRCODE = '22023';
  END IF;

  -- D5: serialize concurrent calls per user, then check for an existing shop.
  -- Double-tap, wizard resubmit, and back-button replay all land here: the
  -- second transaction waits on the lock, then finds the first one's org.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_draft_shop:' || v_user_id::text, 0));

  SELECT om.org_id, c.id
    INTO v_org_id, v_catalog_id
    FROM public.organization_members om
    JOIN public.catalogs c ON c.org_id = om.org_id
   WHERE om.user_id = v_user_id AND om.role = 'owner'
   ORDER BY c.created_at
   LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    RETURN QUERY SELECT v_org_id, v_catalog_id;  -- existing shop; never reseed
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

  -- New shops start paused; both publish gates (catalog draft + venue paused)
  -- flip together in publish_shop (ADR 0005 §1).
  INSERT INTO public.venues (catalog_id, org_id, slug, name, status, modes_enabled)
    VALUES (
      v_catalog_id, v_org_id, p_slug, coalesce(v_name, 'My venue'), 'paused',
      coalesce(v_modes, ARRAY['pickup','dine_in','delivery'])
    );

  IF p_vertical IS NULL THEN
    RETURN QUERY SELECT v_org_id, v_catalog_id;  -- legacy bare bootstrap
    RETURN;
  END IF;

  -- D4: smart-default locales. The storefront locale-resolution chain and the
  -- /translations workbench both read this table; items without it leave the
  -- language surfaces unconfigured.
  INSERT INTO public.catalog_locales (catalog_id, locale, is_default, is_enabled, sort_order, display_name, text_direction)
  VALUES
    (v_catalog_id, 'ru', true,  true, 0, 'Русский',    'ltr'),
    (v_catalog_id, 'uz', false, true, 1, 'Oʻzbekcha',  'ltr'),
    (v_catalog_id, 'en', false, true, 2, 'English',    'ltr');

  -- Seed categories → items → variations → translations. Search documents are
  -- produced by the existing AFTER triggers per row, inside this transaction —
  -- do NOT add app-level sync on top (KRA-88).
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

COMMENT ON FUNCTION public.create_draft_shop(text, public.shop_vertical, text) IS
  'KRA-42 / ADR 0005 §6: atomic shop bootstrap + vertical starter seed for an authenticated (incl. anon) caller. Idempotent per user (advisory lock + owned-org check returns the existing shop, never reseeds). p_vertical NULL = legacy bare bootstrap. Slug is the random creation slug; the merchant-facing slug is chosen at Publish (publish_shop).';

REVOKE EXECUTE ON FUNCTION public.create_draft_shop(text, public.shop_vertical, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_draft_shop(text, public.shop_vertical, text) TO authenticated;
