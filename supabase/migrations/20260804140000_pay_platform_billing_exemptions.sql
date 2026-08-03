-- Krafta Pay: organizations that are never charged a platform fee.
--
-- WHY A TABLE AND NOT A HARDCODED LIST
-- ------------------------------------
-- Two orgs must never be billed for structural reasons (the platform org would
-- invoice itself in a cycle), and a larger set must not be billed for business
-- reasons (everything on production at launch is the founder's own testing).
-- Encoding the second set as an email check in code would be wrong twice: it
-- would silently follow the account rather than the decision, and there would be
-- no way to answer "who is exempt, and why" without reading the source.
--
-- A row per exempt org, with a reason, is auditable and individually reversible:
-- billing a grandfathered merchant later is one DELETE, and it leaves a trail.
--
-- WHAT THIS SEEDS
-- ---------------
-- Every organization that exists at the moment this migration runs. Billing
-- therefore applies only to merchants who sign up AFTER the deploy — the same
-- grandfathering shape used when the 10 dine-in orgs were moved to comp
-- Business. On production that is 30 organizations, all of them test accounts.
--
-- New organizations created after this point are billable by default. That is
-- the intent: the exemption is a snapshot of "who was already here", not a rule.

CREATE TABLE IF NOT EXISTS payments.platform_billing_exemptions (
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    -- Why this org is exempt. Read by humans, not by code — every exemption is
    -- absolute regardless of reason.
    reason text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT platform_billing_exemptions_pkey PRIMARY KEY (org_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_billing_exemptions_org_id_fkey'
  ) THEN
    ALTER TABLE ONLY payments.platform_billing_exemptions
      ADD CONSTRAINT platform_billing_exemptions_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE payments.platform_billing_exemptions IS
  'Organizations never charged a Krafta Pay platform fee. Checked before provisioning, before rendering the billing page, and again before any charge.';

-- The platform org first, so it keeps the structural reason rather than the
-- grandfathering one. It is also excluded in code (`cannot_bill_platform_org`);
-- this row exists so a reader of the table sees the complete picture.
INSERT INTO payments.platform_billing_exemptions (org_id, reason)
SELECT o.id, 'platform_org'
FROM public.organizations o
WHERE o.slug = 'krafta-studio'
ON CONFLICT (org_id) DO NOTHING;

-- Everything that exists right now.
INSERT INTO payments.platform_billing_exemptions (org_id, reason)
SELECT o.id, 'grandfathered_at_launch'
FROM public.organizations o
ON CONFLICT (org_id) DO NOTHING;

ALTER TABLE payments.platform_billing_exemptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON payments.platform_billing_exemptions TO service_role;
