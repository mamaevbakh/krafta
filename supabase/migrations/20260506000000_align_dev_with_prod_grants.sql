-- Aligns dev branch privileges with prod state (KRA-52 followup).
-- Prod was hand-configured (Dashboard / SQL editor) with grants that the baseline
-- pg_dump did not capture. New dev branches replay only the baseline, so they
-- end up missing payments.* grants + pg_graphql, and inherit Supabase's default
-- public-schema grants on the auth_* tables (which is more permissive than prod).
--
-- This migration is fully idempotent (CREATE EXTENSION IF NOT EXISTS,
-- GRANT/REVOKE on already-correct state) and safe to apply to either project.

-- 1. Reinstate pg_graphql extension (Supabase auto-installs on prod; baseline
--    only captured table DDL, not extensions).
CREATE EXTENSION IF NOT EXISTS pg_graphql;

-- 2. payments schema grants — match prod's curated state.
GRANT USAGE ON SCHEMA payments TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA payments
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- service_role: full CRUD on every payments table.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA payments
  TO service_role;

-- authenticated: only the user-facing payments tables (matches prod).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  payments.checkout_sessions,
  payments.customers,
  payments.invoices,
  payments.payment_attempts,
  payments.payment_intents,
  payments.payment_methods,
  payments.plans,
  payments.subscriptions
TO authenticated;

-- 3. Harden public.auth_* — revoke the accidental anon/authenticated grants
--    that Supabase's default public-schema privileges added when the baseline
--    created these tables. They store OAuth client secrets and pending auth
--    codes; only service_role should touch them.
REVOKE ALL PRIVILEGES
  ON public.auth_clients, public.auth_authorization_codes
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.auth_clients, public.auth_authorization_codes
  TO service_role;
