-- ⛔ BLOCKED — DO NOT APPLY. Moved out of supabase/migrations/ on 2026-08-04
-- so that `supabase db push` cannot pick it up.
--
-- Adversarial review found two defects that make this unsafe as written:
--
--  1. NO TEMPORAL BOUND. The reclassification predicate is purely structural,
--     with no created_at filter, so it matches intents created today. A merchant
--     in live mode who creates a payment link before connecting their live
--     account — Galaktika's exact onboarding shape — gets a correctly-labelled
--     'live' intent flipped to 'test'.
--
--  2. THE SAFETY ARGUMENT IS WRONG. It reasons that moving a row live -> test
--     "can only cause a provider lookup to find fewer accounts". The lookup uses
--     .eq("environment", …), an equality: moving a row selects a DIFFERENT
--     provider account. Under BYOA a row labelled 'test' holds the merchant's
--     own REAL credentials, so this can point a charge at the wrong real
--     acquirer rather than failing closed.
--
-- Also: the producer that was still writing mis-environmented rows is fixed as
-- of 6ea98fd (portal card update), so re-derive the affected population before
-- reworking this. It may now be smaller, or empty.
--
-- The analysis below is worth keeping; the SQL is not safe to run.

-- Krafta Pay: finish the environment backfill for rows with NO attempt lineage.
--
-- WHY THIS EXISTS ON TOP OF 20260803123000
-- ----------------------------------------
-- 20260803122000 added `environment` to payment_intents and checkout_sessions
-- as NOT NULL DEFAULT 'live'. 20260803123000 then reclassified from evidence,
-- but for payment_intents it applied ONLY Rule 1 — direct evidence from the
-- intent's own payment_attempts (see that file, "payment_intents — same direct
-- evidence, straight from their own attempts"). Subscriptions got a second,
-- structural rule; intents did not.
--
-- So an intent with ZERO attempts still reads 'live', and checkout_sessions
-- inherited that. An intent has zero attempts precisely when the customer never
-- reached provider selection — an unopened payment link, or an `incomplete`
-- subscription whose first invoice was never attempted. Those are not rare; on
-- a product whose links are sent by hand over Telegram they are the norm.
--
-- Three things read that column today and get it wrong for those rows:
--
--   1. GET /api/v1/payments filters `.eq("environment", auth.environment)`
--      (apps/krafta-pay/app/api/v1/payments/route.ts:42), as does the dashboard
--      list (apps/krafta-pay/app/api/dashboard/payments/route.ts:65). A merchant
--      working in test sees nothing from before the cutoff.
--
--   2. emitPaymentEvent routes the outbound `payment.*` fan-out on the intent's
--      own column (packages/payments-core/src/webhooks-out.ts:858), so a
--      pre-column TEST payment that settles today fans out to LIVE endpoints.
--      Bounded, but real: webhook_endpoints itself only exists from
--      20260803121000, so nothing that settled before the cutoff emitted at all.
--
--   3. THE ONE THAT IS NOT COSMETIC. tryResumeExistingSubscriptionCheckout
--      mints the new checkout session with the environment of the INTENT being
--      resumed (packages/payments-core/src/subscription.ts:993), not of the
--      subscription. 20260803123000's Rule 1 could classify a subscription
--      'test' from an attempt on invoice A while invoice B's never-attempted
--      intent stayed 'live'. Resuming that subscription mints a LIVE session,
--      and selectProviderCreateAttempt then resolves the org's LIVE provider
--      account (packages/payments-core/src/checkout.ts:178) for a subscription
--      that lives in test. Block 1 below is what closes that.
--
-- HOW WE DECIDE — what evidence actually exists
-- ---------------------------------------------
-- There is NO stored link from an intent to the API key that created it:
-- payments.payment_intents has no api_key_id (baseline.sql:1432-1447) and
-- payments.api_keys has no last_used_at (baseline.sql:1171-1183). "Which key
-- made this" is not recoverable. payments.logs.environment is
-- `process.env.PAY_ENV` at write time (packages/payments-core/src/debug-log.ts:31)
-- — the deployment's mode, not the row's, and constant 'live' on prod, so it
-- distinguishes nothing. Only two usable sources remain:
--
-- Rule 3 (lineage through the subscription). An intent that fronts an invoice
--   belongs to a subscription, and that subscription was already classified
--   from real evidence by 20260803123000. It is the intent's environment.
--   Applied only where the intent has no attempt of its own, so Rule 1's direct
--   evidence always wins.
--
-- Rule 4 (structural, one-offs). An intent with no attempt AND no invoice is an
--   abandoned one-off checkout. If the owning org has no active LIVE provider
--   account, it could not have been charged live. Mark it test. This is
--   verbatim the reasoning 20260803123000 already applied to subscriptions.
--
-- Anything else keeps 'live'. Same conservative direction as before: an
-- unproven row stays visible in the live dashboard rather than vanishing.
--
-- WHAT THIS CANNOT DO: cause a charge. Nothing resolves an acquirer from this
-- column at charge time — chargeRenewal goes through
-- payment_methods.org_provider_account_id, and a fresh hosted checkout reads
-- the session written by the API key. This migration only relabels rows whose
-- label is currently a column default, and it moves labels in one direction
-- (live -> test), which can only ever make a charge less likely, never more.
--
-- Idempotent: every block is guarded with IS DISTINCT FROM and recomputes the
-- same classification from the same evidence.
--
-- VERIFY BEFORE AND AFTER — run these on prod, they are pure SELECTs:
--
--   -- blast radius, by block
--   SELECT
--     count(*) FILTER (WHERE has_invoice)                        AS block1_candidates,
--     count(*) FILTER (WHERE NOT has_invoice)                    AS block2_candidates
--   FROM (
--     SELECT pi.id,
--            EXISTS (SELECT 1 FROM payments.invoices i
--                     WHERE i.payment_intent_id = pi.id) AS has_invoice
--     FROM payments.payment_intents pi
--     WHERE NOT EXISTS (SELECT 1 FROM payments.payment_attempts pa
--                        WHERE pa.payment_intent_id = pi.id)
--   ) t;
--
--   -- the money-relevant inconsistency block 1 closes; must be 0 afterwards
--   SELECT count(*)
--   FROM payments.payment_intents pi
--   JOIN payments.invoices i      ON i.payment_intent_id = pi.id
--   JOIN payments.subscriptions s ON s.id = i.subscription_id
--   WHERE pi.environment IS DISTINCT FROM s.environment;
--
--   -- sessions must agree with the intent they front; must be 0 afterwards
--   SELECT count(*)
--   FROM payments.checkout_sessions cs
--   JOIN payments.payment_intents pi ON pi.id = cs.payment_intent_id
--   WHERE cs.environment IS DISTINCT FROM pi.environment;

-- ---------------------------------------------------------------------------
-- Block 1 — Rule 3. Intents with no attempt, but with a subscription behind them
-- ---------------------------------------------------------------------------
--
-- invoices.payment_intent_id is nullable (baseline.sql:1330), hence the filter.
-- DISTINCT ON guards against an intent fronting more than one invoice; newest
-- invoice wins, matching how 20260803123000 broke its own ties.

WITH subscription_env AS (
  SELECT DISTINCT ON (i.payment_intent_id)
    i.payment_intent_id AS intent_id,
    s.environment::text AS env
  FROM payments.invoices i
  JOIN payments.subscriptions s ON s.id = i.subscription_id
  WHERE i.payment_intent_id IS NOT NULL
  ORDER BY i.payment_intent_id, i.created_at DESC
)
UPDATE payments.payment_intents pi
SET environment = subscription_env.env
FROM subscription_env
WHERE subscription_env.intent_id = pi.id
  AND pi.environment IS DISTINCT FROM subscription_env.env
  -- Rule 1's direct attempt evidence outranks this. Never overwrite it.
  AND NOT EXISTS (
    SELECT 1 FROM payments.payment_attempts pa
    WHERE pa.payment_intent_id = pi.id
  );

-- ---------------------------------------------------------------------------
-- Block 2 — Rule 4. One-off intents with no attempt, on orgs with no live account
-- ---------------------------------------------------------------------------

UPDATE payments.payment_intents pi
SET environment = 'test'
WHERE pi.environment IS DISTINCT FROM 'test'
  AND NOT EXISTS (
    SELECT 1 FROM payments.payment_attempts pa
    WHERE pa.payment_intent_id = pi.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM payments.invoices i
    WHERE i.payment_intent_id = pi.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM payments.org_provider_accounts a
    WHERE a.org_id = pi.org_id
      AND a.environment::text = 'live'
      AND a.status = 'active'
  );

-- ---------------------------------------------------------------------------
-- Block 3 — re-run the session inheritance now that intents have moved
-- ---------------------------------------------------------------------------
--
-- Byte-identical to the corresponding block in 20260803123000. A checkout
-- session must never disagree with the intent it fronts: the hosted pay page
-- resolves the provider account from the SESSION
-- (apps/krafta-pay/src/lib/checkout-environment.ts, resolveCheckoutEnvironment).

UPDATE payments.checkout_sessions cs
SET environment = pi.environment
FROM payments.payment_intents pi
WHERE pi.id = cs.payment_intent_id
  AND cs.environment IS DISTINCT FROM pi.environment;

-- ---------------------------------------------------------------------------
-- Block 4 — customers that only ever had one-off checkouts
-- ---------------------------------------------------------------------------
--
-- 20260803123000 derived customers.environment from their SUBSCRIPTIONS. A
-- customer created by createCheckoutSession for a plain payment
-- (packages/payments-core/src/checkout.ts:69-85) has none, so it kept 'live'
-- and is invisible to a test-mode customers list.
--
-- Customers WITH subscriptions are deliberately left alone: 20260803123000
-- already ruled on them, including its explicit prefer-'live' tie-break for a
-- customer straddling both modes.
--
-- The `external_id IS NULL` guard makes this provably unable to violate
-- customers_org_env_external_unique (20260803120000_pay_merchant_scoped_customers.sql:73),
-- which keys on (org_id, environment, external_id). external_id only started
-- being written after that migration, i.e. after environment was already
-- correct, so the guard excludes nothing that needs fixing.

WITH customer_env AS (
  SELECT
    cs.customer_id,
    CASE WHEN bool_or(pi.environment = 'live') THEN 'live' ELSE 'test' END AS env
  FROM payments.checkout_sessions cs
  JOIN payments.payment_intents pi ON pi.id = cs.payment_intent_id
  WHERE cs.customer_id IS NOT NULL
  GROUP BY cs.customer_id
)
UPDATE payments.customers c
SET environment = customer_env.env
FROM customer_env
WHERE customer_env.customer_id = c.id
  AND c.environment IS DISTINCT FROM customer_env.env
  AND c.external_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM payments.subscriptions s WHERE s.customer_id = c.id
  );
