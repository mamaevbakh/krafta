-- KRA-26 / KRA-27 — QR system foundation.
--
-- Data model only this migration. Route handler at apps/krafta/app/q/[code]
-- resolves the shortcode to the venue's catalog URL with the mode prefilled.
--
-- Out of scope (follow-ups):
--   * qr_scans event log + scan → order attribution (KRA-26 §Analytics).
--   * QR PNG/SVG rendering + bulk generator (KRA-26 §Generation tooling).
--   * Merchant dashboard surface for managing QRs.
--   * Vanity codes, rotating codes (KRA-26 open questions, deferred to v2).
--
-- KRA-27 taxonomy (encoded as the qr_kind enum):
--   main      — mode-agnostic. Customer picks dine-in / pickup / delivery
--               on the landing page. Auto-created on every new venue.
--   table     — mode='dine_in', carries table_label. Stuck on each table.
--   pickup    — mode='pickup'. Pickup counter.
--   delivery  — mode='delivery'. Flyers / leaflets.

CREATE TYPE public.qr_kind AS ENUM ('main', 'table', 'pickup', 'delivery');

CREATE TABLE public.qr_codes (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id     uuid        NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    catalog_id   uuid        NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
    org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- 8-char URL-safe shortcode. Random-byte default keeps adversarial
    -- guessing impractical; UNIQUE makes collisions explicit.
    shortcode    text        NOT NULL DEFAULT encode(gen_random_bytes(4), 'hex'),
    kind         public.qr_kind NOT NULL,
    table_label  text,
    is_active    boolean     NOT NULL DEFAULT true,
    metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shortcode),
    -- table QRs require a label; other kinds must not have one.
    CONSTRAINT qr_codes_table_label_chk CHECK (
      (kind = 'table' AND table_label IS NOT NULL AND length(table_label) > 0)
      OR
      (kind <> 'table' AND table_label IS NULL)
    )
);

COMMENT ON TABLE public.qr_codes IS
  'KRA-26: physical QR -> short URL -> resolver at apps/krafta/app/q/[code]. Destination derives from kind + venue.';
COMMENT ON COLUMN public.qr_codes.shortcode IS
  'URL-safe identifier embedded in the printed QR. Stable across reprints unless the merchant rotates explicitly.';

CREATE INDEX qr_codes_venue_id_idx ON public.qr_codes (venue_id);
CREATE INDEX qr_codes_org_id_idx ON public.qr_codes (org_id);
CREATE INDEX qr_codes_kind_idx ON public.qr_codes (venue_id, kind, is_active);

-- ===========================================================================
-- Sync org + catalog from the venue (single source of truth, mirrors the
-- pattern on commerce.orders).
-- ===========================================================================

CREATE FUNCTION public.qr_codes_sync_from_venue() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
  v_catalog_id uuid;
BEGIN
  SELECT v.org_id, v.catalog_id INTO v_org_id, v_catalog_id
  FROM public.venues v WHERE v.id = NEW.venue_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'qr_codes.venue_id % does not exist', NEW.venue_id;
  END IF;
  NEW.org_id := v_org_id;
  NEW.catalog_id := v_catalog_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_qr_codes_sync_from_venue
  BEFORE INSERT OR UPDATE OF venue_id ON public.qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.qr_codes_sync_from_venue();

CREATE TRIGGER trg_qr_codes_set_updated_at
  BEFORE UPDATE ON public.qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- Auto-create the main QR on every venue. Merchants never have to think
-- about it — they just see "Your main QR" in the dashboard and can print
-- it. Additional QRs (tables / pickup / delivery) are explicit adds.
-- ===========================================================================

CREATE FUNCTION public.venues_auto_create_main_qr() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.qr_codes (venue_id, catalog_id, org_id, kind)
    VALUES (NEW.id, NEW.catalog_id, NEW.org_id, 'main');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_venues_auto_create_main_qr
  AFTER INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_auto_create_main_qr();

-- Backfill main QRs for existing venues (the trigger above only catches
-- NEW inserts).
INSERT INTO public.qr_codes (venue_id, catalog_id, org_id, kind)
SELECT v.id, v.catalog_id, v.org_id, 'main'::public.qr_kind
FROM public.venues v
WHERE NOT EXISTS (
  SELECT 1 FROM public.qr_codes q WHERE q.venue_id = v.id AND q.kind = 'main'
);

-- ===========================================================================
-- RLS — public scan resolution + org-scoped writes
-- ===========================================================================

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- Anonymous + authenticated visitors can resolve any active QR; that's
-- how scans work without first asking the visitor to log in.
CREATE POLICY qr_codes_select_active ON public.qr_codes
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Org members manage their own QRs.
CREATE POLICY qr_codes_select_org ON public.qr_codes
  FOR SELECT TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

CREATE POLICY qr_codes_write ON public.qr_codes
  FOR ALL TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

GRANT SELECT ON public.qr_codes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_codes TO authenticated;
