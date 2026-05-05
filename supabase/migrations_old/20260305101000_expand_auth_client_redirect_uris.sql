-- ============================================================================
-- Migration: Expand Auth Client Redirect URIs
-- Date: 2026-03-05
-- Description:
--   Ensure first-party SSO clients support additional production domains.
-- ============================================================================

update public.auth_clients
set
  redirect_uris = (
    select array_agg(distinct uri)
    from unnest(
      coalesce(redirect_uris, '{}') ||
      array[
        'http://localhost:3000/auth/sso/callback',
        'https://krafta.org/auth/sso/callback',
        'https://krafta.uz/auth/sso/callback',
        'https://krafta.company/auth/sso/callback'
      ]
    ) as uri
  ),
  updated_at = now()
where client_id = 'krafta-web';

update public.auth_clients
set
  redirect_uris = (
    select array_agg(distinct uri)
    from unnest(
      coalesce(redirect_uris, '{}') ||
      array[
        'http://localhost:3001/auth/sso/callback',
        'https://pay.krafta.org/auth/sso/callback',
        'https://pay.krafta.uz/auth/sso/callback',
        'https://pay.krafta.company/auth/sso/callback'
      ]
    ) as uri
  ),
  updated_at = now()
where client_id = 'krafta-pay-web';
