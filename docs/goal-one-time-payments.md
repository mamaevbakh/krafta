# Goal — one-time payments, for merchants with a backend and without one

*Set 2026-08-04. Owner: founder. Status: in progress.*
*Twelve tracked items. ~75 engineer-hours. Nothing here is a feature; it is the
set of things that have to be true before either named merchant can be told yes.*

## What "done" means

A merchant can take a single card payment and know it happened — whether or not
they have an engineer.

Two shapes, both first-class. Neither is a subset of the other.

| | **No tech** (Galaktika shape) | **With tech** (Kinza shape) |
|---|---|---|
| Creates a payment | Dashboard form | `POST` from their backend |
| Sends the link | By hand, over Telegram | Their app opens it |
| Learns it was paid | **Sees it in the dashboard** | **Outbound webhook** |
| Correlates to their order | Doesn't need to | `orderId` + `metadata` round-trip |
| Retries safely | N/A | Idempotency key |

## Why now

- **Galaktika Learning Center** — language school, ~40 students, collects tuition
  manually today, no engineer. Needs links plus a place to watch them. The only
  **external** merchant. Their Atmos application is still not submitted.
- **Kinza** — food delivery, Medusa backend + Expo app, will use **Uzum**, wants
  Payme/Click/Octo after. The founder's own project, so it is a forcing function
  for the API rather than external validation.

## Order of work

Ordered by what unblocks a merchant soonest, with the traps that must land
alongside each. Effort is the design estimate; corrections from review are on top.

### First — the no-tech merchant can use this at all

1. **B3** — translate the subscriptions and customers dashboard pages *(2h)*.
   Goes first only because **N1 was designed as a structural clone of them**, and
   they are hardcoded English in violation of CLAUDE.md. Fix, or N1 must diverge.
2. **N1 + N2** — the **Payments page** *(9h)*. The stated blocker: a merchant can
   create a link today and has nowhere to see whether it was paid. Move the
   create form off the overview onto it.
   - Review corrections that must land with it: the list may **not** be keyed on
     `metadata.subscription_id` (merchant-writable — any merchant setting that
     field vanishes from their own list); `metadata` must be explicitly picked,
     not spread, or every row ships the demo fiscal cart (`TIN 123456789`) to the
     browser; **DESIGN.md §206 requires 375px-first** and the seven-column table
     violates it — Galaktika checks "did they pay" from a phone.

### Second — the merchant with a backend can integrate

3. **T1** — `payment.succeeded` / `payment.failed` outbound webhooks *(7h)*.
   What unblocks Kinza. Reuses the whole existing delivery, retry, signing and
   dedupe stack. Correction: the failure guard must not be gated on a pre-read of
   intent status — that holds for Atmos and is **false for Uzum**, so every retry
   decline after the first would be swallowed silently.
4. **T3** — authenticated `GET /api/v1/payments` + retrieve *(8h)*. Must route
   through `src/lib/v1.ts`; CLAUDE.md calls it the tenancy boundary. The existing
   unauthenticated status endpoint stays public (the hosted pay page polls it) —
   record that as the one deliberate exception to the org+env rule.
5. **T2** — Idempotency-Key on create, and customer-row upsert *(11h)*. The
   duplicate-`orderId` cross-wire is **gone** — order numbers now key to the
   attempt. Correction: no stale-claim reclaim window; the proposed 90-second
   version recreates the exact duplicate the feature exists to prevent.
6. **T4** — document all of it *(3h)*. `docs/krafta-pay-api.md` still opens with
   "Subscription billing for Uzbekistan".

### Third — reliability. Hold until the above ships

7. **N4 + R1** — one-off retry, and a Uzum reconciler *(18h)*. The biggest item
   and the one carrying both money traps. A reviewer showed its Phase 1 does not
   fix the case the brief describes. Do not start this before N1 and T1.
8. **N3** — Uzum one-off must not bind the card *(8h)*. **Blocked on Uzum**, see
   below. Today every one-off tokenizes the customer's card and issues a second
   Uzum order to charge it.

### Standing bugs, fix opportunistically

9. **B1** — `MarkFailedInput` has no `attemptId`, so a declined attempt stays
   `requires_action`. Carries a money trap: see below.
10. **B2** — `resolvePayEnvironment` and `defaultPayEnvironment` have opposite
    defaults, and the internal checkout route uses one for the provider lookup
    and the other for the session.
11. **B4** — every payment row created before 2026-08-03 reads
    `environment = 'live'` regardless of truth.
12. **#8** — did Uzum charges ever succeed? Order numbers were over-length on the
    two calls that move money. Query `payments.logs` for `2000` / ValidationError.

## Money traps — read before touching the Uzum failure path

Both were caught in design review rather than in production, and both would have
shipped as "paid without charging":

- Writing `payment_attempts.status = 'failed'` flips `isBindingSetupAttempt`
  false (`webhook.ts:162-164`), so a later Uzum **SUCCESS** callback takes the
  `else` branch at `:376` and calls `finalizeInitialPayment` **directly, with no
  merchantPay**. B1 cannot be fixed without also fixing that branch.
- A reconciler that queries the **binding** order first and maps `COMPLETED` to
  finalize does the same thing. The binding order is registered TWO_STEP for the
  full amount, so it looks settled when no money moved.

## Blocked on Uzum — one message, five questions

N3 cannot start without Q1. R1's design depends on Q4.

1. For a one-time purchase we do not want to store the card. What
   `operationType` / `payType` should the register use instead of
   `TWO_STEP` / `BINDING`?
2. For that non-binding payment, **what does the inbound callback look like** —
   do you POST at all, does it carry `operationState: SUCCESS`, and is it the
   same `orderId`? *(Every direct-flow settlement depends on this answer.)*
3. Is there a status-query endpoint we can poll if a callback is dropped?
4. Does your terminal emit session-timeout / form-closed callbacks?
5. Do abandoned registered orders get reaped on your side? We now register one
   per re-open and have no way to cancel them — and a bind-completed order sits
   **AUTHORIZED holding the customer's funds**.

## Already landed — PR #55

Seven commits: test key no longer creates a live session; a declined one-off
reaches a terminal state; the checkout session stays `open` on decline so retry
works; the merchant is shown their payment link; a one-off buyer is no longer
told "your subscription is active"; Uzum order numbers are spec-legal and
attempt-scoped so a re-opened link is not dead; and **a merchant can no longer
steer our writes at another org's invoice or subscription via
`payment_intents.metadata`**.

## Explicitly out of scope

- **Payme, Click, Octo.** `payme.ts` and `click.ts` are 5 lines each against
  `uzum.ts`'s 788. Each needs an adapter, a ~500-line dashboard credentials
  route, a `providers` seed, four allowlist edits, and new inbound webhook
  handling — the webhook layer is shaped entirely around Uzum's contract. Three
  of those on top of a one-off path that does not yet reconcile is how you get
  four half-working rails. Revisit after item 7.
- Anything making Krafta Pay merchant of record. BYOA is the licensing boundary.
- Telegram delivery of payment links. Real gap, separate decision.
