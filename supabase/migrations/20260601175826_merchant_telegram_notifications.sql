-- Merchant order notifications via per-merchant Telegram bot.
--
-- Each venue connects ITS OWN Telegram bot (created in @BotFather) in the
-- dashboard. The bot token is a secret, stored encrypted with the same
-- app-layer AES-256-GCM envelope the payments domain uses for provider
-- credentials (packages/payments-core/src/secrets.ts) — mirrored in
-- apps/krafta/lib/crypto/secret-box.ts so the commerce app stays
-- decoupled from the payments package. The DB only ever holds ciphertext.
--
-- `chat_id` is the connected destination (the owner's DM with the bot, or
-- a staff "Orders" group). Captured via the bot's getUpdates after the
-- merchant messages it — no persistent webhook needed for v1.
--
-- One row per venue (PK = venue_id). Multiple recipients per venue is a
-- future extension (split chat_id into a child table); single chat covers
-- the launch case (one bot, one orders chat).
--
-- Conventions mirror public.venues (Migration 2): plain-ASCII COMMENTs,
-- org_id synced from the parent via trigger, updated_at trigger, org-role
-- RLS. Applied to the dev branch via MCP; this file is the source of truth
-- for the eventual prod merge.

CREATE TABLE commerce.venue_telegram_settings (
    venue_id            uuid        PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
    org_id              uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- AES-256-GCM envelope {v, alg, iv, tag, data} as jsonb. NULL until the
    -- merchant connects a bot. Never returned to the browser.
    bot_token_encrypted jsonb,
    -- Bot @handle from getMe, for display + a sanity check that the token
    -- resolves to the bot the merchant expects.
    bot_username        text,
    -- Connected chat (numeric id as text to avoid bigint JS precision loss).
    -- A DM chat id or a negative group/supergroup id. NULL until detected.
    chat_id             text,
    -- Human label for the connected chat ("Orders group", the owner name).
    chat_title          text,
    -- Lets the merchant pause alerts without disconnecting the bot.
    is_active           boolean     NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE commerce.venue_telegram_settings IS
  'Per-venue Telegram bot config for merchant order alerts. One bot + one chat per venue (v1). Token stored encrypted (app-layer AES-256-GCM); DB holds ciphertext only.';
COMMENT ON COLUMN commerce.venue_telegram_settings.bot_token_encrypted IS
  'AES-256-GCM envelope jsonb. NULL until a bot is connected. Never sent to the client.';
COMMENT ON COLUMN commerce.venue_telegram_settings.chat_id IS
  'Telegram chat id as text (numeric ids exceed JS safe-int for supergroups). NULL until the merchant messages the bot and the dashboard detects the chat.';

CREATE INDEX venue_telegram_settings_org_id_idx
  ON commerce.venue_telegram_settings (org_id);

-- updated_at bump (shared helper from baseline).
CREATE TRIGGER trg_venue_telegram_settings_set_updated_at
  BEFORE UPDATE ON commerce.venue_telegram_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sync org_id from the parent venue so the app can't attach a row to a
-- foreign-org venue. Mirrors public.venues_sync_org_id.
CREATE FUNCTION commerce.venue_telegram_settings_sync_org_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.venues WHERE id = NEW.venue_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'venue_telegram_settings.venue_id % does not exist', NEW.venue_id;
  END IF;
  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_venue_telegram_settings_sync_org_id
  BEFORE INSERT OR UPDATE OF venue_id ON commerce.venue_telegram_settings
  FOR EACH ROW EXECUTE FUNCTION commerce.venue_telegram_settings_sync_org_id();

-- ===========================================================================
-- RLS — org owners/admins manage their venue's notification config.
-- The dispatcher reads via the service role (bypasses RLS). The token
-- column is never selected by client-facing queries; the dashboard server
-- actions choose safe columns explicitly.
-- ===========================================================================

ALTER TABLE commerce.venue_telegram_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_telegram_settings_select_authed ON commerce.venue_telegram_settings
  FOR SELECT TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'member'::text]));

CREATE POLICY venue_telegram_settings_insert ON commerce.venue_telegram_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY venue_telegram_settings_update ON commerce.venue_telegram_settings
  FOR UPDATE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY venue_telegram_settings_delete ON commerce.venue_telegram_settings
  FOR DELETE TO authenticated
  USING (public.is_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

-- ===========================================================================
-- Grants
-- ===========================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.venue_telegram_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON commerce.venue_telegram_settings TO service_role;
