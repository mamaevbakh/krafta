# ADR 0001 — Orders & catalog schema for v1 (cash-only launch)

- **Date:** 2026-05-05
- **Status:** Proposed
- **Owner:** @bakh
- **Linear:** [KRA-33](https://linear.app/krafta/issue/KRA-33) (sub-issue of [KRA-6](https://linear.app/krafta/issue/KRA-6))
- **Supersedes / supersedes:** new doc; references the 2026-03-27 dine-in design at `docs/superpowers/specs/2026-03-27-dine-in-shop-design.md`

## 1. Context

[KRA-6](https://linear.app/krafta/issue/KRA-6) is the cornerstone product bet for the launch month: dine-in / pickup / delivery ordering for cafes and restaurants. Schema decisions made here will constrain everything else — catalog editor, order management dashboard ([KRA-32](https://linear.app/krafta/issue/KRA-32)), QR taxonomy ([KRA-27](https://linear.app/krafta/issue/KRA-27)), TMA flow ([KRA-25](https://linear.app/krafta/issue/KRA-25)), payment integration (Uzum, deferred to v2).

Per [KRA-24](https://linear.app/krafta/issue/KRA-24), v1 ships **cash-only**: customer places order on Krafta, order arrives at merchant, customer pays in person. No in-app payment in v1, but the schema must seat the payment lifecycle so v2 (Uzum) doesn't need a migration.

The bar from [KRA-33](https://linear.app/krafta/issue/KRA-33):

> A year from now, when we add takeout-from-multiple-kitchens / catering / scheduled orders / in-app payment, **none of those should require schema migrations**. If they would, the schema is wrong.

## 2. Inputs to this decision

### 2.1 Square's data model (the model to copy)

Square's Catalog + Locations + Orders + Payments + Customers APIs are the most mature reference for our segment. Patterns worth copying verbatim:

- **Items as containers, prices on variations.** No price column on `item`. Even single-variation items get one variation row.
- **Modifier list as a reusable named entity, joined to items via a join table** that carries per-item `min/max/enabled/ordinal` overrides. "Milk" is defined once and attached to 30 drinks.
- **Snapshot catalog data onto every order line and modifier** — store both `catalog_object_id + catalog_version` *and* the materialized `base_price`, `name`, `variation_name`. Caller's snapshot wins over live catalog.
- **Order-level definitions of taxes/discounts + per-line `applied_*` references via UID.** Define a tax once on the order; each applicable line references it.
- **Order state machine `DRAFT → OPEN → COMPLETED | CANCELED`** with optimistic concurrency via a monotonic `version` field echoed in every update.
- **Payment is independent of Order**, attaches via `order_id`, supports auth/capture via an `autocomplete` boolean, supports N payments per order. Refunds as their own resource.
- **Location as ops/financial unit (currency, timezone, hours, availability), Merchant as identity/billing unit.** Catalog availability per-location via inclusion/exclusion lists; price overrides via dedicated table.

Patterns to **not** clone:

- The polymorphic `CatalogObject` + `<type>_data` blob. REST artefact; in Postgres, distinct tables with FKs are far better.
- Service Charges as a third tax-shaped primitive. Consolidate fees into a uniform model — service fees ship in v1 as a `kind` discriminator on `taxes` / `order_taxes`.
- Tender-vs-Payment duality on the order. Use one concept (Payment), let order have many.

Square has **no native dine-in fulfillment type** — they suggest `PICKUP` with table number stuffed in `ticket_name`. Krafta will introduce `DINE_IN` as a first-class fulfillment type. That's the gap we fill that Square never closed.

### 2.2 Existing dine-in product spec (Krafta-specific)

`docs/superpowers/specs/2026-03-27-dine-in-shop-design.md` (drafted 2026-03-27) defines the dine-in UX. Key concepts beyond Square:

- **Table session** — a shared order context bound to a table QR. Multiple guests join it from their own phones.
- **Guest session** — one diner inside a table session (signed-in or guest).
- **Cart** — draft items the guest has added but not yet submitted.
- **Order (kitchen batch)** — submitted items that accumulate across the table; immutable after submission.

Submission boundary: `Make an order` (the customer-facing button) is the moment cart → batch becomes immutable. Guests cannot edit their own batches after that. Each guest pays for what they sent (with optional "pay full table" path).

This concept doesn't exist in Square. The schema needs to support it cleanly.

### 2.3 Krafta's current schema (state as of 2026-05-05)

**Public schema (16 tables)** — what's there:

| Table | Purpose | Notes |
|---|---|---|
| `organizations` | Multi-tenant root (slug, country) | identity / billing tenant |
| `organization_members` | User ↔ org with `owner / member / admin` | RBAC base |
| `catalogs` | Top-level catalog with `settings_*` jsonb | one per shop currently |
| `catalog_categories` | Categories per catalog | M:1 to catalog |
| `catalog_locales` | Supported languages per catalog | i18n config |
| `catalog_category_translations` | i18n for categories | per locale |
| `items` | Products with `price_cents`, `product_type` | **Square-style `product_type` enum already in place** |
| `item_translations` | i18n for items | per locale |
| `item_media` | Images/videos per item | with `position`, `is_primary` |
| `catalog_search_documents` | Search index with `halfvec` embeddings | pgvector-based search |
| `search_synonyms`, `search_logs` | Search support | |
| `catalog_item_type_feature_requests` | Demand tracking for unsupported product types | nice-to-have |
| `faq` | Pre-launch FAQ with embeddings | unrelated |
| `auth_clients`, `auth_authorization_codes` | OAuth | identity infra |

**`payments` schema (22 tables)** — **Krafta Pay product** (separate app — a Stripe-like payment processor with a BYO-Acquirer model):

`providers`, `org_provider_accounts`, `customers`, `payment_methods`, `payment_intents`, `payment_attempts`, `payment_events`, `checkout_sessions`, `plans`, `subscriptions`, `invoices`, `subscription_events`, `api_keys`, `tax_*`, `org_tax_profiles`, `logs`, `customer_portal_sessions`, `customer_portal_events`.

This is a **separate product entirely**. Krafta Pay's clients are merchants who use it as their payment processor (analog to Stripe's customers). Out of scope for [KRA-6](https://linear.app/krafta/issue/KRA-6).

**This means there are *three* distinct payment concerns we must keep separate:**

| Concern | Schema | Status | Issue |
|---|---|---|---|
| **Krafta Pay** (the product — Stripe-like processor with BYO-Acquirer) | `payments.*` (existing) | Active product, its own roadmap | (separate) |
| **Krafta SaaS billing** (how Krafta charges merchants for catalog plans) | doesn't exist yet — propose `billing.*` | Needed for paid conversions (post-launch) | [KRA-5](https://linear.app/krafta/issue/KRA-5) |
| **Merchant order payments** (cash v1, Krafta Pay v2 — *exclusive*) | this ADR proposes `commerce.order_payments` | Needed for KRA-6 v1 launch | [KRA-37](https://linear.app/krafta/issue/KRA-37) |

This ADR scopes only the third concern. Do not store merchant order payments in `payments.*` (Krafta Pay's data) and do not store Krafta SaaS billing in either of those schemas.

**Architectural rule (locked 2026-05-05):** in-app merchant order payments will use **Krafta Pay exclusively** as the processor. Acquirers like Uzum are configured per-merchant *inside Krafta Pay* via `payments.org_provider_accounts` — they are not directly addressable from the catalog app. The catalog app talks to Krafta Pay; Krafta Pay talks to whatever acquirer the merchant has connected. This keeps the catalog app decoupled from acquirer specifics and avoids one-off integrations sprawling into `commerce.*`.

**Implication:** for v2 in-app payments to work, a merchant must have a Krafta Pay account (org_provider_account) connected to at least one acquirer. The onboarding for that lives in Krafta Pay's domain, not here. Cash (v1) requires no Krafta Pay account.

### 2.4 Gap analysis vs KRA-6 needs

| Need | Status | Gap |
|---|---|---|
| Item variations (sizes, modifiers) | ❌ | `items.price_cents` lives on the item row — Square anti-pattern. **Refactor required.** |
| Modifier lists | ❌ | Don't exist. Critical for cafes ("Milk", "Add-ons"). |
| Locations / venues | ❌ | Only `organizations`. No per-venue mode toggles, hours, currency, address. |
| Orders / line items | ❌ | None. |
| Fulfillments (dine-in / pickup / delivery) | ❌ | None. |
| Order payments (cash/card per merchant order) | ❌ | `payments` schema is for SaaS subs, not order payments. |
| Catalog taxes / discounts | ❌ | `payments.tax_*` is for SaaS plans. Catalog-level tax doesn't exist. |
| Table sessions (dine-in batched submission) | ❌ | None. |
| Customer (end-customer of merchant) | ❌ | None. `payments.customers` is Krafta's billing customer. |

Roughly the entire ordering domain is greenfield. Catalog needs a refactor to introduce variations and modifiers.

## 3. Decision: schema for v1 cash-only

A new `commerce` schema, separate from `public` (catalog) and `payments` (SaaS billing). Purpose: keep concerns isolated and scopable for RLS.

> Rationale for a separate schema: `public` is product catalog (mostly read-heavy, content-y). `commerce` is transactional (orders, fulfillments, payments). `payments` is SaaS billing for Krafta itself. RLS policies, indexes, and access patterns differ across these. Schema separation makes that explicit.

Variations and modifiers, although catalog concepts, also go in `public` next to existing catalog tables — they extend the menu, not the order pipeline.

### 3.1 Catalog refactor (in `public`)

```
public.venues                         -- new (1:1 with catalog; opening a new location = clone a catalog)
  id (uuid)                              PK
  org_id (uuid)                          FK → organizations
  catalog_id (uuid, UNIQUE)              FK → catalogs   (1:1 — one catalog ≡ one venue)
  slug (text, unique within org)
  name (text)
  address (jsonb)
  timezone (text)                        IANA tz, e.g. 'Asia/Tashkent'
  currency (text, ISO-4217)              from org default but per-venue
  business_hours (jsonb)                 {monday: [{open: '08:00', close: '22:00'}], ...}
  language_code (text)
  modes_enabled (text[])                 {'dine_in','pickup','delivery'}; CHECK len >= 1
  status (enum: active | paused | archived)
  metadata (jsonb)
  created_at, updated_at

public.item_variations                -- new
  id (uuid)                              PK
  item_id (uuid)                         FK → items
  name (text)                            'Small', 'Medium', 'Large', 'Default'
  sku (text, nullable)
  pricing_type (enum: fixed | variable) default 'fixed'
  price_cents (int)                      base price for this variation
  ordinal (int)                          sort order
  is_default (bool)                      true for the canonical/single variation
  is_active (bool)
  metadata (jsonb)
  created_at, updated_at
  UNIQUE(item_id, name)

public.modifier_lists                 -- new
  id (uuid)                              PK
  catalog_id (uuid)                      FK → catalogs   (scoped to one catalog)
  name (text)                            'Milk', 'Add-ons'
  internal_name (text, nullable)         for staff
  modifier_type (enum: list | text)      'list' = pick from options, 'text' = free text
  min_selected (int, default 0)
  max_selected (int, nullable)           null = unlimited
  allow_quantities (bool, default false)
  ordinal (int)
  is_active (bool)
  metadata (jsonb)
  created_at, updated_at

public.modifiers                      -- new (options inside a modifier_list)
  id (uuid)                              PK
  modifier_list_id (uuid)                FK → modifier_lists
  name (text)
  price_cents_delta (int, default 0)     additive price (+0.75 for oat milk)
  ordinal (int)
  is_default (bool)
  is_active (bool)
  metadata (jsonb)
  UNIQUE(modifier_list_id, name)

public.item_modifier_lists            -- new (join: item × modifier_list with overrides)
  item_id (uuid)                         FK → items
  modifier_list_id (uuid)                FK → modifier_lists
  min_selected_override (int, nullable)  override the list-level default
  max_selected_override (int, nullable)
  ordinal (int)
  is_enabled (bool, default true)
  PRIMARY KEY (item_id, modifier_list_id)

public.modifier_list_translations     -- new (i18n)
public.modifier_translations          -- new (i18n)
public.item_variation_translations    -- new (i18n)

public.taxes                          -- new (catalog-level taxes & service fees)
  id (uuid)                              PK
  catalog_id (uuid)                      FK → catalogs
  kind (enum: tax | service_fee)         'service_fee' for the 10–20% UZ-style restaurant fee
  name (text)                            'VAT 12%' / 'Service 15%'
  calculation_phase (enum: subtotal | total)
  inclusion_type (enum: included | additive)
  percentage (numeric(5,4))              0.1200 = 12.00%
  applies_to (enum: all_items | by_category)
  is_active (bool)

public.tax_categories                 -- new; only present rows when applies_to = 'by_category'
  tax_id (uuid)                          FK → taxes
  category_id (uuid)                     FK → catalog_categories
  PRIMARY KEY (tax_id, category_id)

public.discounts                      -- new (catalog-level discounts)
  id (uuid)                              PK
  catalog_id (uuid)                      FK → catalogs
  name (text)
  discount_type (enum: percentage | fixed_amount | variable_percentage | variable_amount)
  percentage (numeric(5,4), nullable)
  amount_cents (int, nullable)
  pin_required (bool, default false)
  is_active (bool)
```

**Migration of existing `items.price_cents`:** create one default variation per item with `is_default=true, name='Default', price_cents = items.price_cents`. Drop `items.price_cents` after the cutover.

### 3.2 Orders pipeline (new `commerce` schema)

```
commerce.customers                    -- end-customers of merchant (NOT Krafta SaaS customers)
  id (uuid)                              PK
  org_id (uuid)                          FK → organizations  (merchant-scoped, not venue-scoped)
  user_id (uuid, nullable)               FK → auth.users (if registered; null for guest)
  given_name (text, nullable)
  family_name (text, nullable)
  email (text, nullable)
  phone (text, nullable)
  preferred_locale (text, nullable)
  metadata (jsonb)
  creation_source (enum: instant_profile | dashboard | guest_checkout | tg_login)
  version (bigint)                       OCC
  created_at, updated_at
  CHECK (given_name IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL OR user_id IS NOT NULL)

commerce.table_sessions               -- dine-in shared context (Krafta-specific, not in Square)
  id (uuid)                              PK
  venue_id (uuid)                        FK → venues
  table_label (text)                     'Table 5', 'Bar 2'
  qr_code_id (uuid, nullable)            FK → qr_codes (KRA-26)
  status (enum: open | closed)
  opened_at (timestamptz)
  closed_at (timestamptz, nullable)
  metadata (jsonb)
  -- one open session per (venue_id, table_label) at a time
  UNIQUE(venue_id, table_label) WHERE status = 'open'

commerce.guest_sessions               -- one diner inside a table session
  id (uuid)                              PK
  table_session_id (uuid)                FK → table_sessions
  customer_id (uuid, nullable)           FK → customers (null = anonymous)
  display_name (text, nullable)          'Guest 1', or first name
  joined_at (timestamptz)
  left_at (timestamptz, nullable)
  metadata (jsonb)

commerce.orders
  id (uuid)                              PK
  org_id (uuid)                          FK → organizations
  venue_id (uuid)                        FK → venues
  customer_id (uuid, nullable)           FK → commerce.customers
  guest_session_id (uuid, nullable)      FK → guest_sessions  (set for dine-in batches)
  table_session_id (uuid, nullable)      FK → table_sessions  (denormalized for query)
  state (enum: draft | open | completed | canceled)
  version (bigint)                       OCC
  reference_id (text, nullable)          merchant-facing order # ('A-021')
  ticket_name (text, nullable)           free-text label ('John for here')
  source (enum: web | tma | qr_scan | dashboard)
  pricing_options (jsonb)                {auto_apply_taxes: true}
  metadata (jsonb)
  created_at, updated_at
  closed_at (timestamptz, nullable)

commerce.order_line_items
  id (uuid)                              PK
  uid (text)                             stable ID within order (for `applied_*` refs)
  order_id (uuid)                        FK → commerce.orders
  -- Snapshot fields (Square-style: store both ref + materialized values)
  catalog_item_id (uuid, nullable)       FK → public.items  (nullable for custom amounts)
  catalog_variation_id (uuid, nullable)  FK → public.item_variations
  catalog_version (bigint, nullable)     for retroactive lookups
  name (text)                            snapshotted item name
  variation_name (text, nullable)        snapshotted variation name
  quantity (numeric)                     1.0, 0.5kg, etc.
  quantity_unit (text, nullable)         'unit', 'kg', 'lb'
  base_price_cents (int)                 snapshotted variation price (caller's snapshot wins)
  total_price_cents (int)                computed: (base + modifier_deltas) * quantity
  note (text, nullable)
  metadata (jsonb)
  pricing_blocklists (jsonb)             {blocked_taxes: ['tax_uid_1'], blocked_discounts: []}
  created_at, updated_at

commerce.order_line_item_modifiers
  id (uuid)                              PK
  uid (text)                             stable ID within line item
  line_item_id (uuid)                    FK → commerce.order_line_items
  catalog_modifier_id (uuid, nullable)   FK → public.modifiers
  catalog_version (bigint, nullable)
  name (text)                            snapshotted
  base_price_cents_delta (int)           snapshotted (caller's snapshot wins)
  quantity (int, default 1)
  ordinal (int)

commerce.order_taxes                  -- order-level definitions (taxes + service fees)
  id (uuid)                              PK
  uid (text)                             stable ID within order
  order_id (uuid)                        FK → commerce.orders
  catalog_tax_id (uuid, nullable)        FK → public.taxes
  kind (enum: tax | service_fee)         snapshotted from catalog row
  name (text)                            snapshotted
  type (enum: percentage | fixed)
  percentage (numeric(5,4), nullable)
  amount_cents (int, nullable)
  scope (enum: order | line_item)
  auto_applied (bool)
  applied_money_cents (int)              computed (read-only output)

commerce.order_discounts              -- order-level definitions
  id (uuid)                              PK
  uid (text)
  order_id (uuid)                        FK → commerce.orders
  catalog_discount_id (uuid, nullable)   FK → public.discounts
  name (text)
  type (enum: percentage | fixed_amount | variable_percentage | variable_amount)
  percentage (numeric(5,4), nullable)
  amount_cents (int, nullable)
  scope (enum: order | line_item)

commerce.line_item_applied_taxes      -- references from line item to order-level tax
  line_item_id (uuid)                    FK
  order_tax_uid (text)                   refs commerce.order_taxes.uid
  applied_money_cents (int)              computed
  PRIMARY KEY (line_item_id, order_tax_uid)

commerce.line_item_applied_discounts
  line_item_id (uuid)                    FK
  order_discount_uid (text)              refs commerce.order_discounts.uid
  applied_money_cents (int)
  PRIMARY KEY (line_item_id, order_discount_uid)
```

**Critical Square-isms preserved:**

- `version` for OCC on orders, customers, payments.
- Snapshots: `catalog_*_id` + `catalog_version` *and* materialized `name`, `base_price_cents`. Mutating the catalog never silently changes a historical order.
- Order-level tax/discount definitions + per-line application via `*_uid` references.
- `pricing_blocklists` per line for opt-out of auto-applied order-level taxes/discounts.

### 3.3 Fulfillments

```
commerce.fulfillments
  id (uuid)                              PK
  uid (text)                             stable ID within order
  order_id (uuid)                        FK → commerce.orders
  type (enum: dine_in | pickup | delivery | digital)
  state (enum: proposed | reserved | prepared | completed | canceled | failed)
  line_item_application (enum: all | entry_list)
  metadata (jsonb)
  created_at, updated_at
  -- type-specific details below in dedicated tables (avoid jsonb soup)

commerce.fulfillment_line_item_entries  -- only when line_item_application = 'entry_list'
  fulfillment_id (uuid)                  FK
  line_item_uid (text)                   refs order_line_items.uid
  quantity (numeric)
  PRIMARY KEY (fulfillment_id, line_item_uid)

commerce.fulfillment_dine_in_details
  fulfillment_id (uuid)                  PK / FK → fulfillments
  table_session_id (uuid)                FK → table_sessions
  table_label (text)                     denormalized
  guest_session_id (uuid)                FK → guest_sessions
  party_size (int, nullable)
  course_number (int, nullable)
  closed_at (timestamptz, nullable)      bill settled

commerce.fulfillment_pickup_details
  fulfillment_id (uuid)                  PK / FK
  recipient_name (text, nullable)
  recipient_phone (text, nullable)
  schedule_type (enum: asap | scheduled)
  pickup_at (timestamptz, nullable)
  pickup_window_minutes (int, nullable)
  prep_time_minutes (int, nullable)
  -- timestamp ladder
  placed_at, accepted_at, rejected_at, ready_at, picked_up_at, expired_at, canceled_at (timestamptz, nullable)
  cancel_reason (text, nullable)
  is_curbside (bool, default false)
  note (text, nullable)

commerce.fulfillment_delivery_details
  fulfillment_id (uuid)                  PK / FK
  recipient_name (text)
  recipient_phone (text)
  address (jsonb)
  scheduled_for (timestamptz, nullable)
  delivery_provider (enum: merchant | yandex | glovo | other, default 'merchant')
  external_courier_ref (text, nullable)  for v2 courier integrations (KRA-39)
  -- timestamp ladder
  placed_at, accepted_at, rejected_at, courier_assigned_at, picked_up_at, delivered_at, canceled_at (timestamptz, nullable)
  cancel_reason (text, nullable)
  note (text, nullable)
```

> The fulfillment-type sub-tables avoid jsonb soup. Square crams everything into `pickup_details: { … }` json; that hurts indexing and querying. We split.

### 3.4 Order payments (cash-only v1, Uzum-ready for v2)

```
commerce.order_payments
  id (uuid)                              PK
  order_id (uuid)                        FK → commerce.orders
  amount_cents (int)
  tip_cents (int, default 0)
  total_cents (int)                      amount + tip
  status (enum: pending | approved | completed | canceled | failed)
  source_type (enum: cash | external_card_recorded | krafta_pay)
  -- 'cash':                  merchant collected cash in person
  -- 'external_card_recorded': merchant swiped a card on their own POS, just recording it
  --                          (no money through Krafta — Square's 'EXTERNAL' equivalent)
  -- 'krafta_pay':            in-app payment via Krafta Pay (exclusive provider for in-app)
  krafta_pay_payment_intent_id (uuid, nullable) FK → payments.payment_intents.id (only when source_type='krafta_pay')
  source_details (jsonb)                 cash: { collected_at }, external_card_recorded: { last4, network }
  collected_by_user_id (uuid, nullable)  staff member who marked cash collected
  refund_ids (uuid[])                    references commerce.order_refunds
  version (bigint)                       OCC
  authorized_at, completed_at, canceled_at (timestamptz, nullable)
  metadata (jsonb)
  created_at, updated_at
  CHECK (source_type = 'krafta_pay') = (krafta_pay_payment_intent_id IS NOT NULL)

commerce.order_refunds
  id (uuid)                              PK
  payment_id (uuid)                      FK → order_payments
  order_id (uuid)                        FK → commerce.orders  (denormalized for query)
  amount_cents (int)
  status (enum: pending | completed | failed)
  reason (text, nullable)
  refunded_by_user_id (uuid, nullable)
  metadata (jsonb)
  created_at, updated_at
```

**v1 behavior:** Merchant marks `source_type='cash'` (or `external_card_recorded`), `status='completed'` via the order-management dashboard ([KRA-32](https://linear.app/krafta/issue/KRA-32)) when payment is collected. No money moves through Krafta in v1.

**v2 (Krafta Pay, exclusive):** Krafta Pay creates a `payments.payment_intent`; this `order_payment` row links to it via `krafta_pay_payment_intent_id`. The intent on the Krafta Pay side fans out to whichever acquirer the merchant has connected (Uzum, etc.) — that's Krafta Pay's concern, not ours. Same `commerce.order_payments` shape, just a new `source_type` value. **No schema migration when v2 ships.**

**Foreign key across schemas:** `commerce.order_payments.krafta_pay_payment_intent_id` references `payments.payment_intents.id`. Cross-schema FKs are fine in Postgres; just ensure both schemas live in the same database (they do today on `kraftabase`). If Krafta Pay ever moves to its own database, this becomes a logical-only reference enforced at the application layer.

### 3.5 Order events (audit + realtime)

```
commerce.order_events
  id (uuid)                              PK (bigint identity OK too)
  order_id (uuid)                        FK
  event_type (text)                      'state_change' | 'item_added' | 'modifier_change' | 'fulfillment_state_change' | 'payment_state_change' | 'refund'
  actor_type (enum: customer | merchant_staff | system | krafta_admin)
  actor_id (uuid, nullable)              FK → auth.users
  before (jsonb)                         minimal diff
  after (jsonb)
  occurred_at (timestamptz)
```

Used for: audit trail (who marked the order ready), realtime subscriptions for [KRA-32](https://linear.app/krafta/issue/KRA-32) (merchant dashboard), reconciliation.

## 4. Patterns we explicitly reject

| Pattern | Why we reject it |
|---|---|
| Polymorphic `CatalogObject` / `<type>_data` blob | Postgres relational tables are dramatically better here. |
| Money-totals as persisted columns (gross_sales, net_due, applied_money) | Compute on read. Square persists because of REST contract; we don't have that constraint. |
| `Tender` separate from `Payment` on order | Vestigial. One concept (`order_payments`), order has many. |
| Service Charge as a 3rd tax-shaped primitive | Folded into `taxes` via `kind = 'service_fee'`. Ships day 1 (UZ restaurants charge 10–20%). |
| Square's `present_at_all_locations + absent_at_location_ids` exception list | Not needed: 1 catalog ≡ 1 venue. Multi-location merchants clone the catalog per venue. |
| `returns[]` array on Order (Square's in-store return model) | Refunds-as-separate-records (`commerce.order_refunds`) is cleaner. |
| Per-customer `tax_ids` (EU VAT) baked into `customers` | Add as optional extension if a market requires it. |
| Phone/SMS OTP customer auth | Out of scope; Telegram + Email + Google handle our customer base. |

## 5. Migration plan from current state

Phased migrations to land in [KRA-33](https://linear.app/krafta/issue/KRA-33) implementation:

**Migration 1 — Catalog refactor:**
1. Add `public.item_variations` table.
2. Backfill: insert one default variation per existing item, copy `items.price_cents`.
3. Update reads to join through variations.
4. Update writes to write to variations.
5. Drop `items.price_cents` (deferred to a later migration).
6. Add `public.modifier_lists`, `public.modifiers`, `public.item_modifier_lists`.
7. Add per-variation translation table.

**Migration 2 — Venues (1:1 with catalog):**
1. Add `public.venues` with `catalog_id UNIQUE` FK → `catalogs`.
2. Default-populate one venue per existing `catalog` row (`modes_enabled = ['pickup','dine_in','delivery']`).

**Migration 3 — Catalog taxes / discounts:**
1. Add `public.taxes`, `public.discounts`. Empty by default.

**Migration 4 — Commerce schema bootstrap:**
1. Create `commerce` schema.
2. Create `customers`, `orders`, `order_line_items`, `order_line_item_modifiers`, `order_taxes`, `order_discounts`, `line_item_applied_*`.
3. RLS policies (org-scoped read + write for org members; customer can read their own orders).

**Migration 5 — Fulfillments:**
1. `fulfillments`, `fulfillment_*_details` tables.
2. `table_sessions`, `guest_sessions`.
3. Trigger / function to enforce "one open `table_session` per (`venue_id`, `table_label`)".

**Migration 6 — Order payments:**
1. `order_payments`, `order_refunds`.
2. `order_events`.
3. Supabase realtime publication on `commerce.orders` + `commerce.fulfillments` for [KRA-32](https://linear.app/krafta/issue/KRA-32).

Each migration ships independently, behind feature flags where customer-visible.

## 6. RLS policies (sketch)

- `public.venues` — owner / admin / member of `org_id` can SELECT/INSERT/UPDATE; everyone can SELECT venues for catalogs that are `published`.
- `public.item_variations`, `modifier_lists`, etc. — same as `items` (org-scoped via catalog).
- `commerce.customers` — org members can SELECT/INSERT/UPDATE for their org. Customers can SELECT their own row (`user_id = auth.uid()`).
- `commerce.orders` — org members can read all orders for their org. Customers can read orders where `customer_id` = their customer row. Anonymous users can read **only their own** orders (via temp claim token in URL or the anon Supabase session — see [KRA-41](https://linear.app/krafta/issue/KRA-41)).
- `commerce.order_payments` — org members only.
- `commerce.order_events` — append-only (no DELETE/UPDATE policies); SELECT scoped same as orders.

## 7. Resolved questions

1. **Per-venue menu vs global menu.** **Resolved: one catalog ≡ one venue.** A new venue is opened by cloning an existing catalog. Access control hangs off the catalog: org members can be granted access to specific catalogs (basis for future team/role functionality). Per-venue availability overrides on a single catalog are out — multi-venue merchants get multi-catalog. `item_variation_venue_overrides` is dropped from v1 scope; `venue_id` on relevant rows is sufficient.
2. **Tip handling.** **Resolved: ship percentage + fixed, switchable in UI.** Schema (`order_payments.tip_cents`) covers all three modes. UX: a single tip control that toggles between % (of subtotal) and fixed amount, with live computed total preview. Custom amount falls under "fixed".
3. **Service charges / service fees.** **Resolved: ships day 1.** Uzbek restaurants commonly charge 10–20% service fee, so this is non-negotiable for launch. Modeled as `kind = 'service_fee'` on `public.taxes` and `commerce.order_taxes` — same shape as a tax, different `kind`. Avoids a third tax-shaped primitive while letting reporting/exports separate the two.
4. **Multi-payment on one order (split tender).** **Resolved: schema in v1, UX in v2.** Schema supports N `order_payments` per order. v1 collects one cash payment per order; the UX for split tender lands later without migration.
5. **Catalog versioning.** **Resolved: per-row `version bigint` + trigger.** Add to `public.items`, `item_variations`, `modifier_lists`, `modifiers`, `taxes`, `discounts`. Increment on UPDATE via trigger; snapshot writes capture the value at the moment of order. DB-only for now; reconstruction tooling can come later when actually needed.
6. **Cart persistence.** **Resolved: cart is an `orders` row in `state='draft'`.** Owned by the customer's anon Supabase session ([KRA-41](https://linear.app/krafta/issue/KRA-41)) with line items filled in. Standard ecommerce pattern (also Square's). No separate `cart` table.
7. **Dine-in batched submission.** **Resolved: each `Make an order` tap creates a new `commerce.orders` row in `state='open'`,** scoped to the same `table_session_id` and `guest_session_id`. Multiple orders per guest session per table session is expected. The merchant dashboard groups them by table session. (Note: "Make an order" replaces the earlier "Send to kitchen" placeholder as the customer-facing button label.)
8. **Naming: three distinct "customer" concepts.** **Resolved: document prominently.** `commerce.customers` = end-customers of merchants; `payments.customers` = Krafta Pay's customers (merchants using KP as a processor); future `billing.customers` = Krafta's own paying merchants (SaaS subscribers). To be called out at the top of `AGENTS.md` and in each schema's preamble so contributors don't conflate them.

## 8. Consequences

### Enables (now and later)

- **Cash-only v1 launch** — orders flow end-to-end without any payment provider (KRA-37 cart/checkout sub-issue ships against this schema).
- **Drop-in Krafta Pay integration** in v2 — a new `source_type='krafta_pay'` on `order_payments` plus a FK to `payments.payment_intents`. No migration to existing tables. Acquirer choice (Uzum, etc.) is Krafta Pay's internal concern, not ours.
- **First-class dine-in** with shared `table_session` and per-guest `guest_session`. Square doesn't have this.
- **Multi-venue merchants** — the bakery chain in 3 locations works from day 1 even if v1 has only one venue per merchant in practice.
- **Catalog edits don't retroactively break orders** because of snapshot fields + `catalog_version`.
- **Per-venue pricing differences** are handled by separate catalogs (one per venue), not row-level overrides — simpler model, fits the 1 catalog ≡ 1 venue rule.
- **Future: takeout-from-multiple-kitchens / catering / scheduled orders / split tender** all fit into the existing schema. Catering is a new fulfillment subtype + fulfillment_catering_details. Multi-kitchen is `entry_list` line-item application across multiple fulfillments. Scheduled orders are `scheduled_for` on existing fulfillment-type details. Split tender is N rows in `order_payments`.

### Constrains

- **More tables.** Roughly +25 tables across `public` and `commerce`. Linear migration sequence; each migration is small.
- **Snapshot semantics require discipline.** When a worker writes an order line, it must read from `item_variations` *and* copy the values onto the line. Easy to forget in code review — codify as a server-side function or RLS-protected stored procedure.
- **Versioning on every catalog row** (Open Q #5) means more write traffic. Probably fine at our scale.
- **No item-level price.** Code paths that read `items.price_cents` need updating. One-time migration cost.

### Risk

- **Migration window:** the `items.price_cents → variations` cutover requires careful ordering. App code must read variations *before* we drop the column. Plan: ship variations + dual-write for a release, then read-from-variations-only, then drop the column.
- **RLS complexity:** order RLS policies (anon customer + registered customer + merchant staff + Krafta admin) are non-trivial. Test exhaustively.

## 9. Followups

- Spawn implementation issues from [KRA-33](https://linear.app/krafta/issue/KRA-33): each migration above is a candidate sub-issue or a single migration PR.
- Update [KRA-34](https://linear.app/krafta/issue/KRA-34) (venue config) to reflect this schema.
- Update [KRA-35](https://linear.app/krafta/issue/KRA-35) (menu builder) — UI now must edit variations + modifier lists + item-modifier links.
- Update [KRA-36](https://linear.app/krafta/issue/KRA-36) (customer order page) — reads variations, applies mode-encoded QR params from [KRA-27](https://linear.app/krafta/issue/KRA-27).
- Update [KRA-37](https://linear.app/krafta/issue/KRA-37) (cart + checkout) — writes to `commerce.orders` in `draft` state, transitions to `open` when the customer taps `Make an order`.
- Update [KRA-32](https://linear.app/krafta/issue/KRA-32) (merchant dashboard) — subscribe to `commerce.orders` realtime; render the per-venue queue.
- Open question for the implementer: rename `payments` schema to `billing` (Open Q #8)? Low cost; high clarity.

## 10. References

- Square: [Catalog API](https://developer.squareup.com/docs/catalog-api/what-it-does), [Orders API: How it works](https://developer.squareup.com/docs/orders-api/how-it-works), [Apply taxes and discounts](https://developer.squareup.com/docs/orders-api/apply-taxes-and-discounts), [Optimistic concurrency](https://developer.squareup.com/docs/build-basics/common-api-patterns/optimistic-concurrency).
- Stripe: [PaymentIntent lifecycle](https://docs.stripe.com/payments/payment-intents) — for two-step auth/capture pattern.
- Krafta: `docs/superpowers/specs/2026-03-27-dine-in-shop-design.md`.
- Linear: [KRA-6](https://linear.app/krafta/issue/KRA-6), [KRA-33](https://linear.app/krafta/issue/KRA-33), [KRA-32](https://linear.app/krafta/issue/KRA-32), [KRA-24](https://linear.app/krafta/issue/KRA-24).
