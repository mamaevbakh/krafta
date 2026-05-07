-- KRA-56 / Migration 3 — Catalog taxes + discounts.
--
-- Per ADR 0001 (`docs/adr/0001-orders-catalog-schema-v1.md` §3.1, §7 Q3):
--   * public.taxes carries both VAT-style taxes and UZ-style service fees,
--     distinguished by `kind enum (tax | service_fee)`. No third primitive.
--   * applies_to = 'all_items' | 'by_category'; the latter is materialized
--     via a join table tax_categories. UZ market typically uses all_items.
--   * public.discounts supports percentage / fixed_amount with optional PIN
--     gate. Multi-mode "variable_*" variants let the cashier enter a custom
--     value at checkout.
--
-- Conventions inherited from Migration 1:
--   * version bigint + bump_version trigger on every tax/discount row.
--   * Plain ASCII in COMMENT strings.
--   * CHECK constraints where the schema can encode the invariant.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================

CREATE TYPE public.tax_kind AS ENUM ('tax', 'service_fee');
CREATE TYPE public.tax_calculation_phase AS ENUM ('subtotal', 'total');
CREATE TYPE public.tax_inclusion_type AS ENUM ('included', 'additive');
CREATE TYPE public.tax_applies_to AS ENUM ('all_items', 'by_category');

CREATE TYPE public.discount_type AS ENUM (
  'percentage',
  'fixed_amount',
  'variable_percentage',
  'variable_amount'
);

-- ===========================================================================
-- 2. public.taxes
-- ===========================================================================

CREATE TABLE public.taxes (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id        uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    kind              public.tax_kind NOT NULL DEFAULT 'tax',
    name              text        NOT NULL,
    calculation_phase public.tax_calculation_phase NOT NULL DEFAULT 'subtotal',
    inclusion_type    public.tax_inclusion_type NOT NULL DEFAULT 'additive',
    percentage        numeric(5,4) NOT NULL,
    applies_to        public.tax_applies_to NOT NULL DEFAULT 'all_items',
    is_active         boolean     NOT NULL DEFAULT true,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    version           bigint      NOT NULL DEFAULT 1,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- 0.0000 inclusive, no upper bound (some markets >100% combined fees).
    CONSTRAINT taxes_percentage_nonneg_chk CHECK (percentage >= 0)
);

COMMENT ON COLUMN public.taxes.kind IS
  'tax = VAT-style; service_fee = restaurant service charge (10-20% common in UZ). Folded into one table per ADR 0001 to avoid a third tax-shaped primitive.';
COMMENT ON COLUMN public.taxes.percentage IS
  '0.1200 means 12.00 percent. Stored as a fraction so math at order time is straightforward.';
COMMENT ON COLUMN public.taxes.applies_to IS
  'all_items applies to every line on the order; by_category restricts to lines whose category is in tax_categories.';

CREATE INDEX taxes_catalog_id_active_idx ON public.taxes (catalog_id, is_active);

CREATE TRIGGER trg_taxes_set_updated_at
  BEFORE UPDATE ON public.taxes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_taxes_bump_version
  BEFORE UPDATE ON public.taxes
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE public.taxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY taxes_select_anon ON public.taxes
  FOR SELECT TO anon
  USING (is_active = true AND public.catalog_is_public(catalog_id));

CREATE POLICY taxes_select_authed ON public.taxes
  FOR SELECT TO authenticated
  USING (
    (is_active = true AND public.catalog_is_public(catalog_id))
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY taxes_write ON public.taxes
  FOR ALL TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 3. public.tax_categories (only when taxes.applies_to = 'by_category')
-- ===========================================================================

CREATE TABLE public.tax_categories (
    tax_id      uuid NOT NULL REFERENCES public.taxes(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES public.catalog_categories(id) ON DELETE CASCADE,
    catalog_id  uuid NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tax_id, category_id)
);

COMMENT ON TABLE public.tax_categories IS
  'Join table between taxes and catalog_categories. Only valid when parent tax has applies_to = by_category. Trigger enforces this and that tax + category share a catalog.';

CREATE INDEX tax_categories_category_id_idx ON public.tax_categories (category_id);
CREATE INDEX tax_categories_catalog_id_idx ON public.tax_categories (catalog_id);

-- Sync + validate: tax_categories rows are only allowed when the parent tax
-- has applies_to = by_category, and the tax + category must belong to the
-- same catalog.
CREATE FUNCTION public.tax_categories_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_tax_applies_to public.tax_applies_to;
  v_tax_catalog_id uuid;
  v_cat_catalog_id uuid;
BEGIN
  SELECT applies_to, catalog_id INTO v_tax_applies_to, v_tax_catalog_id
  FROM public.taxes WHERE id = NEW.tax_id;
  SELECT catalog_id INTO v_cat_catalog_id
  FROM public.catalog_categories WHERE id = NEW.category_id;

  IF v_tax_applies_to IS NULL THEN
    RAISE EXCEPTION 'tax_categories.tax_id % does not exist', NEW.tax_id;
  END IF;
  IF v_cat_catalog_id IS NULL THEN
    RAISE EXCEPTION 'tax_categories.category_id % does not exist', NEW.category_id;
  END IF;
  IF v_tax_applies_to <> 'by_category' THEN
    RAISE EXCEPTION 'tax % has applies_to=%, cannot attach category overrides',
      NEW.tax_id, v_tax_applies_to;
  END IF;
  IF v_tax_catalog_id <> v_cat_catalog_id THEN
    RAISE EXCEPTION 'tax % is in catalog % but category % is in catalog %',
      NEW.tax_id, v_tax_catalog_id, NEW.category_id, v_cat_catalog_id;
  END IF;
  NEW.catalog_id := v_tax_catalog_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tax_categories_validate
  BEFORE INSERT OR UPDATE OF tax_id, category_id ON public.tax_categories
  FOR EACH ROW EXECUTE FUNCTION public.tax_categories_validate();

ALTER TABLE public.tax_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tax_categories_select_anon ON public.tax_categories
  FOR SELECT TO anon
  USING (public.catalog_is_public(catalog_id));

CREATE POLICY tax_categories_select_authed ON public.tax_categories
  FOR SELECT TO authenticated
  USING (
    public.catalog_is_public(catalog_id)
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY tax_categories_write ON public.tax_categories
  FOR ALL TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 4. public.discounts
-- ===========================================================================

CREATE TABLE public.discounts (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id    uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    name          text        NOT NULL,
    discount_type public.discount_type NOT NULL,
    percentage    numeric(5,4),
    amount_cents  integer,
    pin_required  boolean     NOT NULL DEFAULT false,
    is_active     boolean     NOT NULL DEFAULT true,
    metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    version       bigint      NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    -- Per-discount-type field requirements:
    --   percentage / variable_percentage -> percentage filled, amount_cents NULL
    --   fixed_amount / variable_amount   -> amount_cents filled, percentage NULL
    -- "variable" variants let the cashier enter the value at order time;
    -- the row defines the type and the optional default.
    CONSTRAINT discounts_percentage_nonneg_chk CHECK (percentage IS NULL OR percentage >= 0),
    CONSTRAINT discounts_amount_cents_nonneg_chk CHECK (amount_cents IS NULL OR amount_cents >= 0),
    CONSTRAINT discounts_shape_chk CHECK (
      (discount_type IN ('percentage','variable_percentage') AND amount_cents IS NULL)
      OR
      (discount_type IN ('fixed_amount','variable_amount') AND percentage IS NULL)
    )
);

COMMENT ON COLUMN public.discounts.discount_type IS
  'percentage / fixed_amount = preset values; variable_* = cashier enters value at order time. percentage and amount_cents are mutually exclusive per the shape CHECK.';
COMMENT ON COLUMN public.discounts.pin_required IS
  'When true, applying this discount at checkout requires a manager PIN.';

CREATE INDEX discounts_catalog_id_active_idx ON public.discounts (catalog_id, is_active);

CREATE TRIGGER trg_discounts_set_updated_at
  BEFORE UPDATE ON public.discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_discounts_bump_version
  BEFORE UPDATE ON public.discounts
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY discounts_select_anon ON public.discounts
  FOR SELECT TO anon
  USING (is_active = true AND public.catalog_is_public(catalog_id));

CREATE POLICY discounts_select_authed ON public.discounts
  FOR SELECT TO authenticated
  USING (
    (is_active = true AND public.catalog_is_public(catalog_id))
    OR public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY discounts_write ON public.discounts
  FOR ALL TO authenticated
  USING (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(public.catalog_org_id(catalog_id), ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.taxes,
  public.tax_categories,
  public.discounts
TO authenticated;

GRANT SELECT ON
  public.taxes,
  public.tax_categories,
  public.discounts
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.taxes,
  public.tax_categories,
  public.discounts
TO service_role;
