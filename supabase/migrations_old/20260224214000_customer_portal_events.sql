-- Customer portal audit events (Stripe-like portal analytics/audit trail)
-- Complements payments.logs with portal-session scoped action records.

create table if not exists payments.customer_portal_events (
  id uuid primary key default gen_random_uuid(),
  customer_portal_session_id uuid not null references payments.customer_portal_sessions(id) on delete cascade,
  org_id uuid not null,
  customer_id uuid not null references payments.customers(id) on delete cascade,
  subscription_id uuid references payments.subscriptions(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_portal_events_session_idx
  on payments.customer_portal_events(customer_portal_session_id, created_at desc);

create index if not exists customer_portal_events_customer_idx
  on payments.customer_portal_events(customer_id, created_at desc);

create index if not exists customer_portal_events_subscription_idx
  on payments.customer_portal_events(subscription_id, created_at desc);

create index if not exists customer_portal_events_event_type_idx
  on payments.customer_portal_events(event_type, created_at desc);

alter table payments.customer_portal_events enable row level security;

do $$
begin
  create policy customer_portal_events_org_isolation
    on payments.customer_portal_events
    for all
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = customer_portal_events.org_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = customer_portal_events.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

