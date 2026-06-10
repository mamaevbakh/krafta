-- KRA-46 / ADR 0006 — Telegram merchant identity lookup.
--
-- GoTrue has no Telegram provider and no admin API to attach an OAuth-style
-- identity, so the authoritative per-user record lives in app_metadata
-- (admin-only writable) and THIS table is the reverse index the bridge needs:
-- "which auth.users row does this Telegram account belong to?"
--
-- Written exclusively by the server-side bridge (service role). The two
-- uniqueness constraints are the identity-collision arbiters (ADR 0006):
--   PK(telegram_user_id)  — one Krafta account per Telegram account; a 23505
--                           on insert IS the collision signal that routes the
--                           register leg into the claim handshake.
--   UNIQUE(user_id)       — one Telegram identity per account (v1, mirrors
--                           linkIdentity semantics).

CREATE TABLE public.telegram_merchant_identities (
  telegram_user_id text PRIMARY KEY,
  user_id          uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username         text,
  first_name       text,
  photo_url        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.telegram_merchant_identities IS
  'KRA-46 / ADR 0006: verified Telegram Login Widget identity -> auth.users mapping for merchant login. Service-role access only (RLS enabled, no policies). telegram_user_id is the numeric Telegram id as text, matching commerce.customers.telegram_user_id.';

-- RLS on with no policies = deny-all for anon/authenticated; the service-role
-- bridge bypasses RLS. Belt-and-braces: revoke direct grants too.
ALTER TABLE public.telegram_merchant_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_merchant_identities FROM anon, authenticated;
