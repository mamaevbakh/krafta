-- Krafta Pay: merchant-scoped customer identity + per-environment isolation.
--
-- WHY
-- ---
-- `payments.customers` was designed when Krafta Catalogs was the only client:
-- a "customer" was another Krafta organization, so identity lived in
-- `customer_org_id uuid REFERENCES public.organizations(id)`. That FK makes the
-- billing engine unusable for any merchant whose subscribers are not Krafta
-- orgs — a Telegram bot's paid-channel members, an EdTech school's students, a
-- gym's members. It is the single hardest coupling between Krafta Pay and
-- Krafta.
--
-- Worse, the escape hatch was silently broken. `createSubscriptionCheckout`
-- accepts `customerOrgId: null` for "generic email-identified customers", but
-- the dedup lookup is gated on `input.customerOrgId && customerUserRef` — so
-- with a null org every call INSERTs a brand-new customer row. Two checkout
-- calls for the same person produced two customers and two subscriptions.
--
-- WHAT
-- ----
-- `external_id` is the merchant's own identifier for their subscriber
-- (telegram user id, internal user uuid, student number — their choice). It is
-- the identity key for every merchant that is not Krafta itself. Uniqueness is
-- scoped `(org_id, environment, external_id)` so:
--   * two merchants may both use "user_1" without colliding
--   * a merchant's test-mode "user_1" is a different record from their live one
--
-- `customer_org_id` stays, unchanged and still nullable, so the existing Krafta
-- integration keeps working untouched. New merchants never set it.
--
-- `environment` lands on customers and subscriptions (NOT plans — a plan is
-- just amount+interval and duplicating them across modes is pure friction).
-- Before this, "test vs live" existed only on `api_keys` and
-- `org_provider_accounts`, and the API-key check compared against a GLOBAL
-- `process.env.PAY_ENV` — meaning a `krp_test_` key was rejected outright on
-- the live deployment. A new merchant could not integrate against test before
-- going live. Environment now travels with the data, so both modes coexist on
-- one deployment.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

ALTER TABLE payments.customers
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_environment_check'
  ) THEN
    ALTER TABLE payments.customers
      ADD CONSTRAINT customers_environment_check
      CHECK (environment IN ('test', 'live'));
  END IF;
END $$;

-- Reject blank/whitespace external ids rather than storing an unusable key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_external_id_not_blank'
  ) THEN
    ALTER TABLE payments.customers
      ADD CONSTRAINT customers_external_id_not_blank
      CHECK (external_id IS NULL OR length(btrim(external_id)) > 0);
  END IF;
END $$;

-- The identity index for non-Krafta merchants. Partial so the many existing
-- rows with a NULL external_id (Krafta's org-keyed customers) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS customers_org_env_external_unique
  ON payments.customers (org_id, environment, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_org_env_idx
  ON payments.customers (org_id, environment);

COMMENT ON COLUMN payments.customers.external_id IS
  'Merchant''s own identifier for this subscriber. Identity key for merchants whose customers are not Krafta orgs. Unique per (org_id, environment).';
COMMENT ON COLUMN payments.customers.environment IS
  'test | live. Scopes identity and dashboard/metric visibility so both modes coexist on one deployment.';

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
--
-- The renewal cron already charges through `payment_methods.org_provider_account_id`,
-- so a test subscription was never at risk of hitting a live terminal. This
-- column exists so the dashboard, the metrics, and the outbound webhook fan-out
-- can separate the two without joining three tables to find out.

ALTER TABLE payments.subscriptions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_environment_check'
  ) THEN
    ALTER TABLE payments.subscriptions
      ADD CONSTRAINT subscriptions_environment_check
      CHECK (environment IN ('test', 'live'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_org_env_status_idx
  ON payments.subscriptions (org_id, environment, status);

COMMENT ON COLUMN payments.subscriptions.environment IS
  'test | live. Inherited from the API key (or provider account) that created the subscription.';

-- ---------------------------------------------------------------------------
-- paused subscriptions
-- ---------------------------------------------------------------------------
--
-- The MVP contract promises pause/resume. `subscriptions_status_check` had no
-- `paused` value, so there was no way to represent "keep the subscription and
-- the saved card, but stop billing" — merchants had to cancel and re-onboard,
-- losing the card token. The renewal runner filters on `active`/`past_due`, so
-- a paused subscription is skipped by construction.

ALTER TABLE payments.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE payments.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'paused',
    'unpaid',
    'canceled'
  ));
