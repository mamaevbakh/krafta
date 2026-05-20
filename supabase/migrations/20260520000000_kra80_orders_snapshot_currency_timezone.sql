-- KRA-80 / Snapshot currency + timezone on commerce.orders.
--
-- Carries forward ADR 0001 §3 snapshot principle (catalog edits must not
-- retroactively change historical orders) to the venue side: a merchant
-- editing venues.currency or venues.timezone after orders have been placed
-- must not change how those orders render in dashboards or receipts.
--
-- Three-step migration:
--   1. Add nullable columns.
--   2. Backfill existing rows from public.venues (always populated; the
--      venue FK is ON DELETE RESTRICT so the join is total).
--   3. Set NOT NULL.
--
-- Then extend orders_sync_from_venue() so future INSERTs snapshot the
-- venue values. UPDATEs are intentionally NOT covered: once placed, the
-- values are frozen. The trigger still re-syncs org_id + catalog_id when
-- venue_id changes, matching the original behavior.

-- ===========================================================================
-- 1. Add columns (nullable for backfill)
-- ===========================================================================

ALTER TABLE commerce.orders
  ADD COLUMN currency text,
  ADD COLUMN timezone text;

COMMENT ON COLUMN commerce.orders.currency IS
  'ISO 4217 currency snapshotted from venues.currency at place-time. Frozen for the lifetime of the order so historical orders survive merchant currency changes.';
COMMENT ON COLUMN commerce.orders.timezone IS
  'IANA timezone snapshotted from venues.timezone at place-time. Used by receipts and merchant order dashboards to render created_at in the customer-facing local time, not the merchant''s current zone.';

-- ===========================================================================
-- 2. Backfill from venues
-- ===========================================================================

UPDATE commerce.orders o
  SET currency = v.currency,
      timezone = v.timezone
  FROM public.venues v
  WHERE v.id = o.venue_id
    AND (o.currency IS NULL OR o.timezone IS NULL);

-- ===========================================================================
-- 3. Set NOT NULL + tightening CHECK
-- ===========================================================================

ALTER TABLE commerce.orders
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN timezone SET NOT NULL;

-- ISO 4217 sanity check, matching the CHECK on commerce.order_payments.
ALTER TABLE commerce.orders
  ADD CONSTRAINT orders_currency_iso4217_chk CHECK (currency ~ '^[A-Z]{3}$');

-- ===========================================================================
-- 4. Trigger: snapshot currency/timezone on INSERT only
-- ===========================================================================

CREATE OR REPLACE FUNCTION commerce.orders_sync_from_venue() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id     uuid;
  v_catalog_id uuid;
  v_currency   text;
  v_timezone   text;
BEGIN
  SELECT v.org_id, v.catalog_id, v.currency, v.timezone
    INTO v_org_id, v_catalog_id, v_currency, v_timezone
  FROM public.venues v WHERE v.id = NEW.venue_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'orders.venue_id % does not exist', NEW.venue_id;
  END IF;
  NEW.org_id := v_org_id;
  NEW.catalog_id := v_catalog_id;
  -- Currency + timezone are snapshotted on INSERT only. UPDATEs (e.g. a
  -- venue_id reassignment, rare) must NOT overwrite the frozen values.
  IF TG_OP = 'INSERT' THEN
    NEW.currency := v_currency;
    NEW.timezone := v_timezone;
  END IF;
  RETURN NEW;
END;
$$;
