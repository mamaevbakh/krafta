# Krafta Platform and Krafta Pay Reference

## Document purpose

This document is the **operational** reference — provider flows, log taxonomy, debugging runbooks. Its audience is operators, support, and Krafta Pay's own developers.

For the **merchant integration guide** (authentication, customers, subscriptions, webhooks) see [krafta-pay-api.md](./krafta-pay-api.md). That is what an external client reads; this is what we read when something breaks.

- **Krafta** (`apps/krafta`) = merchant-facing product application (catalogs, builder, billing entrypoint)
- **Krafta Pay** (`apps/krafta-pay`) = hosted billing infrastructure (provider setup, plans, checkout orchestration, subscriptions)

It also documents the purpose and structure of **`payments.logs`**, including the current log event taxonomy and payload fields.

## Product model (important)

### Core roles

- **Krafta Pay merchant**: any business using Krafta Pay as billing infrastructure. Krafta Catalogs is one of them, not the only shape one can take.
- **End customer / subscriber**: whoever pays that merchant's recurring bill — a Telegram channel member, a student, a gym member, or (in Krafta's case) another organization.
- **Payment provider account owner**: the merchant, always. They bring their own Atmos or Uzum credentials.

Stripe-like platform model with a **bring-your-acquirer** approach: funds settle directly from subscriber to the merchant's own provider account. Krafta Pay never holds, routes, or settles money.

### Customer identity: two keys

`payments.customers` supports two identity keys, and which one is in play determines everything about how a merchant integrates.

- **`external_id`** — the merchant's own id for the subscriber. Unique per `(org_id, environment, external_id)`. The key for every merchant that is not Krafta. A subscriber does not need to exist anywhere in Krafta.
- **`customer_org_id`** — a `public.organizations` uuid. Krafta billing one of its own merchant orgs. Predates the external-id model and is unchanged.

Historically only `customer_org_id` existed, and `POST /api/v1/subscriptions/checkout` required it — which made Krafta Pay unusable for any merchant whose subscribers are not Krafta organizations. The documented escape hatch (pass `null`) had no dedup path, so every call inserted a fresh customer and forked a duplicate subscription.

`resolveOrCreateCustomer` (in `@krafta/payments-core`) is now the single resolution point for both, and reports `identified` — whether the customer can be recognised on a later call. Checkout resume is gated on it: an anonymous customer (neither key) is a different person every time, so resuming would attach a stranger to someone else's subscription.

### Environments

`test` and `live` coexist on one deployment. The environment is carried on the data — `api_keys`, `org_provider_accounts`, `customers`, `subscriptions`, `payment_intents`, `checkout_sessions`, `webhook_endpoints`, `webhook_deliveries` — and is fixed at creation from the API key.

Before this, every environment decision read a process-global `PAY_ENV`, and `authenticateMerchantApiKey` rejected any key whose prefix disagreed with it. A `krp_test_` key was therefore rejected outright on the live deployment: a new merchant could not integrate against test before going live.

`PAY_ENV` survives only as the fallback for rows created before the columns existed, and for flows with no key context (dashboard-created payment links). **Do not add new reads of it in the checkout path** — use `resolveCheckoutEnvironment` / the session's own column.

Plans are deliberately NOT environment-scoped: a plan is amount + interval, and duplicating pricing across modes is friction with no upside.

## Platform functionality (current)

### Krafta (`apps/krafta`)

Krafta is the product app where merchants manage catalogs and initiate upgrades.

Current billing-related capabilities:

- Billing page inside catalog dashboard
- Entitlement display (locked / active / etc.)
- Upgrade CTA that calls Krafta Pay
- Redirect to hosted Krafta Pay checkout
- Return to Krafta after checkout success/failure callback flow

Related business context (non-billing):

- Catalog builder and component system
- Category/item management
- Branding/layout configuration
- Catalog publishing and customer-facing catalog experience

### Krafta Pay (`apps/krafta-pay`)

Krafta Pay is the hosted billing backbone for Krafta products.

Current Stage 1 capabilities:

- Dashboard auth (shared Krafta auth flow)
- Provider setup (Uzum, stage 1 focus)
- Plan management (monthly subscription plans)
- Tax/fiscalization metadata support for Uzbekistan (TIN/SPIC/package code)
- API keys for internal/product integration
- Hosted checkout (`/pay/[public_token]`)
- Uzum binding-first flow (attach card -> charge)
- Webhook processing and reconciliation
- Subscription/invoice/payment intent/payment attempts lifecycle
- Subscriptions dashboard with charge/invoice visibility
- Logs dashboard for debugging provider/callback/webhook flows

## Subscription checkout flow (current Stage 1)

### High-level sequence

1. User clicks **Upgrade** in Krafta
2. Krafta backend calls Krafta Pay internal API
3. Krafta Pay creates:
   - subscription
   - invoice
   - payment intent
   - checkout session
4. User is redirected to Krafta Pay hosted checkout
5. User selects Uzum
6. Krafta Pay registers a **binding-first** Uzum flow
7. User attaches card in Uzum (0.00 UZS verification/binding)
8. Uzum returns user to Krafta Pay callback page (`success`/`failure`)
9. Uzum webhook sends `bindingId` to Krafta Pay
10. Krafta Pay performs provider charge (`merchantPay`) using `bindingId`
11. Krafta Pay finalizes payment + subscription state
12. User is redirected back to Krafta billing page

### Important UX/product note

The Uzum screen may show **0.00 UZS** during binding. This is expected for card attachment. The actual subscription charge is executed **after binding**, using the returned `bindingId`.

## Subscription renewals (current)

### Implemented

- Renewal scheduler endpoint exists and is used by Vercel Cron: `POST /api/internal/renewals/cron`
- Off-session charging uses saved provider token (`bindingId` for Uzum)
- Renewal charge flow uses:
  - Uzum `payment/register` (to create a fresh charge `orderId`)
  - Uzum `merchantPay` with `processData.type = "bind"`
- Renewal attempts use unique Uzum `orderNumber` values (for example `renewal-<attemptId>`) to avoid provider idempotency collisions
- Failed renewals enter dunning via invoice fields:
  - `attempt_count`
  - `due_at`

### Current gaps (expected)

- Full dunning operations UI (operator replay/cancel tools)
- Merchant-configurable dunning policy and final action
- Expanded renewal run reporting in dashboard UI

## Stuck-payment reconciliation (Atmos)

Atmos inline charges settle **synchronously**: the apply route charges at Atmos and then writes the outcome locally. If a local write (or network blip) fails **after** the charge settled, the `payment_intent` is left `status = 'processing'` even though the money moved — the customer sees a spinner/error for a charge that actually succeeded.

A deferred reconciler recovers that state out-of-band.

### Implemented

- Reconciler core lives in `@krafta/payments-core` (`reconcileProcessingAtmosIntents`, `reconcileAtmosPaymentIntent`).
- It finds Atmos `payment_intents` stuck in `processing` older than **~2 minutes** (the settle window before stepping in), resolves the attempt's Atmos transaction id (`payment_attempts.provider_payment_id`, falling back to `raw_init_response.providerRefs.transactionId`), and calls Atmos `/merchant/pay/get` (`atmosGet`).
  - `succeeded` → replays the **same finalize path** as the apply route (`finalizeInitialPayment`), which settles both subscription invoices and one-off / payment-link intents and is idempotent if already finalized.
  - `failed` → `markPaymentFailed` (subscription dunning) or `markStandaloneCheckoutFailed` (one-off), depending on the intent kind.
  - No resolvable transaction id → **skipped and logged for manual review**; it never auto-fails an intent it cannot prove, so a real charge is never hidden.
- On a resolved intent it broadcasts the same realtime checkout update the apply route uses, so a waiting hosted page redirects promptly.

### Cron endpoint and cadence

- `GET|POST /api/internal/atmos/reconcile/cron` — Vercel Cron, **every 5 minutes** (`*/5 * * * *`, in `apps/krafta-pay/vercel.json`). Tighter than the hourly renewals cron because money has already moved and a customer is waiting on the result page.
- Auth: `Authorization: Bearer <secret>`, resolved from `KRAFTA_PAY_ATMOS_RECONCILE_CRON_SECRET` → `KRAFTA_PAY_RENEWALS_CRON_SECRET` → `KRAFTA_PAY_CRON_SECRET` → `CRON_SECRET`.
- Manual recovery of a single intent (skips the age filter):
  - `GET /api/internal/atmos/reconcile/cron?public_token=<token>`
  - `GET /api/internal/atmos/reconcile/cron?intent_id=<uuid>`
  - Optional sweep tuning: `?older_than_ms=<ms>&limit=<n>`.

### Current gaps (expected)

- Renewal-path stalls where the charge created an Atmos transaction but the post-charge attempt write blipped (transaction id never persisted) are unrecoverable from our records and surface as `skipped_no_transaction_id` for manual review.

## Outbound webhooks

Krafta Pay tells merchant systems what happened. Not needed while Krafta Catalogs was the only client (same database, direct reads); mandatory for every external merchant.

### Tables

- `payments.webhook_endpoints` — merchant-registered URLs. Signing secret is AES-256-GCM under `PAY_CREDENTIALS_SECRET` (encrypted, not hashed — the merchant must be able to reveal it again). `enabled_events = NULL` subscribes to everything including future types. `consecutive_failure_count` drives auto-disable at 20.
- `payments.webhook_deliveries` — one row per `(endpoint, event)`. `(endpoint_id, event_id)` is unique, so a double-fire of a producer enqueues once.

### Producers and consumers

Producers only **enqueue** — never an inline HTTP call. A merchant endpoint that hangs must not stall a payment, and a charge that settled at the provider must never be rolled back because a webhook timed out. `emitWebhookEvent` / `emitSubscriptionEvent` therefore **never throw**; failures are logged under `type=webhook_out` and swallowed.

Delivery runs from `POST|GET /api/internal/webhooks/deliver/cron`, every minute (`* * * * *` in `vercel.json`), batch-bounded.

### Event types

`subscription.created`, `.activated`, `.renewed`, `.payment_failed`, `.recovered`, `.canceled`, `.paused`, `.resumed`.

`activated` / `renewed` / `recovered` all come out of `finalizeInitialPayment` — the prior subscription status is what discriminates them (`incomplete` → activated, `past_due`/`unpaid` → recovered, `active`/`trialing` → renewed). Capture the status **before** flipping it to active.

`subscription.canceled` fires on real cancellation only: immediately for `{immediately: true}`, otherwise from the renewal cron when the period actually elapses. A scheduled cancel deliberately fires nothing — a merchant who revoked on it would cut off a customer who is still paid up.

### Signing

`Krafta-Signature: t=<unix-seconds>,v1=<hex>` where `v1` is HMAC-SHA256 over `${timestamp}.${rawBody}`. Timestamp inside the MAC bounds replay. Same construction as Stripe, so merchants can port a verifier they already know. `verifyWebhookSignature` is exported for both our tests and merchant copy-paste.

Retry backoff: 1m, 5m, 30m, 2h, 6h, 12h, 24h — eight attempts over ~2 days, then `failed`. Operators can replay a single delivery from **Dashboard → Webhooks**.

### Recovery links

`markPaymentFailed` calls `createRecoveryCheckoutSession`, which mints (or reuses) an open `checkout_sessions` row over the failed intent and puts the resulting `payUrl` in the `subscription.payment_failed` payload.

This is what makes the event actionable. Automatic retries recover an empty balance; they can never recover an expired or cancelled card, because they re-charge the same dead token. A link lets the customer pay with a different card.

`selectProviderCreateAttempt` gates on the *session* being open, not on intent status, so a new open session over a `failed` intent is payable as-is. The hosted pay page's terminal-state check is correspondingly `isTerminalStatus(intent) && session.status !== "open"`.

Krafta Pay deliberately does not send the dunning message itself: we do not have the merchant's subscribers' Telegram chat ids (their bot does), and SMS in UZ means a carrier contract and per-message cost. We hand over the link; the merchant sends it.

## Merchant account creation

`createMerchantAccount` (`apps/krafta-pay/src/lib/merchant-account.ts`) creates a `public.organizations` row plus an owner `organization_members` row, with **no** catalog, venue, or storefront.

Previously the only code that inserted an organization was Krafta Catalogs' shop wizard, so signing up for the billing product meant creating a restaurant menu first, and `/signup` simply redirected into the Krafta app. A signed-in user with no org hit a dashboard reading "No organization memberships found for this user" with nothing to click.

Requires a **service-role** client: `organizations` has no INSERT policy for `authenticated`, and the membership row that would authorize it does not exist yet — the bootstrap cycle. `POST /api/dashboard/account` authenticates the user first, then uses admin. Membership insert failure rolls the org back, since an org with no member is invisible, unreachable, and has burned its slug.

No KYB / INN at signup by design: the merchant's own acquirer already ran KYB on them, we are not the merchant of record, and the tax identity fiscalization actually needs is collected on the plan where it is used.

## Hosted customer portal (Stripe-like pattern, current)

Krafta Pay now supports a hosted customer portal model similar to Stripe Customer Portal:

1. Merchant product app calls `POST /api/v1/customer_portal/sessions`
2. Krafta Pay returns a short-lived hosted URL
3. Customer opens hosted portal in Krafta Pay
4. Customer performs self-service billing actions
5. Customer returns to merchant app via `returnUrl`

### Current portal actions

- View subscriptions, invoices, payment methods
- Cancel subscription at period end
- Update payment method (Uzum bind-only flow)
- Update subscription plan
  - `prorationBehavior = none` (immediate switch, no proration invoice)
  - `prorationBehavior = defer_to_period_end` (scheduled in subscription metadata and applied on next successful renewal)

### Uzum payment method update (portal)

For Uzum, payment method update is a **bind-only** action:

- Krafta Pay launches a hosted binding checkout
- Uzum webhook returns a new `bindingId`
- Krafta Pay stores the new `bindingId` in `payments.payment_methods`
- Krafta Pay does **not** run `merchantPay` during this flow

If the portal flow targets a specific subscription, the new payment method is set as that subscription's default.

## Merchant API reference (`/api/v1`) for client apps

This section is the integration starting point for future Krafta Pay clients (merchant apps).

### Authentication

- Use merchant API keys from Krafta Pay Dashboard -> **API Keys**
- Send:
  - `Authorization: Bearer <krp_test_...>` or
  - `Authorization: Bearer <krp_live_...>`

### `GET /api/v1/plans`

Lists active plans for the authenticated merchant organization.

Typical use:

- render pricing cards
- populate billing upgrade plan selector

Current response:

- `{ "plans": [...] }`

Plan item fields (current):

- `id`
- `name`
- `code`
- `amount_minor`
- `currency`
- `interval_count`
- `trial_days`
- `is_active`

### `POST /api/v1/subscriptions/checkout`

Creates (or resumes) a subscription checkout and returns a hosted checkout URL.

Use for:

- first subscription purchase
- retrying failed first payment (Krafta Pay may reuse an existing non-terminal subscription/invoice/payment intent)

Current request shape (typical):

```json
{
  "customerOrgId": "79e8fd14-adca-4772-bd2b-f7fe87747650",
  "planId": "aebbb23f-fb4a-4fef-a1af-5c042f7e0a1b",
  "successUrl": "https://merchant.app/billing?checkout=success",
  "cancelUrl": "https://merchant.app/billing?checkout=cancel",
  "returnUrl": "https://merchant.app/billing?checkout=success",
  "customerRef": {
    "email": "owner@example.com",
    "customerUserRef": "user_123"
  }
}
```

Current response shape:

```json
{
  "subscriptionId": "431cf1d5-78ee-428d-a7c5-4deaa695495b",
  "invoiceId": "c19b8489-8920-4b85-9bbd-4f4ea810f4a0",
  "checkoutSessionId": "....",
  "paymentIntentId": "ccd2f76c-310b-49ca-844a-f282cdc87066",
  "publicToken": "c8ec259ea27895917391f3eea132ab3ee537",
  "payUrl": "https://pay.krafta.uz/pay/<publicToken>"
}
```

### `POST /api/v1/customer_portal/sessions`

Creates a hosted customer portal session and returns a short-lived URL.

Use for:

- “Manage Billing” button in merchant app
- deep-linking into portal workflows (cancel, update payment method, plan update)

Current request shape (typical):

```json
{
  "customerOrgId": "79e8fd14-adca-4772-bd2b-f7fe87747650",
  "customerUserRef": "user_123",
  "returnUrl": "https://merchant.app/billing",
  "flowData": {
    "type": "subscription_update",
    "subscriptionId": "431cf1d5-78ee-428d-a7c5-4deaa695495b"
  }
}
```

Supported `flowData.type` values (current):

- `payment_method_update`
- `subscription_cancel`
- `subscription_update`

Current response shape:

```json
{
  "id": "4b4f0a7b-2e0d-4f6b-9d5a-8f9e7c8a2f10",
  "object": "customer_portal.session",
  "url": "https://pay.krafta.uz/portal/<opaque-session-token>",
  "expiresAt": "2026-02-24T20:15:00.000Z"
}
```

### Hosted URL integration rules (important)

- Open hosted checkout / portal URLs as full-page navigations
- Do not embed in iframe
- Ensure merchant `returnUrl` / `successUrl` / `cancelUrl` are HTTPS in production (required for Uzum flows)

## Dashboards and operator surfaces (Krafta Pay)

### Providers

Use to configure provider credentials and webhook secret for the platform merchant organization.

### Plans

Use to create/edit subscription plans, including fiscalization-related values required by local providers.

### Tax Codes

Use to manage SPIC/package code registries (Uzbekistan-first fiscalization support).

### API Keys

Use to issue API tokens for platform merchants calling Krafta Pay APIs (test/live separation supported by naming/prefix conventions).

### Subscriptions

Use to inspect subscription lifecycle and billing activity:

- subscription status
- plan/customer
- billing period
- invoices
- payment attempts for each invoice

### Logs

Use to inspect payment execution and debugging signals without SQL:

- checkout API actions
- provider requests/responses
- callback page hits
- webhook route processing
- webhook business processing events

### Docs

Use to read this versioned reference inside the Krafta Pay dashboard (`/dashboard/docs`).

Primary audiences:

- operators and support
- product development
- future merchant-client integrations

## `payments.logs` overview

### Purpose

`payments.logs` is the **production operational log table** for billing orchestration and provider integration debugging.

It exists to answer questions such as:

- Did we generate the correct callback URLs?
- Did the provider register request succeed?
- Did the user return to the callback page?
- Did the provider webhook reach Krafta Pay?
- Did signature verification pass?
- Did `merchantPay` run after binding and what was the result?

### What logs are *not* for

- Long-term analytics (use event tables/warehouse)
- Secrets storage
- Replacing core payment records (`payment_intents`, `payment_attempts`, `invoices`, `subscriptions`)

### Security and redaction

Logs are **best-effort** and **safe for debugging**:

- API credentials are **not** written to logs
- Sensitive fields like `bindingId` and `cvc` are redacted in provider payload logs
- Webhook secrets are not logged

## `payments.logs` schema reference

Each row contains the following fields (current schema):

### `id` (bigint)

Monotonic log row identifier. Useful for ordering and pagination.

### `created_at` (timestamptz)

Timestamp when the log row was written.

### `environment` (text nullable)

Current pay environment from `PAY_ENV` (typically `test` or `live`).

### `level` (text)

Log severity. Current values used:

- `info`
- `warn`
- `error`

### `type` (text)

Log stream category (operational domain). Examples:

- `checkout_api`
- `uzum`
- `callback_page`
- `webhook_route`
- `webhook`
- `cron`
- `customer_portal`

### `event` (text)

Specific event name within the `type` stream.

Example: `type=uzum`, `event=register.request`

### `provider_id` (text nullable)

Provider identifier, typically `uzum` for current flows.

### `org_id` (uuid nullable)

Organization context when available.

Note: some logs do not include `org_id` directly and are instead correlated through `public_token` or payment IDs.

### `checkout_session_id` (uuid nullable)

Internal Krafta Pay checkout session ID, when available.

### `payment_intent_id` (uuid nullable)

Internal payment intent ID associated with the operation.

### `payment_attempt_id` (uuid nullable)

Internal payment attempt ID associated with the operation.

### `public_token` (text nullable)

Hosted checkout public token (`/pay/[public_token]`). This is the most useful field for tracing a single checkout.

### `data` (jsonb)

Structured event payload. Shape varies by `type` + `event`.

This is where request/response metadata and diagnostic fields are stored.

## How to debug a checkout using logs

### Recommended query sequence (in UI or SQL)

1. Start with `public_token`
2. Filter `type=checkout_api` and `type=uzum`
3. Confirm callback page hit (`type=callback_page`)
4. Confirm webhook route hit (`type=webhook_route`)
5. Confirm webhook business processing (`type=webhook`)
6. Check `merchant_pay` request/response and final result

### Normal successful bind-then-charge sequence (Uzum)

Expected event chain (approximate):

- `checkout_api.select_provider.request`
- `uzum.register.request`
- `uzum.register.response`
- `checkout_api.select_provider.success`
- `callback_page.success.hit` (browser return)
- `webhook_route.request`
- `webhook.received`
- `webhook.signature_verified` (or skipped if unsigned allowed in test)
- `uzum.merchant_pay.request`
- `uzum.merchant_pay.response`
- `webhook.binding_charge_result`
- `webhook.processed`
- `webhook_route.success`

If callback page events exist but webhook events do not, the most likely issue is provider webhook delivery/configuration, not callback URL generation.

## Logs event reference (current implementation)

This section documents the events currently emitted by Krafta Pay and `@krafta/payments-core`.

---

## `type=checkout_api`

### `event=select_provider.request`

Written when the hosted checkout provider selection endpoint is called.

Purpose:

- proves the frontend clicked a provider
- captures request mode and deployment URL context used to build provider callbacks

Current `data` fields:

- `requestedViewType` (string): requested provider view mode (`WEB_VIEW`, `REDIRECT`, `IFRAME`)
- `payBaseUrl` (string): `PAY_BASE_URL` used to generate provider callback URLs
- `environment` (string): pay environment (`test` or `live`)

### `event=select_provider.success`

Written after provider attempt creation succeeds.

Purpose:

- confirms attempt creation succeeded and frontend can continue

Current `data` fields:

- `attemptId` (string|null): internal `payment_attempts.id`
- `hasRedirectUrl` (boolean): whether provider returned a redirect URL for the client

### `event=select_provider.error`

Written when provider attempt creation fails.

Purpose:

- preserves failure reason even if API caller only sees a generic error

Current `data` fields:

- `error` (string): thrown error message / code

---

## `type=callback_page`

### `event=success.hit`

Written when the user lands on Krafta Pay success callback page (`/pay/[public_token]/success`).

Purpose:

- proves browser callback succeeded
- captures where Krafta Pay intends to redirect the user next

Current `data` fields:

- `merchantSuccessUrl` (string|null): session `success_url`
- `merchantCancelUrl` (string|null): session `cancel_url`
- `merchantReturnUrl` (string|null): session `return_url`

### `event=failure.hit`

Written when the user lands on Krafta Pay failure callback page (`/pay/[public_token]/failure`).

Purpose:

- proves browser failure callback succeeded
- captures return targets for UI recovery flow

Current `data` fields:

- `merchantSuccessUrl` (string|null)
- `merchantCancelUrl` (string|null)
- `merchantReturnUrl` (string|null)

---

## `type=webhook_route`

These events are emitted by the Next.js route handler for `/api/webhooks/[provider]`.

### `event=request`

Written at the start of webhook route handling, before provider-specific processing.

Purpose:

- proves request reached Krafta Pay HTTP endpoint
- helps distinguish delivery issues vs downstream processing issues

Current `data` fields:

- `environment` (string): `PAY_ENV`
- `bodySize` (number): raw request body length

### `event=success`

Written after webhook request is processed successfully by the route handler.

Purpose:

- confirms route-level completion
- does **not** replace business processing details (`type=webhook`)

Current `data` fields:

- `ok` (boolean): always `true`

### `event=error`

Written when route handling fails and returns an error response.

Purpose:

- captures route-level failures (invalid provider, thrown processing error, etc.)

Current `data` fields:

- `error` (string): thrown error message / code

---

## `type=webhook`

These events are emitted by the provider-agnostic webhook processing logic in `@krafta/payments-core`.

### `event=received`

Written after payload parse and before idempotency/provider verification.

Purpose:

- stores normalized provider event identifiers used in matching and debugging

Current `data` fields:

- `eventType` (string): normalized event label (for Uzum often `operationState:<STATE>`)
- `providerEventId` (string|null): provider event id if present
- `providerPaymentId` (string|null): provider payment/order id if present
- `signatureHeaderPresent` (boolean): whether a signature header was present

### `event=signature_verified`

Written after successful provider signature verification (currently Uzum path).

Purpose:

- proves signature validation passed (or equivalent validation step completed)

Current `data` fields:

- `providerPaymentId` (string|null): matched provider payment/order id

### `event=binding_charge_result`

Written after Krafta Pay attempts the post-binding charge (`merchantPay`) in the Uzum binding-first flow.

Purpose:

- records the result of the critical bind -> charge transition

Current `data` fields:

- `bindingProviderPaymentId` (string|null): provider payment id from binding stage webhook
- `chargeProviderPaymentId` (string|null): provider payment id returned by charge call (may differ)
- `chargeStatus` (string): `succeeded` | `processing` | `failed`

### `event=processed`

Written after webhook business processing completes successfully.

Purpose:

- marks logical processing completion (separate from HTTP route success)

Current `data` fields:

- `eventType` (string): normalized provider event type
- `providerPaymentId` (string|null): provider payment/order id

### `event=processing_error`

Written when business processing fails after the raw event is stored.

Purpose:

- captures reconciliation/transition failures while preserving the raw event record

Current `data` fields:

- `eventType` (string)
- `providerPaymentId` (string|null)
- `error` (string): processing failure reason

---

## `type=uzum`

These events are emitted by the Uzum provider adapter in `@krafta/payments-core`.

### `event=register.request`

Written before calling Uzum `payment/register` for hosted checkout setup (binding-first in current checkout flow).

Purpose:

- preserves exact request payload sent to Uzum (redacted)
- confirms generated callback URLs

Current `data` fields:

- `url` (string): Uzum register endpoint URL
- `callbackUrls` (object):
  - `successUrl` (string)
  - `failureUrl` (string)
- `request` (object, redacted): outgoing register payload

Important nested request fields commonly inspected:

- `viewType`
- `paymentParams.payType`
- `paymentParams.operationType`
- `merchantParams.cart`
- `successUrl`
- `failureUrl`

### `event=register.response`

Written after Uzum `payment/register` returns.

Purpose:

- captures Uzum status and response body
- confirms presence of `paymentRedirectUrl` / provider `orderId`

Current `data` fields:

- `httpStatus` (number)
- `response` (object|null, redacted): Uzum response body

### `event=merchant_pay.request`

Written before calling Uzum `merchantPay` for off-session or post-binding charge.

Purpose:

- records the charge request (redacted)
- essential for debugging binding-first completion failures

Current `data` fields:

- `url` (string): Uzum merchantPay endpoint URL
- `request` (object, redacted): outgoing merchantPay payload

Important nested request fields commonly inspected:

- `orderId`
- `orderNumber`
- `amount`
- `currency`
- `processData.type`
- `processData.bindingId` (redacted)
- `merchantParams.cart`

### `event=merchant_pay.response`

Written after Uzum `merchantPay` returns.

Purpose:

- captures charge outcome and provider response for reconciliation

Current `data` fields:

- `httpStatus` (number)
- `response` (object|null, redacted): Uzum response body

### `event=merchant_pay.register_for_order.response`

Written only in the recurring charge path when Krafta Pay first calls `payment/register` to obtain an `orderId` before calling `merchantPay`.

Purpose:

- documents the preliminary register step used for some merchantPay flows

Current `data` fields:

- `url` (string): Uzum register endpoint
- `request` (object, redacted): register payload used for order creation
- `httpStatus` (number)
- `response` (object|null, redacted): Uzum response body

---

## `type=customer_portal`

These events are emitted by the hosted customer portal APIs and actions.

### `event=session.created`

Written when `POST /api/v1/customer_portal/sessions` succeeds.

Purpose:

- traces merchant app portal session creation
- records customer/subscription/flow context

Current `data` fields:

- `customerId`
- `customerOrgId`
- `flowType`
- `subscriptionId`
- `portalSessionId`
- `expiresAt`

### `event=payment_method.update_started`

Written when the portal starts a Uzum bind-only payment method update flow.

Purpose:

- traces portal action -> hosted checkout handoff
- provides correlation keys for webhook follow-up

Current `data` fields:

- `portalSessionId`
- `customerId`
- `subscriptionId` (nullable)
- `providerId`
- `checkoutPublicToken`
- `paymentIntentId`
- `paymentAttemptId`

---

## `type=cron`

Renewal scheduler and reconciler execution logs.

Current events (implemented):

- `renewals_cron.run`
- `renewals_cron.error`
- `atmos_reconcile_cron.run` — one entry per reconcile sweep, with `result.{scanned,succeeded,failed,stillProcessing,skipped,errors}`
- `atmos_reconcile_cron.error` — route-level failure (bad auth, unexpected throw)
- `atmos_reconcile.reconciled_succeeded` — a stuck intent confirmed succeeded at Atmos and finalized (carries `transactionId`)
- `atmos_reconcile.reconciled_failed` — a stuck intent confirmed failed at Atmos and marked failed
- `atmos_reconcile.skipped_no_transaction_id` — no resolvable Atmos transaction id; left for manual review (never auto-failed)
- `atmos_reconcile.lookup_error` — Atmos `/merchant/pay/get` threw for that intent

Additional useful future events:

- `renewals.start`
- `renewals.success`
- `renewals.error`
- `renewals.subscription_attempt`

## Correlation strategy (how to trace a problem)

### Best primary key: `public_token`

For hosted checkout issues, `public_token` is the easiest and most reliable correlation key.

### Secondary keys

Use when `public_token` is missing or not known:

- `payment_intent_id`
- `payment_attempt_id`
- provider `orderId` / `provider_payment_id`

### Related source-of-truth tables

Logs explain what happened; these tables define the actual billing state:

- `payments.checkout_sessions`
- `payments.payment_intents`
- `payments.payment_attempts`
- `payments.invoices`
- `payments.subscriptions`
- `payments.payment_events`

## Common failure patterns and how to interpret logs

### Browser callback works, webhook missing

Symptoms:

- `callback_page.success.hit` exists
- no `webhook_route.request`

Likely cause:

- provider webhook not configured / not sent for this environment or flow

### Webhook hits route but fails validation

Symptoms:

- `webhook_route.request`
- `webhook_route.error`
- no `webhook.signature_verified`

Likely cause:

- wrong webhook secret
- missing signature header
- test environment unsigned webhook while strict verification is enabled

### Binding succeeds but charge fails

Symptoms:

- `webhook.signature_verified`
- `uzum.merchant_pay.request`
- `uzum.merchant_pay.response`
- `webhook.binding_charge_result` with `chargeStatus=failed`

Likely cause:

- provider-side validation/business rule error
- fiscalization payload issue
- unsupported package code / tax configuration

### "Manage Billing" button fails in merchant app

Symptoms:

- merchant billing page shows an error instead of opening hosted portal

Likely causes:

- merchant app cannot reach `KRAFTA_PAY_URL`
- missing/invalid `KRAFTA_PAY_API_KEY` in merchant runtime
- `POST /api/v1/customer_portal/sessions` returns auth or customer lookup error
- `returnUrl` origin rejected by Krafta Pay portal session validation

## Current implementation status (snapshot)

### Done

- Standalone merchant accounts (org creation without a Krafta catalog)
- Merchant-scoped customer identity (`external_id`) + `/api/v1/customers`
- Per-key test/live environments coexisting on one deployment
- Subscriptions REST API: list, retrieve, cancel, pause, resume
- Outbound webhooks: signed delivery, backoff, auto-disable, dashboard + replay
- Recovery checkout links on `subscription.payment_failed`
- Recovery-first dashboard metrics (recovered revenue, MRR, active, churn)
- Merchant API reference at `docs/krafta-pay-api.md`, served at `/dashboard/docs`
- Hosted checkout orchestration (Krafta -> Krafta Pay)
- Uzum binding-first flow registration
- Browser callback pages (`success` / `failure`)
- Webhook processing pipeline with idempotent raw event storage
- Post-binding charge attempt (`merchantPay`)
- Renewal cron endpoint and runner wrapper (`/api/internal/renewals/cron`)
- Hosted customer portal (session API + hosted portal UI)
- Portal actions: cancel at period end, Uzum payment method update (bind-only), subscription plan update (immediate/scheduled)
- Portal audit events (`payments.customer_portal_events`)
- Logs table + logs dashboard
- Subscriptions dashboard with invoices and attempts

### Known gaps (deliberate, not forgotten)

- **Payme and Click adapters are `throw` stubs.** The pitch names four providers; two exist. Building the other two is weeks of work ahead of a customer asking for them with money — do it when one does.
- **Trials are decorative.** `plans.trial_days` is written into subscription metadata and never read: the first invoice is created at full amount with `due_at = now`. Real trials need a `trialing` state, a deferred first invoice, and trial-end conversion.
- **No rate limiting on `/api/v1`.**
- **One org per user** from `POST /api/dashboard/account`. Multi-business merchants need an org switcher and invites first.
- **Churn is computed over a rolling window** from `canceled_at`, not a cohort. Directionally right, not an accounting figure.

### Pending / next hardening steps

- Provider webhook delivery confirmation for all test/prod merchant setups
- Expanded logs filters (date range, payment intent, attempt id)
- Docs page deep links from subscription/checkout views into logs
- Stronger operator runbooks for webhook replay and renewal retries
- Public API versioning/changelog and formal error code reference for merchant clients

## Change management note

This document reflects the **current implementation** and should be updated when any of the following change:

- provider event names
- log event names or payload shape
- checkout flow steps
- subscription state transitions
- fiscalization schema/requirements
