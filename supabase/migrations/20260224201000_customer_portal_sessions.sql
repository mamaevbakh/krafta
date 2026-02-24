-- Stripe-like hosted customer portal sessions for Krafta Pay (BYO-acquirer).
-- Ephemeral session URLs that resolve to a hosted portal page in krafta-pay.

create table if not exists payments.customer_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  customer_id uuid not null references payments.customers(id) on delete cascade,
  token_hash text not null,
  status text not null default 'created',
  return_url text,
  flow_type text,
  flow_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_portal_sessions_status_check
    check (status in ('created', 'used', 'expired', 'revoked'))
);

create unique index if not exists customer_portal_sessions_token_hash_unique
  on payments.customer_portal_sessions(token_hash);

create index if not exists customer_portal_sessions_customer_idx
  on payments.customer_portal_sessions(customer_id, created_at desc);

create index if not exists customer_portal_sessions_expires_idx
  on payments.customer_portal_sessions(expires_at);

alter table payments.customer_portal_sessions enable row level security;

do $$
begin
  create policy customer_portal_sessions_org_isolation
    on payments.customer_portal_sessions
    for all
    using (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = customer_portal_sessions.org_id
          and m.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.organization_members m
        where m.org_id = customer_portal_sessions.org_id
          and m.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

