-- Stage 1 billing hardening for Krafta Pay (Uzum-first)

create schema if not exists payments;

-- Status constraints
do $$
begin
  alter table payments.subscriptions
    add constraint subscriptions_status_check
    check (status in ('incomplete','active','past_due','canceled','incomplete_expired'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table payments.invoices
    add constraint invoices_status_check
    check (status in ('open','paid','void','uncollectible'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table payments.payment_intents
    add constraint payment_intents_status_check
    check (status in ('requires_payment_method','requires_action','processing','succeeded','failed','canceled'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table payments.checkout_sessions
    add constraint checkout_sessions_status_check
    check (status in ('open','completed','expired','canceled'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table payments.payment_attempts
    add constraint payment_attempts_status_check
    check (status in ('initialized','requires_action','processing','succeeded','failed','canceled'));
exception when duplicate_object then null;
end $$;

-- Idempotency and uniqueness
create unique index if not exists payment_events_provider_event_unique
  on payments.payment_events(provider_id, provider_event_id)
  where provider_event_id is not null;

create unique index if not exists payment_attempts_provider_payment_unique
  on payments.payment_attempts(provider_id, provider_payment_id)
  where provider_payment_id is not null;

create unique index if not exists invoices_subscription_period_unique
  on payments.invoices(subscription_id, billing_period_start, billing_period_end)
  where billing_period_start is not null and billing_period_end is not null;

-- RLS baseline
alter table payments.plans enable row level security;
alter table payments.subscriptions enable row level security;
alter table payments.invoices enable row level security;
alter table payments.payment_intents enable row level security;
alter table payments.checkout_sessions enable row level security;
alter table payments.payment_attempts enable row level security;
alter table payments.payment_events enable row level security;
alter table payments.org_provider_accounts enable row level security;
alter table payments.org_provider_account_secrets enable row level security;
alter table payments.payment_methods enable row level security;
alter table payments.customers enable row level security;

-- Shared org membership predicate
do $$
begin
  create policy plans_org_isolation
    on payments.plans
    for all
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = plans.org_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = plans.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy subscriptions_org_isolation
    on payments.subscriptions
    for all
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = subscriptions.org_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = subscriptions.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy invoices_org_isolation
    on payments.invoices
    for all
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = invoices.org_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = invoices.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

