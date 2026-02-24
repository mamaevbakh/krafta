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
2. Request uses binding-oriented params (`TWO_STEP` + `BINDING`) and hosted redirect (`viewType=REDIRECT` in current flow).
3. Uzum webhook returns `bindingId` after successful card bind.
4. Krafta Pay persists `bindingId` immediately (even if the first charge later fails).
5. Krafta Pay performs a second `payment/register` for the actual charge order.
6. Krafta Pay calls `merchantPay` (back-to-back payment) with `processData.type="bind"` and the saved `bindingId`, using the `orderId` returned by the second register call.
7. Subscription/invoice are finalized only after the charge succeeds.
8. Future renewals use stored `bindingId` for off-session autocharge.

#### Uzum Subscription Integration (Verified Runtime Flow)

Verified in test runtime on **February 24, 2026**.

Important clarification from Uzum support/docs:

- "`merchantPay` should use the same `orderId`" means the same `orderId` returned by the **charge register** call immediately before `merchantPay`.
- It does **not** mean reusing the `orderId` from the earlier card-binding register flow.

#### Concrete Bind-First Subscription Flow (Krafta Pay)

1. **Binding register (UI)**
   - Call `payment/register` with:
   - `paymentParams.payType = "TWO_STEP"`
   - `paymentParams.operationType = "BINDING"`
   - Redirect user to Uzum UI.
2. **Binding webhook**
   - Uzum webhook returns binding success payload including `bindingId` and binding `orderId`.
   - Krafta Pay stores the `bindingId` in `payment_methods.provider_token`.
3. **Charge register (server-to-server)**
   - Krafta Pay calls `payment/register` again for the actual subscription charge.
   - This call must use a **distinct `orderNumber`** (different from the binding register `orderNumber`) so Uzum returns a new charge `orderId`.
4. **merchantPay (server-to-server)**
   - Krafta Pay calls `merchantPay` with:
   - `processData.type = "bind"`
   - `processData.bindingId = <saved bindingId>`
   - `orderId = <charge register response.result.orderId>`
5. **Finalize subscription**
   - On success, mark intent/invoice/subscription paid/active.

#### Renewal Flow (Off-Session, Stripe-Like)

Renewals reuse the saved `bindingId` and skip the card-binding UI step.

1. **Create/resolve renewal invoice + payment intent**
   - Krafta Pay creates (or reuses) an open invoice and payment intent for the due billing period.
2. **Create renewal payment attempt**
   - A new `payment_attempts` row is created for each renewal charge attempt.
3. **Charge register (server-to-server)**
   - Call `payment/register` for the renewal amount.
   - Use a **unique `orderNumber` per attempt** (for example `renewal-<attemptId>`).
   - This returns a new charge `orderId`.
4. **merchantPay (server-to-server)**
   - Call `merchantPay` with:
   - `processData.type = "bind"`
   - `processData.bindingId = <saved bindingId>`
   - `orderId = <renewal charge register response.result.orderId>`
5. **Finalize or dunning**
   - Success: invoice paid, subscription period advances.
   - Failure: invoice stays open and dunning scheduling (`due_at`, `attempt_count`) drives the next retry window.

#### Forever Verification (Operational Invariants)

Use `payments.logs` and confirm these invariants for any bind-first checkout:

1. **Binding order and charge order are different**
   - `uzum.register.response.result.orderId` (binding order)
   - `uzum.merchant_pay.register_for_order.response.result.orderId` (charge order)
   - These must be different.
2. **merchantPay uses the charge register order**
   - `uzum.merchant_pay.request.request.orderId`
   - Must equal `uzum.merchant_pay.register_for_order.response.result.orderId`
3. **Charge register path is used**
   - `uzum.merchant_pay.request.chargeOrderIdSource = "registered"`
4. **Binding is persisted before charge finalization**
   - `webhook.binding_saved.saved = true`
5. **Charge succeeds**
   - `uzum.merchant_pay.response.response.errorCode = 0`
   - `webhook.binding_charge_result.chargeStatus = "succeeded"`

#### Forever Verification (Renewals)

Use `payments.logs` + renewal attempt records and confirm:

1. **Renewal charge register path is used**
   - `uzum.merchant_pay.request.chargeOrderIdSource = "registered"`
2. **Renewal register and merchantPay orderId match**
   - `uzum.merchant_pay.request.request.orderId`
   - equals `uzum.merchant_pay.register_for_order.response.result.orderId`
3. **Renewal orderNumber is per-attempt and unique**
   - `uzum.merchant_pay.register_for_order.request.request.orderNumber`
   - should look like `renewal-<attemptId>` (or another unique per-attempt value)
4. **Renewal succeeds or cleanly enters dunning**
   - Success: `uzum.merchant_pay.response.response.errorCode = 0` and invoice becomes `paid`
   - Failure: invoice remains `open` with incremented `attempt_count` and future `due_at`

#### Known Gotcha (Root Cause We Hit)

- Uzum `payment/register` may behave idempotently by `orderNumber`.
- If the post-bind charge register reuses the same `orderNumber` as the binding register, Uzum can return the original binding `orderId`.
- Passing that binding `orderId` to `merchantPay` then fails with `errorCode=3000` (`Invalid payment status for this operation`).
- The same applies to renewal retries if the same renewal charge `orderNumber` is reused.
- Fix: use a distinct `orderNumber` for every charge register step (for example `charge-<attemptId>` / `renewal-<attemptId>`).

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
