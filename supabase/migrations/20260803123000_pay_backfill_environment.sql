-- Krafta Pay: backfill test/live on rows that predate the environment columns.
--
-- WHY
-- ---
-- 20260803120000 and 20260803122000 add `environment` with `DEFAULT 'live'`.
-- For a brand-new column that default is the only option, but on prod it is
-- wrong for most of the existing data: at the time of writing, 44 of 72
-- production subscriptions trace to a **test** Atmos provider account and only
-- one traces to live. Prod has been the environment where test integrations
-- were exercised, so a blanket 'live' would relabel almost the entire table.
--
-- Nothing about this is dangerous in the money sense — `chargeRenewal` resolves
-- the acquirer from `payment_methods.org_provider_account_id`, never from this
-- column, so a mislabeled row could not cause a charge against the wrong
-- terminal. It is a *visibility* bug, and a bad one: mislabeled rows would show
-- up in live-mode API listings and inflate the live dashboard's MRR, active
-- subscriber count, and recovered-revenue figures with test traffic.
--
-- HOW WE DECIDE
-- -------------
-- Rule 1 (direct evidence). A payment attempt names the exact
--   `org_provider_account` that handled the charge, and that row already
--   carries a trustworthy `environment`. Where an attempt exists, it is the
--   answer.
--
-- Rule 2 (structural evidence). Rows with no attempt at all are abandoned
--   checkouts that never reached provider selection. There is no direct
--   evidence, but if the owning org has no active LIVE provider account, the
--   subscription could not possibly have been live. Mark those test.
--
-- Anything else keeps the 'live' default. That is the conservative direction:
-- an unproven row stays visible rather than silently vanishing from a
-- merchant's live dashboard.
--
-- Idempotent: re-running recomputes the same classification from the same
-- evidence.

-- ---------------------------------------------------------------------------
-- Rule 1 — subscriptions with attempt lineage
-- ---------------------------------------------------------------------------

WITH traced AS (
  SELECT DISTINCT ON (s.id)
    s.id AS subscription_id,
    a.environment::text AS env
  FROM payments.subscriptions s
  JOIN payments.invoices i        ON i.subscription_id = s.id
  JOIN payments.payment_attempts pa ON pa.payment_intent_id = i.payment_intent_id
  JOIN payments.org_provider_accounts a ON a.id = pa.org_provider_account_id
  -- Newest attempt wins: if a subscription was retried across environments,
  -- the most recent charge is the one that reflects where it lives now.
  ORDER BY s.id, pa.created_at DESC
)
UPDATE payments.subscriptions s
SET environment = traced.env
FROM traced
WHERE traced.subscription_id = s.id
  AND s.environment IS DISTINCT FROM traced.env;

-- ---------------------------------------------------------------------------
-- Rule 2 — no attempt lineage, and the org has no live provider account
-- ---------------------------------------------------------------------------

WITH orgs_without_live AS (
  SELECT o.id AS org_id
  FROM public.organizations o
  WHERE NOT EXISTS (
    SELECT 1 FROM payments.org_provider_accounts a
    WHERE a.org_id = o.id
      AND a.environment::text = 'live'
      AND a.status = 'active'
  )
),
no_lineage AS (
  SELECT s.id
  FROM payments.subscriptions s
  WHERE NOT EXISTS (
    SELECT 1
    FROM payments.invoices i
    JOIN payments.payment_attempts pa ON pa.payment_intent_id = i.payment_intent_id
    WHERE i.subscription_id = s.id
  )
)
UPDATE payments.subscriptions s
SET environment = 'test'
WHERE s.id IN (SELECT id FROM no_lineage)
  AND s.org_id IN (SELECT org_id FROM orgs_without_live)
  AND s.environment IS DISTINCT FROM 'test';

-- ---------------------------------------------------------------------------
-- payment_intents — same direct evidence, straight from their own attempts
-- ---------------------------------------------------------------------------

WITH traced AS (
  SELECT DISTINCT ON (pi.id)
    pi.id AS intent_id,
    a.environment::text AS env
  FROM payments.payment_intents pi
  JOIN payments.payment_attempts pa ON pa.payment_intent_id = pi.id
  JOIN payments.org_provider_accounts a ON a.id = pa.org_provider_account_id
  ORDER BY pi.id, pa.created_at DESC
)
UPDATE payments.payment_intents pi
SET environment = traced.env
FROM traced
WHERE traced.intent_id = pi.id
  AND pi.environment IS DISTINCT FROM traced.env;

-- ---------------------------------------------------------------------------
-- checkout_sessions — inherit from the intent they front
-- ---------------------------------------------------------------------------

UPDATE payments.checkout_sessions cs
SET environment = pi.environment
FROM payments.payment_intents pi
WHERE pi.id = cs.payment_intent_id
  AND cs.environment IS DISTINCT FROM pi.environment;

-- ---------------------------------------------------------------------------
-- customers — inherit from their subscriptions
-- ---------------------------------------------------------------------------
--
-- A customer with subscriptions in both environments cannot be represented
-- (identity is scoped per environment), so prefer 'live': being visible to a
-- live key is recoverable, being invisible is not. In practice this is a
-- pre-existing-data concern only — post-migration, customers are created with
-- the environment of the key that created them and never straddle.

WITH customer_env AS (
  SELECT
    s.customer_id,
    CASE WHEN bool_or(s.environment = 'live') THEN 'live' ELSE 'test' END AS env
  FROM payments.subscriptions s
  GROUP BY s.customer_id
)
UPDATE payments.customers c
SET environment = customer_env.env
FROM customer_env
WHERE customer_env.customer_id = c.id
  AND c.environment IS DISTINCT FROM customer_env.env;
