-- Per-company (org) courier-provider credentials for delivery dispatch.
--
-- Each merchant COMPANY connects its OWN Yandex Delivery (Yandex Go B2B Cargo)
-- account. A Yandex corporate contract is one-per-company and a company may run
-- several venues/catalogs, so this is keyed at the ORG level (not per venue).
-- Krafta's own YANDEX_DELIVERY_TOKEN env stays a dev/test fallback only.
--
-- The API token is a secret, stored encrypted with the same app-layer
-- AES-256-GCM envelope used for Telegram bot tokens + payments credentials
-- (apps/krafta/lib/crypto/secret-box.ts). The DB only ever holds ciphertext.
--
-- One row per org (PK = org_id). The dispatcher reads via the service role
-- (bypasses RLS); the token column is never selected by client-facing queries.
-- `commerce.delivery_provider` already enumerates 'yandex' (Migration KRA-58),
-- so no enum change is needed. Applied to the dev branch via MCP; this file is
-- the source of truth for the eventual prod merge.

CREATE TABLE commerce.org_delivery_settings (
    org_id                uuid        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Which courier provider this token is for. Defaults to yandex (the first
    -- inline-courier integration); the column lets a future provider coexist.
    provider              commerce.delivery_provider NOT NULL DEFAULT 'yandex',
    -- AES-256-GCM envelope {v, alg, iv, tag, data} as jsonb. NULL until the
    -- merchant connects an account. Never returned to the browser.
    credentials_encrypted jsonb,
    -- Optional display label (e.g. the corporate-account name) shown in the
    -- dashboard so the merchant recognizes the connected account.
    account_label         text,
    -- Lets the merchant pause courier dispatch without deleting the token.
    is_active             boolean     NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE commerce.org_delivery_settings IS
  'Per-org courier-provider credentials for delivery dispatch (Yandex Go B2B). Token stored encrypted (app-layer AES-256-GCM); DB holds ciphertext only. One row per org.';
COMMENT ON COLUMN commerce.org_delivery_settings.credentials_encrypted IS
  'AES-256-GCM envelope jsonb (the provider API token). NULL until an account is connected. Never sent to the client.';
COMMENT ON COLUMN commerce.org_delivery_settings.is_active IS
  'When false, courier dispatch is paused for this org (the token is kept).';

-- updated_at bump (shared helper from baseline).
CREATE TRIGGER trg_org_delivery_settings_set_updated_at
  BEFORE UPDATE ON commerce.org_delivery_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- RLS — org owners/admins manage their courier credentials; members may read
-- the (non-secret) connection state. The dispatcher reads via the service role
-- (bypasses RLS). The token column is never selected by client-facing queries;
-- the dashboard server actions choose safe columns explicitly.
-- ===========================================================================

ALTER TABLE commerce.org_delivery_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_delivery_settings_select_authed ON commerce.org_delivery_settings
  FOR SELECT TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

CREATE POLICY org_delivery_settings_insert ON commerce.org_delivery_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY org_delivery_settings_update ON commerce.org_delivery_settings
  FOR UPDATE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY org_delivery_settings_delete ON commerce.org_delivery_settings
  FOR DELETE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.org_delivery_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.org_delivery_settings TO service_role;
