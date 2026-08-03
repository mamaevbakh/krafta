-- Krafta Pay: carry test/live on the checkout objects themselves.
--
-- WHY
-- ---
-- Every point in the hosted checkout that needed to know "test or live" read a
-- process-global `process.env.PAY_ENV`:
--
--   app/pay/[public_token]/page.tsx
--   app/pay/[public_token]/select/route.ts
--   app/api/checkout_sessions/[public_token]/select_provider/route.ts
--   app/api/checkout_sessions/[public_token]/atmos/pre-apply/route.ts
--
-- That is fine for a single-tenant deployment where the whole process is one
-- mode. It makes test mode impossible on a live deployment: the pay page would
-- resolve the LIVE Atmos provider account for a checkout that a `krp_test_` key
-- created, and charge a real card.
--
-- The environment is a property of the checkout, decided once by the API key
-- that created it. Storing it here means the pay page, the provider selector,
-- and the inline card form all agree without consulting an env var. PAY_ENV
-- survives only as the default for rows created before this migration and for
-- flows with no key context (dashboard-created payment links).

ALTER TABLE payments.payment_intents
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live';

ALTER TABLE payments.checkout_sessions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_environment_check'
  ) THEN
    ALTER TABLE payments.payment_intents
      ADD CONSTRAINT payment_intents_environment_check
      CHECK (environment IN ('test', 'live'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checkout_sessions_environment_check'
  ) THEN
    ALTER TABLE payments.checkout_sessions
      ADD CONSTRAINT checkout_sessions_environment_check
      CHECK (environment IN ('test', 'live'));
  END IF;
END $$;

COMMENT ON COLUMN payments.payment_intents.environment IS
  'test | live. Fixed at creation from the API key. Decides which org_provider_account charges this intent.';
COMMENT ON COLUMN payments.checkout_sessions.environment IS
  'test | live. Mirrors the payment intent so the hosted pay page resolves the right provider account without a join.';
