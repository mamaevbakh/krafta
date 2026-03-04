-- Add www variants for first-party SSO callback URLs.
update public.auth_clients
set redirect_uris = (
  select array_agg(distinct uri)
  from unnest(
    redirect_uris || array[
      'https://www.krafta.org/auth/sso/callback',
      'https://www.krafta.uz/auth/sso/callback',
      'https://www.krafta.company/auth/sso/callback'
    ]::text[]
  ) as uri
)
where client_id = 'krafta-web';

update public.auth_clients
set redirect_uris = (
  select array_agg(distinct uri)
  from unnest(
    redirect_uris || array[
      'https://www.pay.krafta.org/auth/sso/callback',
      'https://www.pay.krafta.uz/auth/sso/callback',
      'https://www.pay.krafta.company/auth/sso/callback'
    ]::text[]
  ) as uri
)
where client_id = 'krafta-pay-web';
