-- KRA-55 / Migration 2 — Venues (1:1 with catalog).
--
-- Per ADR 0001 (`docs/adr/0001-orders-catalog-schema-v1.md` §3.1, §7 Q1):
--   * 1 catalog ≡ 1 venue. Opening a new physical location = clone an
--     existing catalog. Each catalog carries exactly one venue row,
--     enforced by UNIQUE on venues.catalog_id.
--   * Per-catalog operational settings live on the venue row:
--     modes_enabled, business_hours, currency, timezone, address,
--     language_code, status.
--   * No row-level cross-venue overrides on items. Different prices
--     in different locations = separate catalogs.
--
-- Lessons applied from Migration 1 audit:
--   * COMMENTs use plain ASCII (no apostrophes — caused #8 hotfix).
--   * Composite indexes on hot read paths.
--   * Denormalized org_id sync trigger to match catalog.org_id.

-- ===========================================================================
-- 1. Enums
-- ===========================================================================

CREATE TYPE public.venue_status AS ENUM ('active', 'paused', 'archived');

-- Order modes (dine_in, pickup, delivery) are stored as a text[] on venues
-- and validated by the CHECK constraints on the table. Adding a new mode is
-- a separate migration so we have a chance to update fulfillment routing.

-- ===========================================================================
-- 2. public.venues
-- ===========================================================================

CREATE TABLE public.venues (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- 1:1 with catalog. UNIQUE enforces "exactly one venue per catalog".
    catalog_id     uuid        NOT NULL UNIQUE REFERENCES public.catalogs(id) ON DELETE CASCADE,
    slug           text        NOT NULL,
    name           text        NOT NULL,
    address        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    timezone       text        NOT NULL DEFAULT 'Asia/Tashkent',
    currency       text        NOT NULL DEFAULT 'UZS',
    business_hours jsonb       NOT NULL DEFAULT '{}'::jsonb,
    language_code  text        NOT NULL DEFAULT 'en',
    -- Allowed modes: dine_in, pickup, delivery. CHECK enforces the allowlist
    -- and at-least-one (cant be unreachable).
    modes_enabled  text[]      NOT NULL DEFAULT ARRAY['pickup','dine_in','delivery']::text[],
    status         public.venue_status NOT NULL DEFAULT 'active',
    metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    version        bigint      NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    -- Slug uniqueness per org (so /uzbek-bakery/khiva-branch routes are unique).
    UNIQUE (org_id, slug),
    -- ISO-4217 alpha-3 (3 uppercase letters).
    CONSTRAINT venues_currency_iso4217_chk CHECK (currency ~ '^[A-Z]{3}$'),
    -- Modes allowlist + at-least-one.
    CONSTRAINT venues_modes_enabled_nonempty_chk CHECK (array_length(modes_enabled, 1) >= 1),
    CONSTRAINT venues_modes_enabled_allowlist_chk CHECK (
      modes_enabled <@ ARRAY['dine_in','pickup','delivery']::text[]
    )
);

COMMENT ON TABLE public.venues IS
  '1:1 with catalogs. Opening a new physical location is done by cloning a catalog (ADR 0001 Q1). Operational settings live here; identity/billing on organizations.';
COMMENT ON COLUMN public.venues.business_hours IS
  'Free-form jsonb; expected shape is {monday: [{open: "08:00", close: "22:00"}], ...}. Multiple windows per day supported.';
COMMENT ON COLUMN public.venues.modes_enabled IS
  'Allowed values: dine_in, pickup, delivery. At least one required.';

-- Hot read paths.
CREATE INDEX venues_org_id_status_idx ON public.venues (org_id, status);
CREATE INDEX venues_catalog_id_idx ON public.venues (catalog_id);

-- Standard updated_at + version triggers (per Migration 1 conventions).
CREATE TRIGGER trg_venues_set_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_venues_bump_version
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.bump_version();

-- Sync trigger: venues.org_id MUST equal catalog.org_id. Prevents the app
-- from accidentally attaching a venue to a foreign-org catalog.
CREATE FUNCTION public.venues_sync_org_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.catalogs WHERE id = NEW.catalog_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'venues.catalog_id % does not exist', NEW.catalog_id;
  END IF;
  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_venues_sync_org_id
  BEFORE INSERT OR UPDATE OF catalog_id ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_sync_org_id();

-- ===========================================================================
-- 3. RLS
-- ===========================================================================

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Public (anon) reads only venues whose catalog is published. Customers will
-- hit this via QR and the customer-facing menu app.
CREATE POLICY venues_select_anon ON public.venues
  FOR SELECT TO anon
  USING (status = 'active' AND public.catalog_is_public(catalog_id));

CREATE POLICY venues_select_authed ON public.venues
  FOR SELECT TO authenticated
  USING (
    (status = 'active' AND public.catalog_is_public(catalog_id))
    OR public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text])
  );

CREATE POLICY venues_insert ON public.venues
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY venues_update ON public.venues
  FOR UPDATE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY venues_delete ON public.venues
  FOR DELETE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- 4. Backfill: one venue per existing catalog
--
-- Defaults: org_id from catalog (also enforced by the sync trigger), slug
-- from catalog.slug, currency from settings_currency.defaultCurrency (falls
-- back to UZS for the UZ market). All three modes enabled by default.
-- ===========================================================================

INSERT INTO public.venues (
  org_id, catalog_id, slug, name, currency, language_code, modes_enabled
)
SELECT
  c.org_id,
  c.id,
  c.slug,
  c.name,
  COALESCE(NULLIF(upper(c.settings_currency->>'defaultCurrency'), ''), 'UZS'),
  COALESCE(NULLIF(c.settings_i18n->>'defaultLocale', ''), 'en'),
  ARRAY['pickup','dine_in','delivery']::text[]
FROM public.catalogs c;

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT SELECT ON public.venues TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO service_role;
