-- One-off payment links get customers, the way Stripe does it.
--
-- THE PROBLEM
-- -----------
-- A payment link made from the dashboard creates no customer at all. Somebody
-- pays 250,000 UZS, the money lands, and the merchant's Customers page shows
-- nobody — the payment exists, the payer does not. Sixteen open one-off links
-- on the dev branch alone are money that, if paid, arrives from a stranger.
--
-- WHAT STRIPE ACTUALLY DOES (and what we are copying)
-- ---------------------------------------------------
-- Stripe Checkout does NOT create a Customer for a one-off payment by default.
-- It creates a *guest customer*: a read-only grouping of completed payments
-- that share an identity, shown in its own Guests tab, with no saved card and
-- therefore no way to charge them again. `customer_creation: 'always'` opts
-- into a real Customer instead. Subscriptions always require a real one.
--
-- Three things follow, and this migration is all three:
--
--   1. `customer_creation` belongs to the CHECKOUT SESSION, decided when the
--      link is made. `if_required` is Stripe's default for payment mode and
--      ours.
--
--   2. The identity the payer types belongs to the SESSION, not to a customer
--      row, because at that moment there is no customer. Stripe holds it in
--      `customer_details` and materialises the customer when the session is
--      confirmed. We were already burned by the opposite order: subscriptions
--      create their customer when the LINK is made, which is why two months of
--      links nobody opened sat on the Customers page as debtors.
--
--   3. A guest is a different kind of record from a customer and must not be
--      mixed into the list a merchant bills from. `is_guest` keeps the main
--      Customers list meaning "people you can charge".
--
-- WHERE WE CANNOT BE EXACTLY STRIPE, AND WHY
-- ------------------------------------------
-- Stripe groups guests by CARD NUMBER. We cannot: a one-off intent carries
-- `card_binding = 'none'`, no provider token is stored, and `payment_methods`
-- requires a customer_id — by design, since Stripe does not save cards for
-- guests either. So we group on the next-strongest keys Stripe also names:
-- phone, then email. A payment with no identifying detail at all creates NO
-- record rather than an anonymous row per payment — grouping is the entire
-- purpose of a guest, and a guest with nothing to group by is the duplicate
-- problem wearing a new name.

-- ---------------------------------------------------------------------------
-- checkout_sessions
-- ---------------------------------------------------------------------------

alter table payments.checkout_sessions
  add column if not exists customer_creation text not null default 'if_required',
  add column if not exists customer_details jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'checkout_sessions_customer_creation_check'
  ) then
    alter table payments.checkout_sessions
      add constraint checkout_sessions_customer_creation_check
      check (customer_creation in ('if_required', 'always'));
  end if;
end $$;

comment on column payments.checkout_sessions.customer_creation is
  'if_required | always. Stripe''s parameter of the same name. `if_required` (the default, and Stripe''s for payment mode) materialises a guest customer on a successful one-off; `always` materialises a real one. Ignored when the session already has a customer_id — a subscription always does.';

comment on column payments.checkout_sessions.customer_details is
  'Who the payer said they are, collected on the hosted checkout: {name, phone, email}. Lives here rather than on a customer because for a one-off there is no customer yet — the record is created from this when the payment succeeds, which is the order Stripe uses and the order that stops abandoned links from manufacturing people.';

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

alter table payments.customers
  add column if not exists is_guest boolean not null default false;

comment on column payments.customers.is_guest is
  'A read-only grouping of one-off payments from the same payer, in Stripe''s sense: never has a saved card, cannot be charged again, and is listed separately from the customers a merchant bills. Promoted to a real customer (is_guest = false) if the merchant ever starts a subscription for them.';

-- Guest lookup on the two keys we can actually match. Partial so the index
-- stays small and only covers rows that can be matched at all — the vast
-- majority of customers are not guests.
create index if not exists customers_guest_phone_idx
  on payments.customers (org_id, environment, phone)
  where is_guest and phone is not null;

create index if not exists customers_guest_email_idx
  on payments.customers (org_id, environment, email)
  where is_guest and email is not null;

-- The Customers page reads "everyone who is not a guest" on every load, and the
-- Guests tab reads the complement.
create index if not exists customers_org_env_guest_idx
  on payments.customers (org_id, environment, is_guest);
