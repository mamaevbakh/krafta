-- Idempotency-Key storage for the public merchant API.
--
-- A merchant's backend retries. Today a retried POST /api/checkout_sessions
-- creates a second payment_intent, a second checkout_session and a second
-- payUrl, and nothing links them — so a customer can be shown two links for one
-- order and the merchant reconciles two rows for one sale.
--
-- The claim is the row itself: INSERT ... ON CONFLICT DO NOTHING means exactly
-- one caller wins, and the loser reads what the winner is doing. Deliberately
-- there is NO stale-claim reclaim window. A reclaim would let a request that is
-- merely slow be judged dead and re-run, which recreates the duplicate this
-- table exists to prevent — and the loser's write would then vanish silently.
-- An in-flight key answers 409; a genuinely wedged key ages out on the TTL
-- sweep below, far longer than any HTTP request can live.

create table if not exists payments.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  environment text not null,
  -- Scoped per endpoint so the same key reused against a different route is a
  -- different operation rather than a false replay.
  endpoint text not null,
  idempotency_key text not null,
  -- sha256 of the canonical request body. Same key + different body is a
  -- client bug worth reporting, not a replay worth serving.
  request_fingerprint text not null,
  status text not null default 'in_progress',
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint idempotency_keys_environment_check check (environment in ('test', 'live')),
  constraint idempotency_keys_status_check check (status in ('in_progress', 'completed'))
);

-- The claim. One row per (org, environment, endpoint, key) is what makes
-- ON CONFLICT DO NOTHING a mutual exclusion primitive.
create unique index if not exists idempotency_keys_scope_unique
  on payments.idempotency_keys (org_id, environment, endpoint, idempotency_key);

-- For the TTL sweep.
create index if not exists idempotency_keys_created_idx
  on payments.idempotency_keys (created_at);

alter table payments.idempotency_keys enable row level security;

-- No policies, by design. Every writer here is the service-role admin client
-- inside a route that has already authenticated the merchant's API key; there
-- is no browser path to this table and nothing for `authenticated` to do with
-- it. RLS on with zero policies is deny-by-default.

comment on table payments.idempotency_keys is
  'Idempotency-Key claims for the public merchant API. Claim-first: the unique index is the lock. No reclaim window — see the migration header.';
