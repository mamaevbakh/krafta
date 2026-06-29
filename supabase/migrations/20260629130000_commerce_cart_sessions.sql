-- Krafta Studio: headless cart sessions (the cart+checkout write-path identity bridge).
--
-- The storefront write path is RLS-scoped to a per-shopper ANONYMOUS Supabase
-- session (signInAnonymously cookie → auth.uid()). A headless commerce key has no
-- cookie session, so we bridge identity WITHOUT weakening RLS (approach A, see
-- apps/krafta/docs/krafta-studio-codegen-architecture.md → Layer 1.5):
--
--   POST /carts mints a fresh anonymous Supabase user, ensures its
--   commerce.customers row, and stores that user's refresh token here under an
--   opaque, random `cartToken` (only its SHA-256 hash is persisted). Every later
--   cart/checkout call resolves the row, refreshes the anon session, and runs the
--   EXISTING RLS-scoped write path as that anon user. The DB stays the isolation
--   boundary — no service-role + hand-written WHERE customer_id scoping.
--
-- This table holds the anon user's refresh token (sensitive) and is therefore
-- service-role-only: RLS enabled, deny-by-default, NO anon/authenticated policy.
-- The cartToken is never stored (only its hash), so a leaked row cannot be
-- replayed as a bearer cart token.
--
-- NOT YET APPLIED to any branch by `db push` — applied to the dev branch via the
-- Management API at build time; staged here for review + prod promotion. After
-- applying, regenerate Database types.

create schema if not exists commerce;

create table if not exists commerce.cart_sessions (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    last_used_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '30 days',
    token_hash text not null,
    customer_id uuid not null references commerce.customers (id) on delete cascade,
    auth_user_id uuid not null references auth.users (id) on delete cascade,
    org_id uuid not null references public.organizations (id) on delete cascade,
    catalog_id uuid not null references public.catalogs (id) on delete cascade,
    api_key_id uuid references commerce.api_keys (id) on delete set null,
    -- The anon user's refresh token: used server-side to rebuild an RLS-scoped
    -- session for this cart. Rotated on each refresh.
    refresh_token text not null,
    environment text not null default 'test',
    metadata jsonb not null default '{}'::jsonb,
    constraint commerce_cart_sessions_environment_check
        check (environment in ('test', 'live'))
);

create unique index if not exists commerce_cart_sessions_token_hash_idx
    on commerce.cart_sessions (token_hash);
create index if not exists commerce_cart_sessions_customer_idx
    on commerce.cart_sessions (customer_id);
create index if not exists commerce_cart_sessions_expires_idx
    on commerce.cart_sessions (expires_at);

alter table commerce.cart_sessions enable row level security;

-- Service-role only (the public commerce API resolves cart tokens with a
-- service-role client, which bypasses RLS — this table never authenticates the
-- shopper, it only maps an opaque token to a stored anon session). No
-- anon/authenticated policy on purpose: the refresh token must never be
-- readable by a shopper.
grant select, insert, update, delete on commerce.cart_sessions to service_role;
