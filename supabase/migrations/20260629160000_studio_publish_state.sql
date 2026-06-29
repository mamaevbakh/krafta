-- Krafta Studio: persist where a coded shop is published.
--
-- publish_shop (the eve tool) deploys the shop to the shared krafta-shops Vercel
-- project and aliases <slug>.krafta.org to that deployment. Until now the Vercel
-- alias was the only record of "this shop is live"; the dashboard had no way to
-- show the public URL across sessions. These columns store the publish result so
-- the builder can surface "Live at <url>" and a future Publish UI can reflect it.
--
-- record_studio_publish follows the same SECURITY DEFINER + search_path='' shape
-- as create_coded_shop; the org owner/admin check (via the catalog's org) is the
-- authorization boundary, since the function bypasses RLS.

alter table public.catalogs
  add column if not exists published_url text;

alter table public.catalogs
  add column if not exists vercel_deployment_url text;

alter table public.catalogs
  add column if not exists published_at timestamptz;

create or replace function public.record_studio_publish(
  p_catalog_id    uuid,
  p_published_url text,
  p_deployment_url text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_published_url is null or p_published_url !~ '^https?://' then
    raise exception 'published_url must be an http(s) URL' using errcode = '22023';
  end if;

  -- Authorization boundary: caller must own/administer the catalog's org.
  if not exists (
    select 1
      from public.catalogs c
      join public.organization_members om on om.org_id = c.org_id
     where c.id = p_catalog_id
       and om.user_id = v_user_id
       and om.role in ('owner', 'admin')
  ) then
    raise exception 'not authorized for catalog %', p_catalog_id using errcode = '42501';
  end if;

  update public.catalogs
     set published_url = p_published_url,
         vercel_deployment_url = p_deployment_url,
         published_at = now()
   where id = p_catalog_id;
end;
$$;

grant execute on function public.record_studio_publish(uuid, text, text) to authenticated;
