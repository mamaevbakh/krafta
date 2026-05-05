-- ============================================================================
-- Migration: Auth SSO Broker Tables
-- Date: 2026-03-05
-- Description:
--   Add first-party OAuth-style SSO tables for auth.krafta.org:
--   - auth_clients
--   - auth_authorization_codes
-- ============================================================================

create table if not exists public.auth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  name text not null,
  redirect_uris text[] not null default '{}',
  secret_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_clients_secret_hash_len check (char_length(secret_hash) = 64)
);

create table if not exists public.auth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.auth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  redirect_uri text not null,
  code_challenge text not null,
  challenge_method text not null default 'S256',
  scope text not null default 'openid profile email',
  next_url text null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint auth_authorization_codes_code_hash_len check (char_length(code_hash) = 64),
  constraint auth_authorization_codes_challenge_method check (challenge_method in ('S256'))
);

create index if not exists auth_authorization_codes_code_hash_idx
  on public.auth_authorization_codes (code_hash);

create index if not exists auth_authorization_codes_expires_at_idx
  on public.auth_authorization_codes (expires_at);

create index if not exists auth_authorization_codes_client_id_idx
  on public.auth_authorization_codes (client_id);

alter table public.auth_clients enable row level security;
alter table public.auth_authorization_codes enable row level security;

revoke all on table public.auth_clients from anon, authenticated;
revoke all on table public.auth_authorization_codes from anon, authenticated;

-- Dev defaults.
-- Rotate these secrets in production by updating secret_hash values.
insert into public.auth_clients (client_id, name, redirect_uris, secret_hash, is_active)
values
  (
    'krafta-web',
    'Krafta Web',
    array[
      'http://localhost:3000/auth/sso/callback',
      'https://krafta.org/auth/sso/callback'
    ],
    '4d0ddf9f84b0b52c433312cf7a5e5ec0e519152a6bc79513999e017b2ec2caa0',
    true
  ),
  (
    'krafta-pay-web',
    'Krafta Pay Web',
    array[
      'http://localhost:3001/auth/sso/callback',
      'https://pay.krafta.org/auth/sso/callback'
    ],
    '5b9a0f1a878676f606ea162551878c57d9073574648fa7ce9af7f1fa89295f3e',
    true
  )
on conflict (client_id) do update set
  name = excluded.name,
  redirect_uris = excluded.redirect_uris,
  secret_hash = excluded.secret_hash,
  is_active = excluded.is_active,
  updated_at = now();
