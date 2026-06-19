-- Telegram Mini App (TMA) identity + per-venue enablement.
--
-- TMA shoppers are identified by a verified telegram_user_id (from signed
-- initData), not an anonymous Supabase session. We store that id on the
-- customer so the SAME Telegram user resolves to the SAME customer across
-- app reopens (stable identity — cart + order history persist). Cross-
-- channel dedup with web (anon) customers still happens by phone.
--
-- venues.tma_enabled is the merchant-facing switch: the dashboard toggles
-- it on, which surfaces the t.me/KraftaBot?startapp=<slug> storefront link.

-- ---------------------------------------------------------------------------
-- 1. customers.telegram_user_id
-- ---------------------------------------------------------------------------

ALTER TABLE commerce.customers
  ADD COLUMN telegram_user_id text;

COMMENT ON COLUMN commerce.customers.telegram_user_id IS
  'Telegram numeric user id (as text) from verified Mini App initData. NULL for web/anon customers. Unique per org while present.';

-- One customer per (org, telegram user). Partial so the common NULL case
-- (web customers) stays out of the index. The TMA session resolver upserts
-- against this.
CREATE UNIQUE INDEX customers_org_telegram_user_id_key
  ON commerce.customers (org_id, telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. venues.tma_enabled
-- ---------------------------------------------------------------------------

ALTER TABLE public.venues
  ADD COLUMN tma_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.venues.tma_enabled IS
  'Merchant switch: when true, the venue has a Telegram Mini App storefront (t.me/KraftaBot?startapp=<catalog-slug>). Toggled from Settings.';
