-- Stripe-like lifecycle alignment (phased)
--
-- Goal: keep Krafta Pay's BYO-acquirer model, but align core billing object statuses
-- and query performance with Stripe Billing semantics.
--
-- Notes:
-- - This migration expands enums/constraints only; it does not change runtime behavior.
-- - We intentionally keep current flows (Uzum bind-first + immediate open invoices).
-- - `draft` invoice status is added for future staged-finalization flows.

alter table payments.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table payments.subscriptions
  add constraint subscriptions_status_check
  check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'unpaid',
      'canceled'
    )
  );

alter table payments.invoices
  drop constraint if exists invoices_status_check;

alter table payments.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'open', 'paid', 'void', 'uncollectible'));

create index if not exists subscriptions_customer_plan_status_updated_idx
  on payments.subscriptions(org_id, customer_id, plan_id, status, updated_at desc, created_at desc);

create index if not exists invoices_subscription_status_created_idx
  on payments.invoices(subscription_id, status, created_at desc);

