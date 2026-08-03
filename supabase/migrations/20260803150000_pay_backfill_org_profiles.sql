-- Krafta Pay: treat already-configured merchants as onboarded.
--
-- WHY
-- ---
-- The dashboard gate reads `payments.org_profiles.onboarding_completed_at`.
-- Every organization that existed before the wizard shipped has no row there,
-- so without this migration each one gets redirected into a five-screen setup
-- flow — including Krafta's own live billing org, which has been charging real
-- subscriptions for months.
--
-- An org that already carries a tax profile is, by definition, set up: the tax
-- identity is the one piece of onboarding a charge genuinely cannot proceed
-- without. Marking those complete keeps live merchants out of a wizard that has
-- nothing left to ask them.
--
-- Orgs WITHOUT a tax profile are deliberately left alone. They really are
-- unconfigured, the wizard has real questions for them, and the onboarding
-- endpoint now attaches to an existing org rather than refusing — so they can
-- complete it without losing their slug or their data.
--
-- `legal_form` is derived, not guessed: the tax identity type already records
-- it. A TIN belongs to a legal entity or an individual entrepreneur (we cannot
-- tell which from the number alone, so the broader of the two is chosen), and a
-- PINFL only ever belongs to a self-employed person.
--
-- `business_type` genuinely is unknown for these rows, and 'other' says so
-- honestly rather than inventing a segment that would then pollute the ICP mix
-- the column exists to measure.

INSERT INTO payments.org_profiles (
  org_id,
  business_type,
  legal_form,
  billing_model,
  provider_status,
  onboarding_completed_at,
  metadata
)
SELECT
  t.org_id,
  'other',
  CASE t.tax_identity_type
    WHEN 'PINFL' THEN 'self_employed'
    ELSE 'legal_entity'
  END,
  'subscriptions',
  -- Reflect what they actually have connected, so the dashboard does not
  -- prompt an established merchant to "connect a provider" they already use.
  CASE
    WHEN EXISTS (
      SELECT 1 FROM payments.org_provider_accounts a
      WHERE a.org_id = t.org_id AND a.provider_id = 'atmos' AND a.status = 'active'
    ) AND EXISTS (
      SELECT 1 FROM payments.org_provider_accounts a
      WHERE a.org_id = t.org_id AND a.provider_id = 'uzum' AND a.status = 'active'
    ) THEN 'both'
    WHEN EXISTS (
      SELECT 1 FROM payments.org_provider_accounts a
      WHERE a.org_id = t.org_id AND a.provider_id = 'atmos' AND a.status = 'active'
    ) THEN 'atmos'
    WHEN EXISTS (
      SELECT 1 FROM payments.org_provider_accounts a
      WHERE a.org_id = t.org_id AND a.provider_id = 'uzum' AND a.status = 'active'
    ) THEN 'uzum'
    ELSE 'none'
  END,
  now(),
  jsonb_build_object('source', 'backfill_20260803150000')
FROM payments.org_tax_profiles t
ON CONFLICT (org_id) DO NOTHING;
