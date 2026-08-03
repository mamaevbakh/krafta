-- Krafta Pay: seed the provider registry in every environment.
--
-- WHY
-- ---
-- `payments.org_provider_accounts.provider_id` is a foreign key into
-- `payments.providers`, but only `atmos` was ever seeded by a migration
-- (20260612160000). Prod additionally carries `uzum`, `payme` and `click`
-- because somebody inserted them by hand a long time ago; the dev branch has
-- only `atmos`.
--
-- The consequence is not subtle: connecting Uzum on dev fails outright with
-- `org_provider_accounts_provider_id_fkey`, so a flow that works on production
-- cannot be reproduced or tested locally at all. Exactly the same class of
-- environment drift as the missing UZ tax schema (20260803140000) and the
-- storage buckets before it — state that exists in one place because a human
-- typed it there.
--
-- Seeded to match what prod already has, so every environment converges on the
-- same registry rather than prod being quietly special.
--
-- `is_active` here means "the row is a usable provider record", NOT "the
-- adapter works". Payme and Click are still `throw` stubs in
-- packages/payments-core, and two independent guards keep them unreachable:
-- the ENABLED_PROVIDERS allowlist in the select_provider route, and the
-- provider filter on the hosted pay page. The dashboard picker shows them
-- greyed with a "soon" badge. Their rows exist so a future adapter does not
-- need a migration to become connectable.

INSERT INTO payments.providers (id, display_name, is_active, capabilities)
VALUES
  ('atmos', 'Atmos',     true, '{}'::jsonb),
  ('uzum',  'Uzum Bank', true, '{}'::jsonb),
  ('payme', 'Payme',     true, '{}'::jsonb),
  ('click', 'Click',     true, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
