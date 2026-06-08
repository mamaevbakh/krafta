-- S1 shared-bot connect handshake.
--
-- The platform bot (@KraftaBot) binds a merchant's order-alert chat via a
-- short-lived per-venue code: the dashboard generates a code, the merchant
-- sends it to the bot (DM `/start <code>` or group `/connect <code>`), and
-- the webhook matches the code to the venue and stores the chat_id.
--
-- bot_token_encrypted stays NULL for S1 (the dispatcher falls back to the
-- platform TELEGRAM_BOT_TOKEN); it is only set for the S2 "bring your own
-- bot" upgrade. The connect code is cleared once the chat is bound.

ALTER TABLE commerce.venue_telegram_settings
  ADD COLUMN connect_code text,
  ADD COLUMN connect_code_expires_at timestamptz;

COMMENT ON COLUMN commerce.venue_telegram_settings.connect_code IS
  'Short-lived code the merchant sends to the bot to bind their chat. NULL once bound or expired. Unique while present.';

-- Unique while present so the webhook can resolve a code to exactly one
-- venue. Partial index keeps NULLs (the common state) out of the index.
CREATE UNIQUE INDEX venue_telegram_settings_connect_code_key
  ON commerce.venue_telegram_settings (connect_code)
  WHERE connect_code IS NOT NULL;
