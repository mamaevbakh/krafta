# Implementation prompt — Krafta Pay platform billing

Hand this file to an agent as the task. It is self-contained: it assumes no
knowledge of the conversation that produced it.

---

## What you are building

Krafta Pay today bills **merchants' customers**. This adds the layer where
Krafta Pay bills **the merchants** — its own revenue.

Model it on Vercel and Supabase: a monthly plan fee plus metered usage,
itemised on an invoice, charged automatically to a card the merchant attached
once via Atmos.

Krafta Pay is BYOA — merchants connect their own Atmos/Uzum credentials and the
money for their subscriptions never flows through us. Platform fees are the
opposite: they are collected by **us**, through **our** Atmos account, from the
merchant. Keep the two straight; conflating them is the main way this goes
wrong.

## Pricing — decided, do not redesign

| Plan   | Base / month | Usage fee on successful live charge volume | Usage cap |
|--------|--------------|--------------------------------------------|-----------|
| Start  | $0           | 1.0%                                        | $200 / mo |
| Growth | $49          | 0.6%                                        | none      |
| Scale  | $199         | 0.4%                                        | none      |

Growth is the tier that unlocks hosted checkout, coupons and analytics. Feature
gating itself is **out of scope here** — this task is billing only — but put a
`features` jsonb on the platform plan rows so gating has somewhere to read from.

### Currency

Prices are quoted in USD and **charged in UZS**. Store a fixed USD→UZS rate in
config and convert at plan-creation time; write the resulting UZS figure onto
the plan row. Do **not** call a live FX API at charge time — a platform fee that
changes between two months because the rate moved will generate support tickets
and destroy trust in the invoice. Revisit the rate deliberately, on a schedule.

The `$200` Start cap converts the same way, once, into a UZS `cap_minor`.

## Architecture: dogfood, do not build a second billing engine

Every primitive you need already exists. Krafta Pay bills its merchants **using
Krafta Pay**. The mapping:

| Concept | Existing table | Notes |
|---|---|---|
| Platform (the payee) | `public.organizations` | Use `krafta-studio`. It already has a **live Atmos account, status active** — verified. |
| A merchant being billed | `payments.customers` | One row under the platform org, `external_id` = the merchant's org uuid, `environment` = `live`. |
| Their platform plan | `payments.plans` | Three rows under the platform org: `platform-start`, `platform-growth`, `platform-scale`. |
| Their platform subscription | `payments.subscriptions` | Ordinary subscription row. |
| Monthly bill | `payments.invoices` + **new** line-items table | See below. |
| The charge | existing `chargeRenewal` | Already retries on failure. |

Because platform subscriptions are ordinary rows on the platform org, the
existing dunning schedule (retries at 3, 7 and 14 days), recovery links and
outbound webhooks all work with no new code.

**Decide and write down:** platform-fee subscriptions live on `krafta-studio`,
which *also* bills catalog merchants for the Krafta app (10 active Business
subscriptions today). Distinguish them by plan code prefix `platform-` plus
`metadata.kind = "platform_fee"`, and filter on that everywhere you report.
A separate platform org would be cleaner, but it would need its own Atmos
contract — not worth it for v1.

## What is genuinely new

1. **`payments.invoice_line_items`** — `invoices` today carries a single
   `amount_due_minor` and nothing else. A Vercel-style invoice needs at least
   two lines (base fee, usage fee). Columns: `invoice_id`, `kind`
   (`base` | `usage`), `description`, `quantity`, `unit_amount_minor`,
   `amount_minor`, `metadata`.
2. **Usage snapshot** — see Metering.
3. **A cron** that closes periods, builds invoices and charges them.
4. **A merchant-facing Billing page** in the dashboard.
5. **Card attachment for the merchant themselves.**

Everything else is reuse.

## Metering

The billable base is **successful live charge volume**. This query is proven
against production — start from it:

```sql
select sum(pi.amount_minor) as base_minor,
       count(*)             as successful_charges
from payments.payment_intents pi
where pi.org_id = $merchant_org_id
  and pi.status = 'succeeded'
  and pi.environment = 'live'
  and pi.created_at >= $period_start
  and pi.created_at <  $period_end;
```

The amount lives on `payment_intents`, **not** on `payment_attempts` (attempts
have no amount column).

Usage fee = `min(round(base_minor * rate), cap_minor)` where `cap_minor` is null
for Growth and Scale.

**Snapshot, do not recompute.** At period close, write the computed base, the
charge count and the resulting fee into the `usage` line item. An invoice must
be immutable evidence of what was charged and why. If you recompute on demand,
a late-arriving webhook can change a number the merchant has already paid, and
you will not be able to explain the discrepancy.

## Billing cycle

Anniversary from the platform subscription's start date, not calendar month-end.
This is what the engine already does (`current_period_start` / `current_period_end`),
and it is proven in production. **There is no proration code anywhere in this
repo.** Calendar-month billing and mid-cycle plan changes both require it, so:

- v1: plan changes take effect at the **next** period boundary.
- Do not promise proration in the UI.

At period close: compute usage → create invoice with its line items → charge the
saved card via the existing renewal path → advance the period.

**Zero-amount invoices.** A Start merchant with no live volume owes nothing.
Atmos will reject a zero-value charge. Detect `amount_due_minor = 0`, mark the
invoice `paid` with `paid_at = now()` and a `metadata.zero_amount = true`, and
never create a payment intent. Getting this wrong means every free merchant
generates a failed charge every month and enters dunning.

## Card attachment

Reuse the existing Atmos inline card flow — see
`apps/krafta-pay/app/portal/[session_token]/payment-methods/atmos/update`, which
already handles Atmos card binding correctly including the re-bind case.

**The subtle part:** the saved `payment_methods` row must have
`org_provider_account_id` pointing at the **platform's** Atmos account, not the
merchant's own. The merchant is acting as a customer here, and the acquirer
being charged is ours.

Use Atmos, not Uzum, for platform fees: Atmos is inline and settles
synchronously, and it is the provider with a live active account on the platform
org. Uzum requires a bind-first redirect and https callbacks.

## Invoice UX

Match the tables already built at
`apps/krafta-pay/app/dashboard/org/[orgSlug]/subscriptions/` — shadcn `Table`,
status `Badge` on the ratified `success` / `warning` tokens, right-aligned
tabular amounts. Read `DESIGN.md` before making any visual decision.

**Billing page** (`/dashboard/org/[orgSlug]/billing`):
- Current plan, and what the next invoice is estimated at
- Usage so far this period (volume processed, fee accrued, cap progress on Start)
- Payment method on file, with a way to replace it
- Invoice history table

**Invoice detail:** itemised lines, the period it covers, status, and the
underlying charge count so the merchant can reconcile against their own records.

Show the merchant the same number we bill on. If they cannot reproduce the
figure from their own dashboard, they will dispute it.

## Landmines — every one of these has already bitten this repo

1. **Minor-unit invariant.** Every `*_minor` column is major × 100, **including
   UZS**. 490,000 UZS is `49000000`. A plan form that writes the major number
   creates a plan for 1/100th of its price. There is a live example on
   production right now: the `pro` plan is `200000` (2,000 UZS) where dev has
   `25000000` (250,000 UZS).
2. **Never meter the test environment.** `payment_intents.environment` exists
   and is populated. Filter on `'live'` or you will invoice merchants for their
   sandbox testing.
3. **Never bill the platform org itself.** Exclude `krafta-studio` from the
   merchant loop or it bills itself in a cycle.
4. **Migrations are not applied by CI.** Vercel deploys code only. Apply each
   migration by hand to **both** the dev branch and production, and record it.
5. **`trial_days` is decorative** — it is written into subscription metadata and
   never read. The first invoice is the full amount, due immediately. If you
   want a real trial, you are building it.
6. **Dev server serves stale server-action code.** `pnpm build` does not refresh
   it. Stop the server, `rm -rf apps/krafta-pay/.next/dev`, restart. Symptom: a
   change you just made has no effect on a form submission.
7. **Hosted Supabase rate-limits auth.** A dev loop that reloads constantly will
   exhaust it and log you out. Do not poll.
8. **A green commit status is not a live deployment.** The status can go green
   off the Preview build while Production is still building.

## Out of scope for v1 — state these as non-goals, do not silently skip them

- Proration and mid-cycle plan changes
- Enforcing the feature gates that Growth unlocks
- Any currency other than UZS
- VAT / tax treatment of the platform fee (**flag this to the founder** — Krafta
  Pay already has a UZ tax-code system for merchant invoices, and platform fees
  may have their own obligations)
- Self-serve downgrade

## Verification — do not report done without these

- The metered base matches a hand-run SQL count for the same period
- A test-environment charge never appears on any invoice
- A Start merchant with zero live volume gets **no** payment attempt
- The Start cap actually caps: simulate volume above $200-equivalent
- A failed platform charge enters dunning and surfaces as `past_due` to the merchant
- An invoice's line items still sum to its total after a later webhook arrives
- Screenshots of the billing page and an invoice, rendered in a browser, in both
  light and dark themes

---

# Implementation record — 2026-08-04

Built and verified on the dev branch; both migrations applied by hand to dev and
production. What follows is the decisions the prompt asked to be written down,
plus what is deliberately not there.

**This record supersedes the "Currency" section of the brief above.** Pricing is
UZS-native — see below.

## Pricing (UZS-native — no conversion anywhere in the system)

| Plan | Monthly | `amount_minor` | Usage fee | Cap |
|---|---|---|---|---|
| Start | 0 UZS | `0` | 1.0% | 2,500,000 UZS (`250000000`) |
| Growth | 600,000 UZS | `60000000` | 0.6% | none |
| Scale | 2,500,000 UZS | `250000000` | 0.4% | none |

The Start cap equals Scale's monthly fee on purpose. A free-tier merchant can
never owe more than the top tier's base, and at the cap the upgrade argues for
itself: the same money buys the 0.4% rate and the Growth feature set.

The brief specified a USD price list converted at a fixed rate. That layer is
gone: there is no rate constant, no `KRAFTA_PLATFORM_USD_UZS_RATE`, and no USD
field on the plan definition or in plan metadata. A rate held in config is a
second thing that can drift, and it needed ratifying before every price change.
Merchants are charged in UZS, so the plans are simply denominated in UZS.

These started from a `$0 / $49 / $199` list with a `$200` cap at 13,000 UZS/USD,
then were rounded to UZS price points a merchant can hold in their head. The
rounding moved every price DOWN, so nobody could be surprised by an increase
(there are no subscribers yet either way):

| Plan | Converted | Shipped | Delta |
|---|---|---|---|
| Growth | 637,000 | 600,000 | −5.8% |
| Scale | 2,587,000 | 2,500,000 | −3.4% |
| Start cap | 2,600,000 | 2,500,000 | −3.8% |

The USD origin is **provenance, not configuration** — nothing reads it, and
re-pricing does not touch it. To re-price: edit `PLATFORM_PLANS` in
`packages/payments-core/src/platform-billing.ts`, mirror the numbers into
`supabase/migrations/20260804121000_pay_seed_platform_plans.sql`, and re-run that
seed against dev and prod. Existing subscribers re-price at their next period
boundary (there is no proration in this repo).

## Decisions

**Platform-fee subscriptions live on `krafta-studio`** (org
`c03f8bd1-f6b1-4ef0-84bf-b13b0d9314a5`), the same org that bills catalog
merchants for the Krafta app. They are told apart by BOTH the `platform-` plan
code prefix and `metadata.kind = "platform_fee"` on the subscription, and every
query that reports on them filters on that. A separate platform org would be
cleaner but needs its own Atmos contract; not worth it for v1.

**The merchant's platform customer row keys on `external_id` only — never
`customer_org_id`.** `payments.customers` has a unique index on
`(org_id, customer_org_id) WHERE customer_org_id IS NOT NULL`, and the platform
org already has rows carrying it from the Krafta-app billing wiring. Setting it
here collides (23505) — which it did, on the first run — or, if the existing row
were reused, silently merges two unrelated billing relationships onto one
customer. `external_id` = the merchant's organization uuid is what the metering
path reads back.

**No new cron.** Platform subscriptions are ordinary subscription rows, so the
existing hourly `/api/internal/renewals/cron` closes their periods too. The
work is in `chargeRenewal`, which now meters and itemises when the subscription
is a platform fee. Dunning (3/7/14 days), recovery links and outbound webhooks
came free, exactly as the prompt predicted.

**Usage in arrears, plan in advance.** The invoice cut at a period boundary
carries the base fee for the period being *opened* and the usage fee for the
period that just *closed* — you cannot meter a month before it happens. Both
ranges are written into the line metadata so the invoice is self-describing.

**Line-item `description` is the audit record, not what the merchant reads.**
It is written in English at close and frozen. The invoice detail page rebuilds
the same sentence from `kind` + the frozen metadata in the merchant's own
language, so a Russian merchant does not read an English line inside a Russian
invoice. Both derive from the same immutable numbers.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `KRAFTA_PLATFORM_BILLING_ENV` | `live` | Which of *our* Atmos accounts collects. Set to `test` on the dev branch, which has no live Atmos account on the platform org. Do NOT set it in production. |

That is the only knob. Prices are not configurable at runtime — they live in
code and in the seed migration, so a price change is a reviewable diff rather
than an environment variable someone can set differently in two places.

Note the billing environment is a different axis from metering: what we bill
*for* is always live merchant volume, hardcoded, regardless of this setting.

## Migrations (applied by hand — CI does not apply migrations)

| Version | What | dev | prod |
|---|---|---|---|
| `20260804120000_pay_invoice_line_items` | `payments.invoice_line_items` + `plans.features` | applied | applied |
| `20260804121000_pay_seed_platform_plans` | the three platform plans on krafta-studio | applied (re-run after the USD removal and again after rounding) | applied (re-run after the USD removal and again after rounding) |

The seed is idempotent on `(org_id, code)` and its upsert explicitly strips the
`usd_*` keys an earlier run wrote, so re-running it converges rather than leaving
dead fields behind a `||` merge.

Production plan rows: `platform-start` 0 / 1.0% / cap 250000000,
`platform-growth` 60000000 / 0.6%, `platform-scale` 250000000 / 0.4%; metadata is
`{kind, usage_rate_bps, usage_cap_minor}` and nothing else. The five pre-existing
Krafta-app plans were not touched.

## Verified on dev

- Metered base matched a hand-run SQL count exactly (120,000,000 minor, 4 charges),
  re-confirmed after the price rounding.
- A test-environment charge, a failed live charge, and a live charge outside the
  window were all correctly excluded.
- A Start merchant with zero live volume got a `paid` invoice with
  `metadata.zero_amount = true`, **no payment intent and no attempt**.
- The Start cap bound: 500,000,000 UZS of volume produced 2,500,000 UZS of fee,
  not 5,000,000, flagged `capped: true`. (Re-run after the prices were rounded,
  so this is the shipped cap, not the earlier one.)
- Growth billed a non-zero base correctly: 600,000 base + 3,000,000 usage
  (0.6% of 500,000,000) = 3,600,000 UZS, lines summing to the total, uncapped.
- A failed platform charge walked the 3/7/14-day retry schedule and ended
  `uncollectible` + subscription `past_due`, surfaced to the merchant.
- A late webhook adding a succeeded intent inside an already-invoiced period did
  not move the invoice total or the snapshot.
- `krafta-studio` 404s on its own billing page and has no self-billing rows.
- Card attachment resolved the **platform's** Atmos account
  (`e35d4dcb…`, org krafta-studio) while billing merchant `agent-testo`.

## Non-goals in v1 (not skipped — deliberately out)

- **Proration and mid-cycle plan changes.** There is no proration code anywhere
  in this repo. Plan changes take effect at the next period boundary, and the UI
  says so rather than implying otherwise.
- **Enforcing the feature gates Growth unlocks.** `plans.features` now exists and
  carries the entitlements; nothing reads it yet.
- **Any currency but UZS.**
- **VAT / tax treatment of the platform fee.** ⚠️ **FOUNDER DECISION NEEDED.**
  Krafta Pay already has a UZ tax-code system (`payments.tax_schemas`,
  `plan_tax_classifications`) used to fiscalize *merchant* invoices through Uzum.
  Platform fees are our own revenue and may carry their own obligations — a SPIC
  / package code for the platform service, and whether VAT is included in or
  added to the quoted price. Nothing is fiscalized on platform invoices today.
- **Self-serve downgrade.** Plans can be changed in the database; there is no
  merchant-facing tier switcher.

## Known gap

The card bind was verified up to the point where the Atmos inline form resolves
our acquirer — entering a real test card and confirming the SMS OTP was not
executed, so the resulting `payment_methods` row has not been observed. The part
the prompt singled out as subtle (which `org_provider_account_id` the flow
resolves) *was* verified directly against the database.
