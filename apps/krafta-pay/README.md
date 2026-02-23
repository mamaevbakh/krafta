# Krafta Pay

Krafta Pay is the hosted billing and subscription infrastructure app (checkout + merchant billing dashboard).

It powers the Upgrade flow for Krafta Catalogs and is designed to later support other SaaS products using a bring-your-own-acquirer model.

## Product Scope (Current)

- Hosted checkout (`/pay/[public_token]`) for first subscription payment.
- Merchant billing dashboard (provider setup, plans, subscriptions, tax/fiscal data).
- Payment orchestration and provider integrations (currently Uzum-first).
- Subscription lifecycle + recurring billing engine (MVP scope).
- Webhook processing and reconciliation.

Krafta Pay is intentionally separate from the Krafta product app:

- `apps/krafta` = customer-facing merchant SaaS product.
- `apps/krafta-pay` = billing backbone and hosted payment infrastructure.

## Product Features (Current)

### Merchant-facing (dashboard)

- Uzum provider connection (test/live credentials, webhook secret).
- Plan CRUD (monthly plans, amount/currency, trial days, fiscal fields).
- Subscriptions list and status visibility.
- Tax profile setup (`TIN`/`PINFL`, fiscal country/schema).
- Tax code registry upload (SPIC + package code catalog for Uzbekistan autofiscalization).
- API key generation and use for server-to-server calls from client products (e.g. Krafta).

### Hosted billing / payment infrastructure

- Internal API to create subscription checkout sessions.
- Hosted checkout page by opaque public token.
- Uzum checkout initiation (first payment flow).
- Webhook ingestion and reconciliation.
- Subscription activation on successful payment.
- Recurring billing with stored binding token (`bindingId`) for autocharge renewals.
- Retry/dunning lifecycle (Stage 1 policy support in core logic).

## Product Status (Done vs Pending)

Snapshot date: **February 23, 2026**

### Done (Implemented)

- Uzum-first Stage 1 billing backbone (plans, subscriptions, invoices, intents, attempts, events).
- Hosted checkout page and provider selection (Uzum-only in Stage 1).
- Internal checkout creation API for Krafta integration.
- Merchant dashboard for:
  - Uzum provider settings,
  - plan management,
  - subscriptions overview,
  - tax code registry upload.
- Webhook endpoint (`/api/webhooks/uzum`) with signature verification support.
- Recurring payment support using Uzum `bindingId`.
- Fiscalization Phase 2 database model:
  - org tax profiles,
  - tax schemas,
  - tax registries,
  - plan tax classifications.

### Done (Uzum flow currently implemented)

Krafta Pay now follows the bind-first approach described by Uzum support for recurring payments:

1. `payment/register` is used to start card binding (not direct charge UI-first only).
2. Request uses binding-oriented params (`TWO_STEP` + `BINDING`) and `viewType=WEB_VIEW`.
3. Uzum webhook returns `bindingId` after successful card bind.
4. Krafta Pay calls `merchantPay` (back-to-back payment) with that `bindingId`.
5. Subscription/invoice are finalized only after the charge succeeds.
6. Future renewals use stored `bindingId` for off-session autocharge.

### Pending / Needs hardening

- Production-grade Click and Payme integrations (currently not Stage 1 production-ready).
- Full provider-specific edge-case handling and retries for all Uzum error states.
- Operator tooling:
  - webhook replay UI,
  - manual retry tools,
  - dunning override tools.
- Stronger observability dashboards/metrics in app UI (logs exist, productized monitoring is pending).
- Advanced subscription product features:
  - upgrades/downgrades,
  - proration,
  - multiple cancel modes,
  - invoice adjustments/credits.
- Refunds/disputes/payouts (out of MVP).

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

## Krafta Integration Model (Important Product Note)

- Krafta Catalogs is currently a **merchant/client of Krafta Pay**.
- End merchants of Krafta Catalogs (for example, Aladeen) are **subscribers to Krafta Catalogs**, not the payment merchant inside Krafta Pay (in this MVP setup).
- Future direction: other SaaS products/startups can onboard into Krafta Pay as their own merchants, connect their own Uzum (and later other acquirer) credentials, and charge their own customers.

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

## Pending Product Documentation (Recommended Next Additions)

- Provider capability matrix (Uzum / Click / Payme by feature and environment).
- Billing state machine diagram (subscription/invoice/intent/attempt transitions).
- Webhook replay and incident-response runbook.
- Tax/fiscal country schema strategy (Uzbekistan today, extensible country-specific validation later).
