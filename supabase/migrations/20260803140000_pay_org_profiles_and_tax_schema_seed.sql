-- Krafta Pay: merchant profile captured during onboarding, plus the UZ tax
-- schema the tax profile depends on.
--
-- TWO THINGS, AND THE SECOND IS A LATENT BUG
-- ------------------------------------------
-- 1. `payments.org_profiles` — who the merchant is. Business type, legal form,
--    billing model, contact details. None of this had anywhere to live, because
--    Krafta Pay never had a merchant onboarding: an org was a name and a slug
--    created as a side effect of Krafta's shop wizard.
--
--    Deliberately a payments-schema table rather than columns on
--    `public.organizations`. That table belongs to Krafta Catalogs and is shared
--    between the two products; adding Krafta-Pay-specific columns to it is the
--    exact coupling we just spent this branch removing.
--
-- 2. `payments.tax_schemas` is seeded here, and that closes a real gap.
--    `payments.org_tax_profiles.schema_id` is NOT NULL with an FK to
--    `tax_schemas` — so a tax profile is unwritable until a schema row exists.
--    Prod has exactly one row (UZ_AUTOFISCAL_V1), inserted out-of-band and never
--    captured in a migration; **dev has none**. Onboarding writes a tax profile,
--    so on dev it would have failed on the FK with nothing in the repo to
--    explain why. Same class of drift as storage buckets and PostgREST exposed
--    schemas: state that exists in one environment because someone typed it in.
--
--    Seeded idempotently on `code`, so prod's existing row is left exactly as
--    it is and every other environment converges on it.

-- ---------------------------------------------------------------------------
-- tax schema (UZ autofiscalization)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS tax_schemas_code_unique
  ON payments.tax_schemas (code);

INSERT INTO payments.tax_schemas (code, name, country_iso2, version, is_active, metadata)
VALUES (
  'UZ_AUTOFISCAL_V1',
  'Uzbekistan Autofiscalization',
  'UZ',
  'v1',
  true,
  '{"required_fields": ["tax_code", "package_code", "tax_identity"], "tax_identity_types": ["TIN", "PINFL"]}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- org_profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payments.org_profiles (
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    -- Which of our target segments this merchant is. Drives the defaults we
    -- suggest for their first plan, and tells us our actual ICP mix rather than
    -- the one we assumed.
    business_type text NOT NULL,

    -- Decides which tax identifier is correct and how to validate it:
    -- a legal entity and an individual entrepreneur both carry a 9-digit INN,
    -- a self-employed person carries a 14-digit PINFL. `tax_schemas` for UZ
    -- declares exactly these two identity types, so this is not a free choice.
    legal_form text NOT NULL,

    -- Subscriptions, one-off payment links, or both. Decides where onboarding
    -- points them next.
    billing_model text NOT NULL DEFAULT 'subscriptions',

    contact_phone text,
    -- Telegram handle or number. The beachhead is Telegram-first businesses and
    -- this is how they actually expect to be reached; email is the fallback,
    -- not the default.
    telegram text,

    -- Whether the merchant has an acquirer yet. The single most load-bearing
    -- answer in the wizard: it decides whether onboarding ends at "paste your
    -- keys" or at "here is how to apply", instead of dropping someone with no
    -- merchant account onto a Providers page they cannot use.
    provider_status text NOT NULL DEFAULT 'none',

    -- NULL until the wizard finishes. The dashboard gate reads this, so a
    -- half-finished wizard sends the merchant back rather than through to a
    -- dashboard that would fail at first charge.
    onboarding_completed_at timestamp with time zone,

    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,

    CONSTRAINT org_profiles_pkey PRIMARY KEY (org_id),
    CONSTRAINT org_profiles_business_type_check CHECK (business_type IN (
      'telegram', 'edtech', 'saas', 'fitness', 'media', 'services', 'other'
    )),
    CONSTRAINT org_profiles_legal_form_check CHECK (legal_form IN (
      'legal_entity', 'individual_entrepreneur', 'self_employed'
    )),
    CONSTRAINT org_profiles_billing_model_check CHECK (billing_model IN (
      'subscriptions', 'one_off', 'both'
    )),
    CONSTRAINT org_profiles_provider_status_check CHECK (provider_status IN (
      'atmos', 'uzum', 'both', 'none'
    ))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'org_profiles_org_id_fkey'
  ) THEN
    ALTER TABLE payments.org_profiles
      ADD CONSTRAINT org_profiles_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE payments.org_profiles IS
  'Merchant profile captured by the Krafta Pay onboarding wizard. Lives in payments, not on public.organizations, to keep Krafta Pay decoupled from Krafta Catalogs.';
COMMENT ON COLUMN payments.org_profiles.onboarding_completed_at IS
  'NULL = wizard unfinished. The dashboard gate reads this.';

-- Service-role only, like the rest of payments: the dashboard authorizes org
-- membership in app code before touching these rows.
ALTER TABLE payments.org_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments.org_profiles TO service_role;
