-- Per-company (org) online-payment connection state ("Connect Krafta Pay").
--
-- A merchant COMPANY connects Krafta Pay so their storefront customers can pay
-- by card (Atmos) instead of cash-only. Like the courier integration, a Krafta
-- Pay / Atmos merchant contract is one-per-company and a company may run several
-- venues/catalogs, so this is keyed at the ORG level (PK = org_id).
--
-- IMPORTANT: this table holds NO secrets. The actual encrypted Atmos credentials
-- live in Krafta Pay (payments.org_provider_account_secrets), provisioned under
-- the SAME public.organizations id via the internal connect endpoint. This row
-- is a local, non-secret mirror so the storefront can cheaply gate the card
-- option and the dashboard can show the connected account — without a network
-- hop to Krafta Pay on every render.
--
-- Applied to the dev branch via MCP; this file is the source of truth for the
-- eventual prod merge.

CREATE TABLE commerce.org_payment_settings (
    org_id        uuid        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Which online-payment provider is connected. Only 'atmos' exists today;
    -- the column lets a future provider coexist.
    provider      text        NOT NULL DEFAULT 'atmos'
                              CHECK (provider IN ('atmos')),
    -- Environment the Krafta Pay provider account was created under
    -- ('test' | 'live') — mirrors PAY_ENV so display/gating stays consistent.
    environment   text        NOT NULL DEFAULT 'test'
                              CHECK (environment IN ('test', 'live')),
    -- When false, card checkout is hidden for this org's storefronts (the
    -- Krafta Pay connection is kept). NULL/absent row = never connected.
    is_active     boolean     NOT NULL DEFAULT true,
    -- Non-secret display details echoed back to the dashboard so the merchant
    -- recognizes the connected account. NEVER holds the consumer key/secret.
    account_label text,
    store_id      text,
    -- Whether the Atmos gateway confirmed the credentials at connect time.
    -- false = saved but the geo-fenced gateway was unreachable from the deploy;
    -- the first real charge is then the true validation.
    verified      boolean     NOT NULL DEFAULT false,
    connected_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE commerce.org_payment_settings IS
  'Per-org online-payment (Krafta Pay / Atmos) connection state. Non-secret mirror only; encrypted credentials live in Krafta Pay. One row per org.';
COMMENT ON COLUMN commerce.org_payment_settings.is_active IS
  'When false, card checkout is hidden for this org''s storefronts (connection kept).';
COMMENT ON COLUMN commerce.org_payment_settings.verified IS
  'True when Atmos confirmed the credentials at connect time; false when the geo-fenced gateway was unreachable and the connection was saved optimistically.';

-- updated_at bump (shared helper from baseline).
CREATE TRIGGER trg_org_payment_settings_set_updated_at
  BEFORE UPDATE ON commerce.org_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- RLS — org owners/admins manage the connection; members may read the
-- (non-secret) connection state. Server actions run on the authed client so
-- these policies keep writes to owners/admins.
-- ===========================================================================

ALTER TABLE commerce.org_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_payment_settings_select_authed ON commerce.org_payment_settings
  FOR SELECT TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

CREATE POLICY org_payment_settings_insert ON commerce.org_payment_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY org_payment_settings_update ON commerce.org_payment_settings
  FOR UPDATE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY org_payment_settings_delete ON commerce.org_payment_settings
  FOR DELETE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.org_payment_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.org_payment_settings TO service_role;
