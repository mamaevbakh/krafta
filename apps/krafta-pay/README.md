# Krafta Pay

Krafta Pay is the hosted billing app (checkout + merchant billing dashboard).

## Local Run

```bash
pnpm --filter krafta-pay dev
```

Default local URL: `http://localhost:3001`

## Required Environment

```bash
# Shared Supabase project
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Internal/API auth
KRAFTA_PAY_INTERNAL_SECRET=...
KRAFTA_PAY_API_KEYS_SECRET=...
PAY_CREDENTIALS_SECRET=...

# Runtime context
PAY_ENV=test
PAY_BASE_URL=http://localhost:3001

# Krafta app origins used by login handoff
KRAFTA_APP_URL=http://localhost:3000
KRAFTA_APP_URLS=http://localhost:3000,https://krafta.org,https://krafta.uz
NEXT_PUBLIC_KRAFTA_APP_URL=http://localhost:3000
NEXT_PUBLIC_KRAFTA_APP_URLS=http://localhost:3000,https://krafta.org,https://krafta.uz
```

## Supabase Auth URL Setup

In Supabase Authentication settings:

- Site URL should be an app origin (for example `https://krafta.org`), not a callback path.
- Redirect URLs must include each callback used by deployed domains:
  - `https://krafta.org/auth/confirm`
  - `https://pay.krafta.uz/auth/confirm`
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3001/auth/confirm`

## Auth Model

- `krafta-pay` does not have a standalone login form.
- Visiting `/dashboard` on Pay redirects to Krafta (`/auth/pay-handoff`).
- Krafta generates a Supabase magic link targeting Pay `/auth/confirm`.
- After callback, user returns to the original Pay URL.

## Fiscalization (Phase 2)

Stage 2 introduces canonical tax/fiscal modeling:

- `payments.tax_schemas`
- `payments.tax_code_registries`
- `payments.tax_code_entries`
- `payments.org_tax_profiles`
- `payments.plan_tax_classifications`

Dashboard flow:

1. Configure merchant tax identity in Providers (`TIN`/`PINFL`).
2. Upload SPIC + package code registry in `Dashboard -> Tax Codes`.
3. Assign plan fiscal fields in `Dashboard -> Plans` (`SPIC` + `package code`).

Checkout uses:

- org tax profile (`TIN`/`PINFL`) +
- plan tax classification (`SPIC` + `package code`)

and snapshots them into checkout/payment metadata for reproducible fiscal payloads.
