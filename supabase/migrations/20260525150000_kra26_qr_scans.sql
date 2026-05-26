-- KRA-26 (follow-up): qr_scans event log + scan→order attribution.
--
-- Why now: merchants ship table QRs in week 1 with zero feedback loop.
-- Without this they can't tell "is anyone scanning?" / "which table sees
-- the most foot traffic?" — a launch-week blind spot the original KRA-26
-- migration explicitly deferred (`see migration 20260520030000:7`).
--
-- Shape:
--   * Append-only event row per /q/<code> resolution.
--   * org_id auto-synced from qr_code_id so RLS reads don't have to join.
--   * ip_hash + ua_hash (not raw values) so the table doesn't carry PII
--     in cleartext. Salt is a per-deployment Vault secret; rotating it
--     breaks the "unique scanner" linkage (which is the point — we don't
--     want indefinite tracking of returning customers).
--   * referrer captured raw (Telegram-WebApp, customer Instagram link
--     attribution, etc. — useful signal, no PII concern).
--
-- Order attribution is handled in app code: /q/<code> sets a short-TTL
-- cookie carrying the shortcode; the cart's draft-order creator reads
-- it and stamps `commerce.orders.source='qr_scan'`. The cookie path
-- doesn't touch this table.

CREATE TABLE public.qr_scans (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code_id  uuid        NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
    -- Denormalized from qr_codes for cheap org-scoped reads. Filled by
    -- the BEFORE INSERT trigger below; clients pass any uuid to satisfy
    -- the NOT NULL Insert type (same convention as orders/qr_codes).
    org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    scanned_at  timestamptz NOT NULL DEFAULT now(),
    -- Salted SHA256 of the requester's IP. NULL when the route handler
    -- can't derive an IP (very rare; some self-hosted reverse proxies).
    ip_hash     text,
    ua_hash     text,
    referrer    text
);

COMMENT ON TABLE public.qr_scans IS
  'KRA-26 follow-up: one row per /q/<shortcode> resolution. Read by the merchant dashboard for scan counts; PII hashed with a per-deployment salt.';

-- Hot path: aggregate counts per qr_code, optionally filtered by time
-- bucket. The (qr_code_id, scanned_at desc) shape covers both "total
-- count" and "last 7 days" without a separate index.
CREATE INDEX qr_scans_qr_code_id_scanned_at_idx
  ON public.qr_scans (qr_code_id, scanned_at DESC);

-- Org-level scan-feed query path (future "all venue activity" view).
CREATE INDEX qr_scans_org_id_scanned_at_idx
  ON public.qr_scans (org_id, scanned_at DESC);

-- ===========================================================================
-- Sync org_id from qr_codes (single source of truth, mirrors qr_codes).
-- ===========================================================================

CREATE FUNCTION public.qr_scans_sync_org_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT q.org_id INTO v_org_id
  FROM public.qr_codes q WHERE q.id = NEW.qr_code_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'qr_scans.qr_code_id % does not exist', NEW.qr_code_id;
  END IF;
  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_qr_scans_sync_org_id
  BEFORE INSERT ON public.qr_scans
  FOR EACH ROW EXECUTE FUNCTION public.qr_scans_sync_org_id();

-- ===========================================================================
-- RLS — public INSERT (the scan happens before the customer authenticates)
-- + org-scoped SELECT.
-- ===========================================================================

ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authenticated) can log a scan, BUT only against an
-- active QR code they could have resolved through the public /q/<code>
-- path. WITH CHECK gates the insert: the qr_code must exist and be
-- active — a fuzzer can't pad the table with rows pointing at random
-- uuids.
CREATE POLICY qr_scans_insert_public ON public.qr_scans
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qr_codes q
      WHERE q.id = qr_scans.qr_code_id AND q.is_active = true
    )
  );

-- Org members read their own venue's scans.
CREATE POLICY qr_scans_select_org ON public.qr_scans
  FOR SELECT TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

GRANT INSERT ON public.qr_scans TO anon;
GRANT SELECT, INSERT ON public.qr_scans TO authenticated;
