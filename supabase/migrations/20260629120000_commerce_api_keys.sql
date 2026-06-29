-- Krafta Studio: public, key-gated commerce API keys.
--
-- Generated/ejected Studio shops cannot use the internal service-role or the
-- cookie anon-session path, so they authenticate to a public commerce API with
-- a per-shop key. This table is cloned from payments.api_keys (same hashing +
-- auth pattern as apps/krafta-pay/src/lib/api-keys.ts) with two additions:
--   * key_type  — 'publishable' (browser-safe: catalog read + scoped cart/
--                 checkout) vs 'secret' (server-only: + order list/webhooks).
--   * catalog_id — a publishable key binds ONE shop; the API derives org AND
--                 catalog from the key, never from the request body.
--
-- The public commerce API runs a service-role client behind the key gate, so
-- tenant isolation is an application invariant (org/catalog come from the key),
-- not RLS. Key issuance/rotation happens via a service-role server action gated
-- on organization_members owner/admin (same pattern as catalog uploads), so no
-- anon/authenticated policy is granted here; RLS is enabled deny-by-default.
--
-- NOT YET APPLIED to any branch — staged for review. After applying, regenerate
-- Database types so the `commerce.api_keys` table is typed (the auth code casts
-- around its absence until then).

create schema if not exists commerce;

create table if not exists commerce.api_keys (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    last_used_at timestamptz,
    org_id uuid not null references public.organizations (id) on delete cascade,
    catalog_id uuid references public.catalogs (id) on delete cascade,
    key_type text not null default 'publishable',
    environment text not null default 'test',
    name text not null,
    prefix text not null,
    last4 text not null,
    hashed_key text not null,
    metadata jsonb not null default '{}'::jsonb,
    constraint commerce_api_keys_key_type_check
        check (key_type in ('publishable', 'secret')),
    constraint commerce_api_keys_environment_check
        check (environment in ('test', 'live'))
);

create unique index if not exists commerce_api_keys_hashed_key_idx
    on commerce.api_keys (hashed_key);
create index if not exists commerce_api_keys_org_idx
    on commerce.api_keys (org_id);
create index if not exists commerce_api_keys_catalog_idx
    on commerce.api_keys (catalog_id);

alter table commerce.api_keys enable row level security;

-- Service-role only (the API authenticates the key with a service-role client,
-- which bypasses RLS). No anon/authenticated policy on purpose.
grant select, insert, update, delete on commerce.api_keys to service_role;
