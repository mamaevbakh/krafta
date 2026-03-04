-- Ensure www callback is accepted by central auth for krafta-web client.
update public.auth_clients
set redirect_uris = (
  select array_agg(distinct uri)
  from unnest(
    redirect_uris || array[
      'https://www.krafta.org/auth/sso/callback'
    ]::text[]
  ) as uri
)
where client_id = 'krafta-web';
