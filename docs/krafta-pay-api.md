# Krafta Pay API

Subscription billing for Uzbekistan. You connect your own Atmos or Uzum account, we run the subscription logic, and money moves directly from your customer to you — we never hold it.

This is the integration guide. For internal operations, log taxonomy, and provider debugging, see the [platform reference](./krafta-pay-platform-reference.md).

---

## The shortest path to a first charge

```
1. Connect a provider      Dashboard → Providers → Atmos (consumer key, secret, store id)
2. Create a plan           Dashboard → Plans (amount, currency, interval)
3. Get an API key          Dashboard → API keys → Create test key
4. Create a checkout       POST /api/v1/subscriptions/checkout
5. Send the customer       Open the returned payUrl
6. Listen                  Dashboard → Webhooks → add your endpoint
```

Steps 4–6 are the only code you write.

---

## Base URL and authentication

```
https://pay.krafta.uz
```

Every request carries a bearer key from **Dashboard → API keys**:

```
Authorization: Bearer krp_test_...
Authorization: Bearer krp_live_...
```

The key *is* the environment. A `krp_test_` key sees only test data and charges only against your test provider account; a `krp_live_` key sees only live data. Both work against the same base URL at the same time — you can run your test integration while production keeps billing. Objects never cross the boundary: a test customer is invisible to a live key, and vice versa.

Plans are the exception. They are shared between modes, so you do not have to re-create your pricing to test against it.

### Errors

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "parameter_missing",
    "message": "Provide `customer.externalId` (your own id for this subscriber) or `customerOrgId`."
  }
}
```

| Type | Status | Meaning |
|---|---|---|
| `authentication_error` | 401 | Missing, malformed, or revoked key |
| `invalid_request_error` | 400 | Bad or missing parameter |
| `not_found_error` | 404 | No such object on your account |
| `invalid_state_error` | 409 | The object exists but cannot do that right now |
| `api_error` | 500 | Our fault. The request did not complete |

---

## Customers

A customer is identified by **your own id** — `externalId`. A Telegram user id, your internal user uuid, a student number, a membership number: whatever your database already uses. You never have to store ours.

### `POST /api/v1/customers`

Idempotent on `externalId`. Calling it twice returns the same customer, so it is safe to call on every login without tracking whether you already did.

```bash
curl -X POST https://pay.krafta.uz/api/v1/customers \
  -H "Authorization: Bearer krp_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "tg_884213",
    "email": "customer@example.uz",
    "phone": "+998901234567",
    "metadata": {"channel": "@my_paid_channel"}
  }'
```

```json
{
  "id": "7a708975-c46d-4ea6-b382-4b831d420778",
  "object": "customer",
  "externalId": "tg_884213",
  "email": "customer@example.uz",
  "phone": "+998901234567",
  "metadata": {"channel": "@my_paid_channel"},
  "livemode": false,
  "created": "2026-08-03T08:28:41.934Z"
}
```

`201` on create, `200` when it already existed.

### `GET /api/v1/customers`

`?externalId=` to look one up, `?limit=` (default 25, max 100) to page.

### `PATCH /api/v1/customers`

Addressed by `externalId`. Send `email`, `phone`, or `metadata`.

---

## Plans

### `GET /api/v1/plans`

Lists your active plans. Use it to render pricing rather than hard-coding amounts, so a price change in the dashboard reaches your app without a deploy.

```json
{
  "plans": [{
    "id": "79c0468b-cfd9-47ab-b1ea-703e828015fc",
    "code": "pro",
    "name": "Pro",
    "amount_minor": 25000000,
    "currency": "UZS",
    "interval_count": 1,
    "trial_days": 0,
    "is_active": true
  }]
}
```

> **Amounts are always in minor units.** `25000000` is 250,000 UZS. This holds for UZS too, which has no circulating subunit — the convention is uniform across every currency so no code has to special-case one.

---

## Subscriptions

### `POST /api/v1/subscriptions/checkout`

Creates a subscription and returns a hosted page where the customer enters their card.

```bash
curl -X POST https://pay.krafta.uz/api/v1/subscriptions/checkout \
  -H "Authorization: Bearer krp_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "79c0468b-cfd9-47ab-b1ea-703e828015fc",
    "customer": {"externalId": "tg_884213", "email": "customer@example.uz"},
    "successUrl": "https://yourapp.uz/billing?ok=1",
    "cancelUrl": "https://yourapp.uz/billing"
  }'
```

```json
{
  "subscriptionId": "85728276-71e5-4b36-9c0a-8fbca8107f3f",
  "invoiceId": "9f73a5bb-5044-4f14-9e5e-235a6738bde2",
  "checkoutSessionId": "a75a68d4-5582-4638-8fe8-b2065e72f41a",
  "paymentIntentId": "e32cea9e-eba9-42cf-a8a7-aa13cfb726b7",
  "publicToken": "2a0b73e8181b7f598ce641d3933e902a2dda",
  "payUrl": "https://pay.krafta.uz/pay/2a0b73e8181b7f598ce641d3933e902a2dda",
  "livemode": false
}
```

**Send the customer to `payUrl` as a full-page navigation.** Not an iframe — the card and OTP steps break inside one, and providers reject framed origins.

Calling this again for the same customer and plan while their subscription is still unpaid **resumes** the existing one instead of creating a second. A double-tapped Pay button costs you nothing.

The card is saved for renewals as part of the same flow. There is no separate "save card" call.

### `GET /api/v1/subscriptions`

| Query | Example |
|---|---|
| `status` | `?status=past_due,unpaid` — comma-separated |
| `customerExternalId` | `?customerExternalId=tg_884213` |
| `planId` | `?planId=79c0468b-...` |
| `limit` | `?limit=50` (max 100) |

An unknown `customerExternalId` returns an empty list, not an error — "does this user have a subscription?" answers cleanly either way.

This is your reconciliation endpoint. If your webhook handler was down for an afternoon, this is how you work out who should still have access.

### `GET /api/v1/subscriptions/{id}`

The subscription with its plan, customer, and last 12 invoices inlined.

### `POST /api/v1/subscriptions/{id}/cancel`

```json
{"immediately": false}
```

Default cancels **at period end** — the customer paid for this period, and taking it away immediately is a refund request waiting to happen. Their access continues, and `subscription.canceled` fires when the period actually elapses.

`{"immediately": true}` cancels on the spot and fires the event right away. Use it for fraud, duplicate signups, and support calls.

### `POST /api/v1/subscriptions/{id}/pause`

Stops billing, keeps the subscription and the saved card. Valid from `active`, `trialing`, or `past_due`.

The alternative is cancel-and-resubscribe, which throws away the card token — so the customer has to re-enter their card and pass OTP again to come back. That is the most expensive step in your funnel to make someone repeat. Gyms, schools, and seasonal businesses hit this constantly.

### `POST /api/v1/subscriptions/{id}/resume`

```json
{"billingAnchor": "now"}
```

Restores the status the subscription had when it was paused — a subscription paused while `past_due` comes back `past_due` and still owes that invoice. `billingAnchor: "now"` moves the next charge to a full interval from resume, so someone who paused for three months is not billed the second they return. Omit it to keep the original anchor.

Also clears a scheduled cancel on a subscription that has not lapsed yet.

### Statuses

| Status | What it means for access |
|---|---|
| `incomplete` | Created, first payment not collected. **No access yet.** |
| `trialing` | In trial. Access on. |
| `active` | Paid and current. Access on. |
| `past_due` | A charge failed and dunning is running. Your call — most keep access during retries. |
| `paused` | Billing suspended, card kept. Usually access off. |
| `unpaid` | Dunning exhausted. Access off. |
| `canceled` | Over. Access off. |
| `incomplete_expired` | First payment never succeeded. No access. |

---

## Payments (one-off)

A single charge, not a subscription. Create one with `POST /api/checkout_sessions`
and send the customer to the `payUrl` it returns; the `paymentIntentId` from that
response is the `id` used below.

### `GET /v1/payments`

Filters: `status`, `orderId`, `limit`.

```
GET /api/v1/payments?status=succeeded&limit=25
Authorization: Bearer krp_live_...
```

```json
{
  "object": "list",
  "data": [
    {
      "object": "payment",
      "id": "pi_...",
      "status": "succeeded",
      "amountMinor": 25000000,
      "currency": "UZS",
      "description": "Tuition, August",
      "orderId": "ORD-42",
      "providerId": "uzum",
      "providerPaymentId": "254179",
      "createdAt": "2026-08-04T09:00:00.000Z",
      "settledAt": "2026-08-04T09:05:00.000Z",
      "metadata": { "cartId": "c-9" },
      "livemode": true
    }
  ],
  "hasMore": false
}
```

### `GET /v1/payments/{id}`

Same object, or `404 payment_not_found`. A payment belonging to another merchant
returns 404 rather than 403 — the alternative is an oracle over other people's
ids. A subscription charge also returns 404 here; use `/v1/subscriptions`, which
carries the invoice and period context this shape has nowhere to put.

**Together with webhooks.** `payment.succeeded` tells you the moment it happens;
this tells you what you missed. A handler that was down for an afternoon
reconciles by listing `?status=succeeded` and matching on `orderId`.

**`metadata` is what you sent**, minus a few keys Krafta Pay writes into the same
field for its own bookkeeping (`subscription_id`, `invoice_id`, `purpose`,
`uzumCart`, and the portal keys). Avoid those names if you need them round-tripped.

**Scoping.** Every read is scoped to the key's organisation *and* environment. A
`krp_test_` key cannot see live payments and vice versa. Note that payments
created before 2026-08-03 predate the environment column and all read as `live`.

## Webhooks

Register endpoints under **Dashboard → Webhooks**. Without one, your app has to poll to learn about renewals — and a renewal that lands at 3am while nobody polls is a customer whose access you silently revoked.

### Events

| Event | Fires when | Typical action |
|---|---|---|
| `subscription.created` | Checkout created, not yet paid | Nothing — wait for activation |
| `subscription.activated` | First payment succeeded | **Grant access** |
| `subscription.renewed` | A renewal charge succeeded | Extend access |
| `subscription.payment_failed` | A charge failed | Message the customer with `payUrl` |
| `subscription.recovered` | A failing subscription got paid | **Restore access** |
| `subscription.canceled` | Billing ended for real | Revoke access |
| `subscription.paused` | Billing suspended | Suspend access |
| `subscription.resumed` | Billing resumed | Restore access |
| `payment.succeeded` | A one-off payment settled | **Release the order** |
| `payment.failed` | A one-off payment was declined | Tell the customer; `data.payUrl` may still work |

**`payment.*` fires for one-off payments only.** A subscription charge produces
`subscription.activated` / `subscription.renewed` / `subscription.payment_failed`
instead, never both — otherwise one event would arrive twice under two names and
you would release the same thing twice.

A one-off payload carries the two things you need to act on it:

```json
{
  "id": "evt_...",
  "type": "payment.succeeded",
  "livemode": true,
  "data": {
    "payment": {
      "id": "pi_...",
      "status": "succeeded",
      "amountMinor": 25000000,
      "currency": "UZS",
      "description": "Tuition, August",
      "orderId": "ORD-42",
      "providerId": "uzum",
      "providerPaymentId": "254179",
      "settledAt": "2026-08-04T09:05:00.000Z"
    },
    "customer": null,
    "metadata": { "cartId": "c-9" },
    "payUrl": null
  }
}
```

`orderId` and `metadata` are yours — whatever you sent to
`POST /api/checkout_sessions` comes back untouched, minus a handful of keys
Krafta Pay writes into the same field for its own bookkeeping. They are your
correlation handle; nothing else in the payload is stable enough to key on.

`amountMinor` is major units × 100 for **every** currency, UZS included:
25000000 is 250,000 UZS.

Delivery is at-least-once, so a decline that is retried and declines again
produces two `payment.failed` events. Dedupe on the top-level `id`.

Subscribe to none and you get all of them, including events added later.

### Payload

```json
{
  "id": "294a02e5-ca10-4eb1-a883-9dba305ae87b",
  "object": "event",
  "type": "subscription.payment_failed",
  "created": "2026-08-03T08:30:21.715Z",
  "livemode": true,
  "data": {
    "subscription": {
      "id": "fad06df8-cf21-4f6d-b500-1113c11060a2",
      "status": "past_due",
      "currentPeriodStart": "2026-08-03T08:30:19.899Z",
      "currentPeriodEnd": "2026-09-03T08:30:19.899Z",
      "cancelAtPeriodEnd": false,
      "canceledAt": null
    },
    "plan": {"id": "...", "code": "pro", "name": "Pro", "amountMinor": 25000000, "currency": "UZS", "interval": "month", "intervalCount": 1},
    "customer": {"id": "...", "externalId": "tg_884213", "email": "customer@example.uz", "phone": null},
    "invoice": {"id": "...", "amountDueMinor": 25000000, "currency": "UZS", "status": "open", "attemptCount": 1, "dueAt": "2026-08-06T08:32:38.055Z"},
    "payUrl": "https://pay.krafta.uz/pay/f66312e6bb515a9dcb8c6b7f164b3b863569",
    "attemptCount": 1,
    "nextRetryAt": "2026-08-06T08:32:38.055Z",
    "dunningExhausted": false
  }
}
```

`data.customer.externalId` is your own id. For most handlers it is the only field you need — it is the key straight into your user table.

### Verifying the signature

Every request carries:

```
Krafta-Signature: t=1785000000,v1=5257a869e7ecebeda32affa62cdca3fa...
Krafta-Event-Id: 294a02e5-ca10-4eb1-a883-9dba305ae87b
Krafta-Event-Type: subscription.payment_failed
Krafta-Delivery-Attempt: 1
```

`v1` is HMAC-SHA256 of `{timestamp}.{raw request body}` under your endpoint's signing secret (**Dashboard → Webhooks → Signing secret**). The timestamp is inside the MAC, so a captured request cannot be replayed under a fresh one.

```js
import crypto from "node:crypto";

function verify(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((c) => c.split("=")));
  const timestamp = Number(parts.t);

  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Verify against the **raw body bytes**, before any JSON parsing. Re-serializing changes the bytes and the signature will not match.

### Delivery

Return any `2xx` within 10 seconds. Anything else is a failure and we retry after 1m, 5m, 30m, 2h, 6h, 12h, then 24h — eight attempts across about two days. An endpoint that fails 20 times in a row is auto-disabled; re-enable it in the dashboard once it is fixed, and replay individual events from the deliveries table.

**Be idempotent on `id`.** Delivery is at-least-once: if your `200` never reaches us, you will see that event again.

Do your work asynchronously. Acknowledge first, process after — a handler that charges through your own slow database will time out and get retried while the first run is still going.

---

## Recovering failed payments

Failed renewals are the single largest recoverable loss in Uzbek subscription businesses. Uzcard and Humo are debit cards: balances run to zero between salary days, and a charge that fails on the 1st often succeeds on the 5th.

Krafta Pay retries automatically at **+3 days, +7 days, +14 days**, then marks the invoice `uncollectible` and the subscription `past_due` rather than hammering a dead card forever.

Where you come in: `subscription.payment_failed` carries a `payUrl`. It is a live hosted page where the customer can pay the outstanding invoice **with a different card**, which is the case automatic retries can never fix — an expired or cancelled card will decline on every retry.

Krafta Pay deliberately does not send that message for you. We do not have your subscribers' Telegram chat ids; your bot does. And SMS in Uzbekistan means a carrier contract and a per-message cost. So we hand you the link and you send it, on your channel, in your voice:

```js
if (event.type === "subscription.payment_failed") {
  const { customer, payUrl, attemptCount, nextRetryAt, dunningExhausted } = event.data;

  await bot.sendMessage(customer.externalId, {
    text: dunningExhausted
      ? `Your subscription is on hold — the last payment didn't go through.`
      : `We couldn't charge your card. We'll try again automatically, or you can pay now.`,
    reply_markup: { inline_keyboard: [[{ text: "Pay now", url: payUrl }]] },
  });
}
```

When they pay, `subscription.recovered` fires and you turn access back on.

The dashboard tracks what this earned you: **Overview → Recovered revenue** is money collected on charges that failed at least once, alongside the recovery rate.

---

## Providers

| Provider | Status | Card capture |
|---|---|---|
| **Atmos** | Supported | Inline on the hosted page, synchronous settlement |
| **Uzum** | Supported | Redirect, bind-then-charge |
| Payme | On request | — |
| Click | On request | — |

You bring your own merchant credentials, entered under **Dashboard → Providers** and stored encrypted. Funds settle straight from your customer into your own provider account. Krafta Pay never holds, routes, or settles money — we only orchestrate the schedule and the retries.

Payme and Click are not built yet. If you need one, tell us which and we will prioritise it — we would rather build against a real integration than guess.

---

## Test mode

Test and live keys work against the same base URL simultaneously. Create a `krp_test_` key, connect a test provider account under **Providers**, and integrate. Nothing you do in test touches live data or charges a real card. When you are ready, swap the key.

Rate limits are not enforced yet. Do not treat that as a licence to poll.
