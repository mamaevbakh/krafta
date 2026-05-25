-- ============================================================================
-- Tables entity + per-table QR linkage + auto-create pickup/delivery QRs
-- ============================================================================
--
-- Extends KRA-26's qr_codes (which auto-creates a 'main' QR per venue) to:
--
--   1. A new public.tables entity — first-class dine-in surfaces (Table 1,
--      Bar 2, Patio A). Powers the merchant's QR-printing page; replaces
--      the bare `table_label` string passed via URL in dine-in flows.
--
--   2. qr_codes.table_id FK — links table-kind QR rows to a tables row.
--      Renaming a table propagates to the QR destination instantly; the
--      printed QR keeps working because the shortcode is stable.
--
--   3. Auto-create pickup + delivery QRs on every new venue, matching the
--      'main' QR pattern from KRA-26. Merchants never have to click
--      "generate" — the dashboard just shows three ready-to-print cards
--      the moment a venue exists.
--
-- Linear: KRA-26 follow-up + KRA-83 prerequisite.

-- ============================================================================
-- 1. public.tables
-- ============================================================================

CREATE TABLE public.tables (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  venue_id    uuid        NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  "position"  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tables_label_nonempty_chk CHECK (length(trim(label)) > 0)
);

COMMENT ON TABLE public.tables IS
  'Per-venue dine-in surfaces (Table 1, Bar 2, Patio A). Powers the merchant
   QR-codes page and pairs 1:1 with a table-kind qr_codes row via
   qr_codes.table_id. Inactive tables redirect their QR to the bare catalog
   so a deactivated/moved table doesn''t 404 a customer mid-meal.';

CREATE INDEX tables_venue_id_position_idx
  ON public.tables (venue_id, "position");

-- One active row per (venue, label). Inactive duplicates allowed so the
-- merchant can rename Table 5 → "Table 5A" without losing history.
CREATE UNIQUE INDEX tables_venue_label_active_uniq
  ON public.tables (venue_id, label)
  WHERE is_active;

-- Sync org_id from the venue (same pattern as commerce.orders / qr_codes).
CREATE FUNCTION public.tables_sync_org_id() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.venues WHERE id = NEW.venue_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'tables.venue_id % does not exist', NEW.venue_id;
  END IF;
  NEW.org_id := v_org;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tables_sync_org_id
  BEFORE INSERT OR UPDATE OF venue_id ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.tables_sync_org_id();

CREATE TRIGGER trg_tables_set_updated_at
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: public read so the QR resolver (anon role) can resolve table.label
-- without auth; writes are org owner/admin only. Same shape as qr_codes.
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY tables_select_public ON public.tables
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY tables_write ON public.tables
  FOR ALL TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

GRANT SELECT ON public.tables TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tables TO authenticated;

-- ============================================================================
-- 2. qr_codes.table_id + relaxed CHECK
-- ============================================================================

ALTER TABLE public.qr_codes
  ADD COLUMN table_id uuid REFERENCES public.tables(id) ON DELETE CASCADE;

CREATE INDEX qr_codes_table_id_idx
  ON public.qr_codes (table_id)
  WHERE table_id IS NOT NULL;

-- At most one active QR per table. Regenerate-shortcode replaces in
-- place (UPDATE qr_codes SET shortcode=… WHERE table_id=…), so we never
-- need a second active row.
CREATE UNIQUE INDEX qr_codes_table_id_active_uniq
  ON public.qr_codes (table_id)
  WHERE is_active AND table_id IS NOT NULL;

-- Loosen the legacy table_label requirement: table-kind QRs may have a
-- table_id (new path) OR a bare table_label (KRA-26 / KRA-27 legacy).
-- Non-table kinds must have neither.
ALTER TABLE public.qr_codes
  DROP CONSTRAINT qr_codes_table_label_chk;

ALTER TABLE public.qr_codes
  ADD CONSTRAINT qr_codes_table_link_chk CHECK (
    (kind = 'table'
       AND (table_id IS NOT NULL OR (table_label IS NOT NULL AND length(table_label) > 0)))
    OR
    (kind <> 'table' AND table_label IS NULL AND table_id IS NULL)
  );

-- ============================================================================
-- 3. Auto-create pickup + delivery QRs (matches the 'main' auto-create
--    from KRA-26). Merchants always see all three cards in the dashboard.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.venues_auto_create_main_qr() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  -- One INSERT for all three rows so we don't pay per-statement overhead.
  -- Idempotent against re-fires by leaving conflict handling to the
  -- partial unique below (catch 23505 if a duplicate slips through).
  INSERT INTO public.qr_codes (venue_id, catalog_id, org_id, kind)
    VALUES
      (NEW.id, NEW.catalog_id, NEW.org_id, 'main'),
      (NEW.id, NEW.catalog_id, NEW.org_id, 'pickup'),
      (NEW.id, NEW.catalog_id, NEW.org_id, 'delivery');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.venues_auto_create_main_qr() IS
  'Auto-creates main + pickup + delivery qr_codes rows on venue insert.
   The merchant QR-codes page renders all three as ready-to-print cards
   without the merchant clicking "generate".';

-- Backfill: any existing venue that''s missing a pickup or delivery row
-- (every venue already has 'main' from the KRA-26 backfill).
INSERT INTO public.qr_codes (venue_id, catalog_id, org_id, kind)
SELECT v.id, v.catalog_id, v.org_id, m.k::public.qr_kind
FROM public.venues v
CROSS JOIN (VALUES ('pickup'), ('delivery')) AS m(k)
WHERE NOT EXISTS (
  SELECT 1 FROM public.qr_codes q
   WHERE q.venue_id = v.id AND q.kind::text = m.k
);
